#!/usr/bin/env node
/**
 * handshake_quick_apply.mjs — Handshake Quick Apply automation via Chrome DevTools Protocol
 *
 * Prerequisites: Chrome open with --remote-debugging-port=9334, logged into Handshake.
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *     --remote-debugging-port=9334 \
 *     --user-data-dir="$HOME/.config/handshake-chrome-profile" \
 *     --no-first-run https://app.joinhandshake.com &
 *   sleep 3
 *
 * Usage:
 *   node scripts/handshake_quick_apply.mjs \
 *     --job-url "https://app.joinhandshake.com/stu/jobs/12345678" \
 *     --resume  "/absolute/path/to/resume.pdf" \
 *    [--dry-run]
 *    [--port 9334]
 *
 * Stdout: single JSON line
 *   success          → { success: true,  company, title, url }
 *   ineligible       → { success: false, reason: "reposted"|"too_old"|"apply_externally"|"no_quick_apply" }
 *   simplified_modal → { success: false, reason: "simplified_modal", message: "..." }
 *   unknown_qs       → { success: false, reason: "unknown_questions", unknownQuestions: [...] }
 *   error            → { success: false, reason: "error", message: "..." }
 *
 * Exit 0 always (check JSON `success`); exit 1 on unrecoverable startup error.
 */

import http from 'node:http';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadProfile, answerValues, blocklistRegex, browserConfig, ProfileError } from './lib/profile.mjs';

// ── CLI ──────────────────────────────────────────────────────────────────────
const { values: flags } = parseArgs({
  options: {
    'job-url': { type: 'string' },
    resume:    { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    port:      { type: 'string' },
  },
  strict: false,
});

const JOB_URL  = flags['job-url'];
const RESUME   = flags.resume ? flags.resume.replace(/^~/, os.homedir()) : null;
const DRY_RUN  = flags['dry-run'];

function fail(obj) { console.log(JSON.stringify(obj)); process.exit(0); }

// ── Operator profile ─────────────────────────────────────────────────────────
// Identity and application answers come from profile/profile.yaml, never from this file.
let PROFILE, A, BLOCKLIST;
try {
  PROFILE   = loadProfile();
  A         = answerValues(PROFILE);
  BLOCKLIST = blocklistRegex(PROFILE);
} catch (err) {
  if (err instanceof ProfileError) fail({ success: false, reason: 'no_profile', message: err.message });
  throw err;
}

const CDP_PORT = parseInt(flags.port ?? browserConfig(PROFILE, 'handshake', 9334).port, 10);

if (!JOB_URL)  fail({ success: false, reason: 'error', message: '--job-url required' });
if (!DRY_RUN && !RESUME) fail({ success: false, reason: 'error', message: '--resume required unless --dry-run' });
if (RESUME && !existsSync(RESUME)) fail({ success: false, reason: 'error', message: `resume not found: ${RESUME}` });

// ── CDP connection (same pattern as linkedin_easy_apply.mjs) ─────────────────
function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`Bad JSON from ${path}: ${body.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

async function connect(port) {
  const tabs = await httpGet(port, '/json/list');
  const target =
    tabs.find(t => t.type === 'page' && t.url.includes('joinhandshake.com')) ||
    tabs.find(t => t.type === 'page');
  if (!target) throw new Error('No page found. Is Chrome running with --remote-debugging-port=' + port + '?');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  });

  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { resolve: res, reject: rej });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  const close = () => ws.close();

  const eval_ = async (expr, timeout = 10000) => {
    const result = await Promise.race([
      send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
      sleep(timeout).then(() => { throw new Error(`eval timeout: ${expr.slice(0, 60)}`); }),
    ]);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value ?? null;
  };

  const navigate = async (url) => {
    await send('Page.navigate', { url });
    await Promise.race([
      new Promise(res => {
        const listener = ev => {
          const msg = JSON.parse(ev.data);
          if (msg.method === 'Page.loadEventFired') { ws.removeEventListener('message', listener); res(); }
        };
        ws.addEventListener('message', listener);
      }),
      sleep(10000),
    ]);
  };

  const uploadFile = async (selector, filePath) => {
    // Use DOM.querySelector (returns nodeId directly, avoids objectId staleness issues)
    const doc = await send('DOM.getDocument', { depth: 1 });
    const rootId = doc.root?.nodeId;
    if (!rootId) throw new Error('DOM.getDocument failed');
    const queryResult = await send('DOM.querySelector', { nodeId: rootId, selector });
    const nodeId = queryResult.nodeId;
    if (!nodeId) throw new Error(`File input not found via DOM.querySelector: ${selector}`);
    await send('DOM.setFileInputFiles', { nodeId, files: [filePath] });
    await sleep(1500);
  };

  const waitFor = async (exprFn, timeout = 10000, interval = 400) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const v = await eval_(exprFn);
      if (v) return v;
      await sleep(interval);
    }
    return null;
  };

  return { eval: eval_, navigate, uploadFile, waitFor, close };
}

// ── Eligibility check ────────────────────────────────────────────────────────
const ELIGIBILITY_JS = `
(function() {
  const text = document.body.innerText;

  // Title — try several selectors Handshake uses
  const titleEl =
    document.querySelector('[data-hook="job-title"] h1') ||
    document.querySelector('h1[data-hook]') ||
    document.querySelector('.posting-headline h1') ||
    document.querySelector('h1');
  const title = titleEl?.innerText?.trim() || '';

  // Company
  const companyEl =
    document.querySelector('[data-hook="employer-profile-link"]') ||
    document.querySelector('[data-hook="employer-name"]') ||
    document.querySelector('a[href*="/employers/"]') ||
    document.querySelector('.employer-name');
  const company = companyEl?.innerText?.trim() || '';

  // Posted time — scan all short text nodes for time patterns
  let posted = '';
  const allEls = [...document.querySelectorAll('span, p, div, li, time, small')];
  for (const el of allEls) {
    if (el.children.length > 3) continue; // skip container elements
    const t = (el.innerText || '').trim();
    if (t.length > 200) continue; // skip large containers
    if (/^(posted\\s+)?\\d+\\s*(minute|hour|day|week|month)s?\\s*ago/i.test(t) || /^just now$/i.test(t)) {
      posted = t.replace(/^posted\\s+/i, '').split('\\u2219')[0].split('\\u00b7')[0].trim();
      break;
    }
  }
  // broader scan: any element containing "X hours/minutes/days ago" (no children-count limit)
  if (!posted) {
    for (const el of allEls) {
      const t = (el.innerText || '').trim();
      if (t.length > 300) continue;
      const m2 = t.match(/posted\\s+(\\d+\\s*(?:minute|hour|day|week|month)s?\\s*ago)/i);
      if (m2) { posted = m2[1]; break; }
    }
  }
  // fallback: scan body text for time pattern
  if (!posted) {
    const bodyMatch = text.match(/posted\\s+(\\d+\\s*(?:minute|hour|day|week|month)s?\\s*ago|just now)/i);
    if (bodyMatch) posted = bodyMatch[1];
  }

  const reposted = /reposted/i.test(text.slice(0, 5000));

  // Parse age hours (use 9999 instead of Infinity — Infinity can't serialize via CDP returnByValue)
  let ageHours = 9999;
  const m = posted.match(/(\\d+)\\s*(minute|hour|day|week|month)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit.startsWith('minute')) ageHours = n / 60;
    else if (unit.startsWith('hour'))   ageHours = n;
    else if (unit.startsWith('day'))    ageHours = n * 24;
    else if (unit.startsWith('week'))   ageHours = n * 24 * 7;
    else if (unit.startsWith('month'))  ageHours = n * 24 * 30;
  } else if (/just now/i.test(posted)) {
    ageHours = 0;
  }

  // Apply button detection
  const allBtns = [...document.querySelectorAll('button, a')];
  const applyBtn = allBtns.find(b => {
    const txt = (b.innerText || b.textContent || '').trim();
    const aria = b.getAttribute('aria-label') || '';
    return /^(quick\s+)?apply$/i.test(txt) || /quick.?apply/i.test(aria);
  });
  const externalBtn = allBtns.find(b => {
    const txt = (b.innerText || b.textContent || '').trim();
    return /apply externally|apply on company|apply at\b/i.test(txt);
  });

  const hasQuickApply = !!applyBtn;
  const isExternal    = !hasQuickApply && !!externalBtn;

  return { title, company, posted, reposted, ageHours, hasQuickApply, isExternal };
})()
`;

// ── Known answers for Handshake custom questions ─────────────────────────────
// Patterns are generic; values come from profile/profile.yaml. Entries whose value is null are
// dropped, so a question the operator has not answered stops the run instead of being guessed.
const KNOWN_ANSWERS = [
  { pattern: /legally\s+authorized|authorized\s+to\s+work|work\s+authorization|eligible\s+to\s+work/i,
    value: A.authorizedToWork },
  { pattern: /sponsor|visa\s+sponsorship|immigration|require.*sponsorship|need.*sponsor/i,
    value: A.requiresSponsorship },
  { pattern: /us\s+citizen|united\s+states\s+citizen|permanent\s+resident/i,
    value: A.usCitizenOrPr },
  { pattern: /willing\s+to\s+reloca|relocation/i,
    value: A.willingToRelocate },
  { pattern: /background\s+check/i,
    value: A.backgroundCheck },
  { pattern: /drug\s+test/i,
    value: A.drugTest },
  { pattern: /gpa|grade\s+point/i,
    value: A.gpa },
  { pattern: /graduation|expected\s+grad/i,
    value: A.graduationDate },
  { pattern: /phone|telephone/i,
    value: A.phone },
  { pattern: /years?\s+of\s+experience|experience.*years?/i,
    value: A.yearsOfExperience },
  { pattern: /salary|compensation|desired.*pay/i,
    value: A.salary },
].filter((a) => a.value !== null && a.value !== undefined);

function matchAnswer(label) {
  for (const entry of KNOWN_ANSWERS) {
    if (entry.pattern.test(label.trim())) return entry.value;
  }
  return null;
}

// ── Main apply flow ──────────────────────────────────────────────────────────
async function applyToJob(cdp, jobUrl, resumePath) {
  // 1. Navigate
  await cdp.navigate(jobUrl);
  // Wait for React to render the job detail (title or apply button)
  await cdp.waitFor(
    `!!document.querySelector('h1') && !!document.querySelector('button, a[href]')`,
    15000, 500
  );
  await sleep(3000); // extra wait for split-pane job detail to render

  // 2. Eligibility check
  let meta = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    meta = await cdp.eval(ELIGIBILITY_JS);
    if (meta && (meta.title || attempt === 2)) break;
    await sleep(2000);
  }
  if (!meta) fail({ success: false, reason: 'error', message: 'Failed to read job page' });

  const { title, company, posted, reposted, hasQuickApply, isExternal } = meta;
  const ageHours = meta.ageHours ?? 9999;
  process.stderr.write(`[job] ${company} | ${title} | posted: ${posted || 'unknown'} (${ageHours.toFixed(1)}h ago)\n`);

  if (BLOCKLIST && BLOCKLIST.test(company)) fail({ success: false, reason: 'blocklisted', company, title });
  if (reposted)      fail({ success: false, reason: 'reposted',       company, title });
  if (ageHours > 24) fail({ success: false, reason: 'too_old',        company, title, posted });
  if (isExternal)    fail({ success: false, reason: 'apply_externally', company, title });
  if (!hasQuickApply) fail({ success: false, reason: 'no_quick_apply', company, title });

  if (DRY_RUN) {
    console.log(JSON.stringify({ success: false, reason: 'dry_run', company, title, url: jobUrl }));
    process.exit(0);
  }

  // 3. Click Apply / Quick Apply
  const clickResult = await cdp.eval(`
  (function() {
    const btn = [...document.querySelectorAll('button, a')].find(b => {
      const txt = (b.innerText || b.textContent || '').trim();
      const aria = b.getAttribute('aria-label') || '';
      return /^(quick\s+)?apply$/i.test(txt) || /quick.?apply/i.test(aria);
    });
    if (!btn) return 'not_found';
    if (btn.disabled) return 'disabled';
    btn.click();
    return 'ok';
  })()`);
  process.stderr.write(`[click] Apply: ${clickResult}\n`);
  if (clickResult !== 'ok') fail({ success: false, reason: 'error', message: `Apply click: ${clickResult}` });

  await sleep(1200);

  // 4. Close "It's better on the app" promo modal if it appears
  const appModalClosed = await cdp.eval(`
  (function() {
    const bodyText = document.body.innerText;
    if (!/better.*app|app.*better|download.*app/i.test(bodyText)) return 'no_promo';
    const btns = [...document.querySelectorAll('button')];
    const closeBtn =
      btns.find(b => /close modal/i.test(b.getAttribute('aria-label') || '')) ||
      btns.find(b => /^close$/i.test((b.innerText || '').trim())) ||
      btns.find(b => /^(×|✕|✖)$/.test((b.innerText || b.textContent || '').trim()));
    if (closeBtn) { closeBtn.click(); return 'closed'; }
    return 'no_close_btn';
  })()`);
  if (appModalClosed === 'closed') {
    process.stderr.write(`[modal] closed "It's better on the app" promo\n`);
    await sleep(600);
  }

  // 5. Wait for Quick Apply modal to appear
  const modalFound = await cdp.waitFor(`
    [...document.querySelectorAll('div[role="dialog"], [class*="modal"], [class*="overlay"]')]
      .some(d => /apply|resume|upload|submit/i.test(d.innerText || ''))
  `, 12000);
  if (!modalFound) fail({ success: false, reason: 'error', message: 'Quick Apply modal did not appear' });
  await sleep(600);

  // 6. Detect modal type: rich (has upload) vs simplified (submit-only)
  const modalInfo = await cdp.eval(`
  (function() {
    const modal =
      [...document.querySelectorAll('div[role="dialog"]')].find(d => /apply|resume/i.test(d.innerText || '')) ||
      [...document.querySelectorAll('[class*="modal"]')].find(d => /apply|resume/i.test(d.innerText || ''));
    if (!modal) return { found: false };

    const allEls = [...modal.querySelectorAll('button, label, span, a, div')];
    const hasUploadNew = allEls.some(el =>
      /upload new|upload resume|choose file/i.test((el.innerText || el.textContent || '').trim())
    );
    const fileInput = modal.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
    const submitBtn = [...modal.querySelectorAll('button')].find(b =>
      /submit\s*application|submit$/i.test((b.innerText || '').trim())
    );
    const hasDefault = allEls.some(el =>
      /resume_\w+|\.(pdf|docx)/i.test((el.innerText || el.textContent || '').trim())
    );
    const requiresTranscript = /transcript/i.test(modal.innerText || '');
    const requiresCoverLetter = /cover letter/i.test(modal.innerText || '');

    return {
      found: true,
      hasUploadNew,
      hasFileInput: !!fileInput,
      hasSubmitBtn: !!submitBtn,
      hasDefault,
      requiresTranscript,
      requiresCoverLetter,
      simplifiedModal: !hasUploadNew && !fileInput && !!submitBtn,
    };
  })()`);

  process.stderr.write(`[modal] ${JSON.stringify(modalInfo)}\n`);
  if (!modalInfo.found) fail({ success: false, reason: 'error', message: 'Could not locate apply modal' });

  // Simplified modal trap — no upload option, would submit with default resume
  if (modalInfo.simplifiedModal) {
    fail({
      success: false,
      reason: 'simplified_modal',
      company,
      title,
      message: 'Modal has no upload option. Upload tailored PDF to Handshake docs and set as default before applying, then re-run.',
    });
  }

  // 7. Remove pre-attached default resume if present
  if (modalInfo.hasDefault) {
    const removed = await cdp.eval(`
    (function() {
      const modal =
        [...document.querySelectorAll('div[role="dialog"]')].find(d => /apply|resume/i.test(d.innerText || '')) ||
        [...document.querySelectorAll('[class*="modal"]')].find(d => /apply|resume/i.test(d.innerText || ''));
      if (!modal) return 'no_modal';
      const removeBtn = [...modal.querySelectorAll('button, [role="button"], span')].find(b =>
        /^(remove|delete|×|✕|✖)$/i.test((b.innerText || b.textContent || '').trim()) ||
        /remove.*resume|delete.*resume/i.test(b.getAttribute('aria-label') || '')
      );
      if (removeBtn) { removeBtn.click(); return 'removed'; }
      return 'not_found';
    })()`);
    process.stderr.write(`[remove-default] ${removed}\n`);
    if (removed === 'removed') await sleep(500);
  }

  // 8. Click "Upload new" / "Upload resume" to activate file input (only if modal has file input)
  if (modalInfo.hasFileInput) {
    await cdp.eval(`
    (function() {
      const el = [...document.querySelectorAll('button, label, span, a')].find(el =>
        /upload new|upload resume|choose.*file/i.test((el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim())
      );
      if (el) el.click();
    })()`);
    await sleep(700);

    // 9. Upload tailored PDF
    process.stderr.write(`[upload] ${resumePath}\n`);
    try {
      await cdp.uploadFile('input[type="file"]', resumePath);
    } catch (e) {
      fail({ success: false, reason: 'error', message: `Upload failed: ${e.message}` });
    }
  } else {
    process.stderr.write(`[upload] skipped — modal uses document library (no file input)\n`);
  }

  // 10. Wait for "Converting..." to finish (only when file was uploaded)
  if (modalInfo.hasFileInput) {
    await sleep(1000);
    await cdp.waitFor(`
      !/converting|uploading|processing/i.test(
        ([...document.querySelectorAll('div[role="dialog"], [class*="modal"]')]
          .find(d => /apply|resume/i.test(d.innerText || '')) || document.body
        ).innerText || ''
      )
    `, 20000, 600);
    await sleep(800);
  }

  // 11. Confirm "Set as default" is unchecked
  await cdp.eval(`
  (function() {
    const cbs = [...document.querySelectorAll('input[type="checkbox"]')];
    for (const cb of cbs) {
      const lbl = (
        document.querySelector('label[for="' + cb.id + '"]')?.innerText ||
        cb.closest('label')?.innerText || ''
      );
      if (/set as default|make.*default/i.test(lbl) && cb.checked) {
        cb.click();
      }
    }
  })()`);

  // 12. Handle extra required docs (transcript / cover letter) — select pre-uploaded ones
  if (modalInfo.requiresTranscript) {
    process.stderr.write(`[docs] selecting pre-uploaded transcript\n`);
    await cdp.eval(`
    (function() {
      // Click into the transcript combobox / search input
      const input = [...document.querySelectorAll('input')].find(el =>
        /transcript/i.test(el.getAttribute('placeholder') || el.getAttribute('aria-label') || '')
      );
      if (input) {
        input.click();
        input.focus();
        return;
      }
      // Or click a "Search transcripts" button
      const btn = [...document.querySelectorAll('button, [role="button"]')].find(b =>
        /transcript/i.test((b.innerText || b.textContent || '').trim())
      );
      if (btn) btn.click();
    })()`);
    await sleep(800);
    // Select first option that appears
    await cdp.eval(`
    (function() {
      const opt =
        document.querySelector('[role="option"]') ||
        document.querySelector('li[data-value]') ||
        [...document.querySelectorAll('li, div[role="menuitem"]')].find(el =>
          /transcript|\.pdf/i.test((el.innerText || '').trim())
        );
      if (opt) opt.click();
    })()`);
    await sleep(600);
  }

  if (modalInfo.requiresCoverLetter) {
    process.stderr.write(`[docs] selecting pre-uploaded cover letter\n`);
    await cdp.eval(`
    (function() {
      const input = [...document.querySelectorAll('input')].find(el =>
        /cover letter/i.test(el.getAttribute('placeholder') || el.getAttribute('aria-label') || '')
      );
      if (input) { input.click(); input.focus(); return; }
      const btn = [...document.querySelectorAll('button, [role="button"]')].find(b =>
        /cover letter/i.test((b.innerText || b.textContent || '').trim())
      );
      if (btn) btn.click();
    })()`);
    await sleep(800);
    await cdp.eval(`
    (function() {
      const opt =
        document.querySelector('[role="option"]') ||
        [...document.querySelectorAll('li, div[role="menuitem"]')].find(el =>
          /cover|\.pdf/i.test((el.innerText || '').trim())
        );
      if (opt) opt.click();
    })()`);
    await sleep(600);
  }

  // 13. Handle any custom questions in the modal
  const questions = await cdp.eval(`
  (function() {
    const modal =
      [...document.querySelectorAll('div[role="dialog"]')].find(d => /apply|resume/i.test(d.innerText || '')) ||
      document.body;
    const fields = [];
    // Radio groups
    modal.querySelectorAll('fieldset, [role="radiogroup"]').forEach(fs => {
      const legend = fs.querySelector('legend, [role="group"] > label')?.innerText?.trim();
      if (!legend) return;
      const radios = [...fs.querySelectorAll('input[type="radio"]')];
      if (!radios.length) return;
      fields.push({ type: 'radio', label: legend,
        radios: radios.map(r => ({
          id: r.id,
          label: (document.querySelector('label[for="' + r.id + '"]')?.innerText || r.value || '').trim(),
          checked: r.checked,
        }))
      });
    });
    // Text inputs
    modal.querySelectorAll('input[type="text"], input[type="number"], textarea').forEach(inp => {
      const lbl = (
        (inp.id ? document.querySelector('label[for="' + inp.id + '"]')?.innerText : '') ||
        inp.getAttribute('placeholder') || inp.getAttribute('aria-label') || ''
      ).trim();
      if (!lbl) return;
      fields.push({ type: inp.type || 'text', id: inp.id, label: lbl, value: inp.value });
    });
    return fields;
  })()`);

  const unknownQuestions = [];
  if (questions && questions.length) {
    process.stderr.write(`[questions] ${questions.length} field(s) found\n`);
    for (const q of questions) {
      const ans = matchAnswer(q.label);
      if (q.type === 'radio') {
        if (!ans) {
          const hasYesNo = q.radios.some(r => /^yes$/i.test(r.label));
          unknownQuestions.push({ label: q.label, type: 'radio', options: q.radios.map(r => r.label) });
          if (!hasYesNo) continue;
        }
        const target = ans || 'Yes';
        const radio = q.radios.find(r =>
          r.label.toLowerCase().includes(target.toLowerCase()) ||
          target.toLowerCase().includes(r.label.toLowerCase())
        );
        if (radio && !radio.checked) {
          await cdp.eval(`
          (function() {
            const r = document.getElementById(${JSON.stringify(radio.id)});
            if (r) r.click();
          })()`);
          process.stderr.write(`[radio] "${q.label}" → "${radio.label}"\n`);
          await sleep(300);
        }
      } else {
        if (!ans) {
          if (q.value && q.value.trim()) {
            process.stderr.write(`[text] "${q.label}" pre-filled as "${q.value}", skipping\n`);
          } else {
            unknownQuestions.push({ label: q.label, type: q.type });
          }
          continue;
        }
        if (q.value !== ans) {
          await cdp.eval(`
          (function() {
            const inp = document.getElementById(${JSON.stringify(q.id)});
            if (!inp) return;
            const setter = Object.getOwnPropertyDescriptor(
              inp.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
              'value'
            ).set;
            setter.call(inp, ${JSON.stringify(String(ans))});
            inp.dispatchEvent(new Event('input',  { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new Event('blur',   { bubbles: true }));
          })()`);
          process.stderr.write(`[text] "${q.label}" → "${ans}"\n`);
          await sleep(200);
        }
      }
    }
  }

  if (unknownQuestions.length > 0) {
    // Close modal without submitting
    await cdp.eval(`
    (function() {
      const btn = [...document.querySelectorAll('button')].find(b =>
        /close|dismiss|cancel/i.test(b.getAttribute('aria-label') || b.innerText || '')
      );
      if (btn) btn.click();
    })()`);
    return { success: false, reason: 'unknown_questions', company, title, url: jobUrl, unknownQuestions };
  }

  // 14. Handle multi-step modal: click Next until Submit Application appears
  for (let step = 0; step < 5; step++) {
    const hasSubmit = await cdp.eval(`
      !!([...document.querySelectorAll('button')].find(b =>
        /submit\\s*application|^submit$/i.test((b.innerText || '').trim()) && !b.disabled
      ))`);
    if (hasSubmit) break;
    const clickedNext = await cdp.eval(`
      (function() {
        const btn = [...document.querySelectorAll('button')].find(b =>
          /^next(next)?$/i.test((b.innerText || '').trim().replace(/\\s+/g,'')) && !b.disabled
        );
        if (btn) { btn.click(); return 'ok'; }
        return 'not_found';
      })()`);
    process.stderr.write('[next] step ' + step + ': ' + clickedNext + '\n');
    if (clickedNext !== 'ok') break;
    await sleep(800);
  }

  await sleep(400);
  const submitResult = await cdp.eval(`
  (function() {
    const btn = [...document.querySelectorAll('button')].find(b =>
      /submit\\s*application|^submit$/i.test((b.innerText || '').trim()) && !b.disabled
    );
    if (!btn) return 'not_found';
    btn.click();
    return 'ok';
  })()`);
  process.stderr.write(`[submit] ${submitResult}\n`);

  if (submitResult !== 'ok') {
    fail({ success: false, reason: 'error', message: `Submit: ${submitResult}`, company, title });
  }

  // 15. Wait for success confirmation
  const success = await cdp.waitFor(
    `/application submitted|applied on|successfully applied/i.test(document.body.innerText)`,
    15000, 500
  );

  return { success: !!success, company, title, url: jobUrl };
}

// ── Entry point ──────────────────────────────────────────────────────────────
let cdp;
try {
  cdp = await connect(CDP_PORT);
} catch (e) {
  fail({ success: false, reason: 'error', message: `CDP connect failed: ${e.message}. Is Chrome running with --remote-debugging-port=${CDP_PORT}?` });
}

try {
  const result = await applyToJob(cdp, JOB_URL, RESUME);
  console.log(JSON.stringify(result));
} catch (e) {
  console.log(JSON.stringify({ success: false, reason: 'error', message: e.message }));
} finally {
  cdp.close();
}
