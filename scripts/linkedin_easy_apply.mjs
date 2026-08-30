#!/usr/bin/env node
/**
 * linkedin_easy_apply.mjs — LinkedIn Easy Apply automation via Chrome DevTools Protocol
 *
 * ⚠️  Automating LinkedIn may violate its User Agreement and can get an account restricted.
 *     Personal use, at your own risk. Always --dry-run first.
 *
 * Prerequisites:
 *   1. profile/profile.yaml filled in (cp -r profile.example profile). All identity and
 *      application answers are read from there; nothing personal is hardcoded in this file.
 *   2. Chrome running with --remote-debugging-port=9333, already logged into LinkedIn by hand.
 *      This script attaches to that browser; it never handles your password or cookies.
 *
 * Usage:
 *   node scripts/linkedin_easy_apply.mjs \
 *     --job-url "https://www.linkedin.com/jobs/view/<JOB_ID>" \
 *     --resume  "/absolute/path/to/tailored-resume.pdf" \
 *    [--salary 95000]          # overrides compensation.salary_expectation
 *    [--extra-answers '{"How did you hear about us": "LinkedIn job posting"}']
 *    [--dry-run]               # check eligibility only, never submits
 *    [--port 9333]
 *
 * Stdout: single JSON line
 *   success     → { success: true,  company, title, url }
 *   ineligible  → { success: false, reason: "reposted"|"too_old"|"no_easy_apply"|"blocklisted" }
 *   no profile  → { success: false, reason: "no_profile", message }
 *   blocked     → { success: false, reason: "unknown_questions", unknownQuestions: [{label, type, options?}] }
 *   error       → { success: false, reason: "error", message }
 *
 * Exit 0 always (check JSON `success`); exit 1 on unrecoverable startup error.
 */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadProfile, answerValues, blocklistRegex, browserConfig, ProfileError } from './lib/profile.mjs';

// ── CLI args ────────────────────────────────────────────────────────────────
const { values: flags } = parseArgs({
  options: {
    'job-url':       { type: 'string' },
    resume:          { type: 'string' },
    salary:          { type: 'string' },
    'extra-answers': { type: 'string', default: '{}' },
    'dry-run':       { type: 'boolean', default: false },
    port:            { type: 'string' },
  },
  strict: false,
});

const JOB_URL    = flags['job-url'];
const RESUME     = flags.resume ? path.resolve(flags.resume.replace(/^~/, os.homedir())) : null;
const DRY_RUN    = flags['dry-run'];
let   EXTRA      = {};
try { EXTRA = JSON.parse(flags['extra-answers']); } catch { /* ignored */ }

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

const CDP_PORT = parseInt(flags.port ?? browserConfig(PROFILE, 'linkedin', 9333).port, 10);
const SALARY   = flags.salary ?? A.salary;

if (!JOB_URL) fail({ success: false, reason: 'error', message: '--job-url required' });
if (!DRY_RUN && !RESUME) fail({ success: false, reason: 'error', message: '--resume required unless --dry-run' });
if (RESUME && !existsSync(RESUME)) fail({ success: false, reason: 'error', message: `resume not found: ${RESUME}` });

// ── Known answers ────────────────────────────────────────────────────────────
// Each entry: { pattern (regex on label text), type, value }
// type: 'yes-no-radio' | 'text' | 'select-match'
// For 'yes-no-radio': value is 'Yes' or 'No'
// For 'text': value is the string to type
// For 'select-match': value is a substring that should match one of the options (case-insensitive)
// Entries whose `value` resolves to null are dropped below: a null means the operator declined to
// supply that answer, so the question becomes an unknownQuestion and the run stops. Never guessed.
const KNOWN_ANSWERS = [
  // Work authorization
  { pattern: /legally\s+authorized|authorized\s+to\s+work|work\s+authorization|eligible\s+to\s+work/i,
    type: 'yes-no-radio', value: A.authorizedToWork },

  // Sponsorship
  { pattern: /sponsor|visa\s+sponsorship|immigration\s+sponsor|require.*sponsorship|sponsorship.*require|need.*sponsor|work.*permit.*sponsor/i,
    type: 'yes-no-radio', value: A.requiresSponsorship },

  // Relocate
  { pattern: /willing\s+to\s+reloca|relocation/i,
    type: 'yes-no-radio', value: A.willingToRelocate },

  // Background check
  { pattern: /background\s+check/i,
    type: 'yes-no-radio', value: A.backgroundCheck },

  // Drug test
  { pattern: /drug\s+test/i,
    type: 'yes-no-radio', value: A.drugTest },

  // Have a degree / bachelor's — derived from profile education.highest_degree
  { pattern: /bachelor|undergraduate\s+degree|have\s+a\s+degree/i,
    type: 'yes-no-radio', value: A.hasBachelors },

  // Currently enrolled / in school — derived from whether graduation_date is still in the future
  { pattern: /currently\s+enrolled|currently\s+attending|in\s+school/i,
    type: 'yes-no-radio', value: A.currentlyEnrolled },

  // US citizen / permanent resident — often framed as yes/no
  { pattern: /us\s+citizen|united\s+states\s+citizen|permanent\s+resident/i,
    type: 'yes-no-radio', value: A.usCitizenOrPr },

  // Phone
  { pattern: /mobile\s+phone|phone\s+number|telephone|^phone\*?$/i,
    type: 'text', value: A.phone },

  // Years of experience ("years of work experience", "years of professional experience", …)
  { pattern: /\byears?\b.{0,25}\bexperience\b|\bexperience\b.{0,30}\byears?\b/i,
    type: 'text', value: A.yearsOfExperience },

  // Salary / compensation
  { pattern: /salary|compensation|pay\s+expectation|desired.*pay/i,
    type: 'text', value: SALARY },

  // GPA — commonly null, in which case the question stops the run rather than inventing a number
  { pattern: /\bgpa\b|grade\s+point/i,
    type: 'text', value: A.gpa },

  // Graduation date
  { pattern: /graduat|expected\s+completion|degree\s+date/i,
    type: 'text', value: A.graduationDate },

  // First name
  { pattern: /^first\s+name$|^given\s+name$/i,
    type: 'text', value: A.firstName },

  // Last name
  { pattern: /^last\s+name$|^family\s+name$|^surname$/i,
    type: 'text', value: A.lastName },

  // Full name
  { pattern: /^(full\s+)?name$/i,
    type: 'text', value: A.fullName },

  // Email
  { pattern: /^email(\s+address)?$/i,
    type: 'text', value: A.email },

  // City / location
  { pattern: /^city$/i,
    type: 'text', value: A.city },

  // LinkedIn profile URL
  { pattern: /linkedin.*profile|linkedin.*url/i,
    type: 'text', value: A.linkedinUrl },

  // Job preference / "I'm looking for"
  { pattern: /looking for|job.*preference|job.*type|what.*role|what.*position/i,
    type: 'text', value: A.jobPreference },

  // How did you hear about us
  { pattern: /hear.*about|how.*find.*job|referral|source/i,
    type: 'text', value: A.howDidYouHear },

  // EEO dropdowns. All four are optional; a null leaves the question unanswered so the operator
  // can decline to self-identify deliberately rather than by accident.
  { pattern: /gender|sex\b/i,
    type: 'select-match', value: A.gender },

  { pattern: /race|ethnicity/i,
    type: 'select-match', value: A.raceEthnicity },

  { pattern: /veteran|military\s+status/i,
    type: 'select-match', value: A.veteranStatus },

  { pattern: /disability|disabled/i,
    type: 'select-match', value: A.disabilityStatus },

  // Standalone acknowledgment / certification checkboxes (e.g. "I confirm the
  // information provided is accurate") — always agree to proceed
  { pattern: /confirm|acknowledge|certify|information.*accurate|accurate.*best.*knowledge|terms.*condition|privacy\s+policy/i,
    type: 'checkbox', value: true },
];

// Drop entries the operator did not supply. A missing value must surface as an unknownQuestion,
// never be coerced into the string "null" and typed into a real application.
const ACTIVE_ANSWERS = KNOWN_ANSWERS.filter((a) => a.value !== null && a.value !== undefined);

function matchAnswer(label, extraAnswers = {}) {
  const trimmed = label.trim();

  // Extra answers override (case-insensitive partial match on key)
  for (const [key, val] of Object.entries(extraAnswers)) {
    if (trimmed.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(trimmed.toLowerCase())) {
      return { type: 'text', value: String(val) };
    }
  }

  for (const entry of ACTIVE_ANSWERS) {
    if (entry.pattern.test(trimmed)) return entry;
  }
  return null;
}

// ── CDP connection ──────────────────────────────────────────────────────────
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
    tabs.find(t => t.type === 'page' && t.url.includes('linkedin.com')) ||
    tabs.find(t => t.type === 'page');
  if (!target) throw new Error('No page found. Is Chrome running with --remote-debugging-port?');

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
    // wait for DOMContentLoaded
    await Promise.race([
      new Promise(res => {
        const listener = ev => {
          const msg = JSON.parse(ev.data);
          if (msg.method === 'Page.loadEventFired') { ws.removeEventListener('message', listener); res(); }
        };
        ws.addEventListener('message', listener);
      }),
      sleep(8000),
    ]);
    // LinkedIn is an SPA — navigating to a job already open in-session can be handled as a
    // client-side route change with no full reload, so Page.loadEventFired may never fire and
    // the fixed 8s wait above can resolve while the OLD job's DOM is still showing. Poll until
    // location.href actually reflects the URL we asked for before treating navigation as done,
    // otherwise the eligibility check / click below can silently act on the wrong job.
    const targetJobId = url.match(/\/jobs\/view\/(\d+)/)?.[1];
    if (targetJobId) {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const href = await eval_(`location.href`).catch(() => '');
        if (href && href.includes(targetJobId)) break;
        await sleep(300);
      }
    }
  };

  const uploadFile = async (selector, filePath) => {
    await send('DOM.getDocument', { depth: -1, pierce: true });
    const lookup = await send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: false,
    });
    const objectId = lookup.result?.objectId;
    if (!objectId) throw new Error(`File input not found: ${selector}`);
    const { nodeId } = await send('DOM.requestNode', { objectId });
    if (!nodeId) throw new Error(`DOM.requestNode failed to resolve nodeId for: ${selector}`);
    await send('DOM.setFileInputFiles', { nodeId, files: [filePath] });
    await sleep(1500); // wait for LinkedIn to process the file
  };

  // Poll until fn() returns truthy (fn is a JS expression string)
  const waitFor = async (exprFn, timeout = 8000, interval = 300) => {
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

// ── DOM extraction (runs inside browser) ────────────────────────────────────
// Returns { fields, buttons, pageTitle, done }
// fields: [{ type, label, id, value, options?, radios? }]
// buttons: { next, review, submit, dismiss }
// JS snippet (expression) that returns the Easy Apply modal element or null.
// Avoids matching salary-insight tooltips and other LinkedIn dialogs.
const MODAL_EXPR = `(
  document.querySelector('.jobs-easy-apply-modal') ||
  document.querySelector('[data-test-modal-id="easy-apply-modal"]') ||
  [...document.querySelectorAll('div[role="dialog"]')].find(d =>
    [...d.querySelectorAll('button')].some(b =>
      /continue to next step|submit application|review your application/i.test(
        (b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')
      )
    ) || [...d.querySelectorAll('h3,h2,h1')].some(h => /apply/i.test(h.innerText || ''))
  ) ||
  (location.href.includes('/apply/') ? (
    document.querySelector('form') ||
    [...document.querySelectorAll('div, section, article')].find(el => {
      if (el.children.length < 2) return false;
      const t = (el.innerText || '').slice(0, 300);
      return /apply to /i.test(t) && el.querySelector('button');
    }) ||
    document.querySelector('main') || document.body
  ) : null)
)`;

const EXTRACT_JS = `
(function() {
  const modal = ${MODAL_EXPR};
  if (!modal) return { error: 'no_modal' };

  // On in-page apply forms (/apply/ URL), the form elements may be anywhere in document
  // Use document as root for field searches to avoid missing elements in portals
  const isInPage = location.href.includes('/apply/');
  const root = isInPage ? document : modal;

  // ---- page title ----
  // On in-page forms, look for "Apply to X" heading or "X/Y pages" text
  let pageTitle = '';
  if (isInPage) {
    const text = document.body.innerText;
    const m = text.match(/Apply to ([^\\n]+)/);
    const p = text.match(/(\\d+\\/\\d+\\s*pages?)/i);
    pageTitle = (m ? m[1].trim() : '') + (p ? ' [' + p[1] + ']' : '');
  } else {
    pageTitle = modal.querySelector('h3.jobs-easy-apply-form-section__grouping-title, h3')?.innerText?.trim() || '';
  }

  // ---- helper: find label text for an element ----
  function labelFor(el) {
    // aria-label is the most reliable — check it first
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    if (el.id) {
      const lbl = document.querySelector('label[for="' + el.id + '"]');
      if (lbl) return lbl.innerText.trim();
    }
    // Walk up to find a wrapping label or form-element container
    let cur = el.parentElement;
    for (let i = 0; i < 5 && cur; i++) {
      const lbl = cur.querySelector(':scope > label, :scope > .artdeco-text-input--label, .fb-form-element-label');
      if (lbl && !lbl.contains(el)) return lbl.innerText.trim();
      cur = cur.parentElement;
    }
    return el.placeholder || el.name || '';
  }

  const fields = [];
  const seen = new Set(); // deduplicate by id

  // ---- radio groups (fieldsets — legacy LinkedIn UI) ----
  root.querySelectorAll('fieldset').forEach(fs => {
    let legend = fs.querySelector('legend')?.innerText?.trim();
    if (!legend) {
      // No legend — look in the fieldset's parent for a preceding text node or sibling
      const parent = fs.parentElement;
      if (parent) {
        for (const child of Array.from(parent.children)) {
          if (child === fs) break;
          const t = (child.innerText || child.textContent || '').trim().replace(/\\s+/g, ' ');
          if (t.length > 3) { legend = t.replace(/[*]\\s*$/, '').trim(); }
        }
        // Also check aria-labelledby
        if (!legend) {
          const labelId = fs.getAttribute('aria-labelledby');
          if (labelId) {
            const lbl = document.getElementById(labelId);
            if (lbl) legend = lbl.innerText.trim();
          }
        }
      }
    }
    if (!legend) return;
    const radios = [...fs.querySelectorAll('input[type="radio"]')];
    if (!radios.length) return;
    const key = 'radio::' + legend;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({
      type: 'radio',
      label: legend,
      radios: radios.map(r => ({
        id: r.id,
        value: r.value,
        label: (() => {
          // Try label[for="id"] first
          const lbl = document.querySelector('label[for="' + r.id + '"]');
          if (lbl) return lbl.innerText.trim();
          // Walk up siblings to find display text (LinkedIn hides the input, shows a sibling span/div)
          let parent = r.parentElement;
          for (let i = 0; i < 4 && parent; i++) {
            for (const child of Array.from(parent.children)) {
              if (child.contains(r)) continue;
              if (child.tagName === 'INPUT') continue;
              const t = (child.innerText || child.textContent || '').trim();
              if (t && t.length > 0 && t.length < 40 && !/^[0-9]+$/.test(t)) return t;
            }
            parent = parent.parentElement;
          }
          return r.value;
        })(),
        checked: r.checked,
      })),
    });
  });

  // ---- div[role="radio"] groups (LinkedIn's current custom radio UI) ----
  const allPageDivRadios = Array.from(document.querySelectorAll('div[role="radio"]'));
  const processedDivRadioParents = new Set();
  allPageDivRadios.forEach(radioDiv => {
    // Walk up to find the container holding this question's radio group
    let groupParent = radioDiv.parentElement;
    for (let i = 0; i < 4 && groupParent; i++) {
      const siblings = Array.from(groupParent.children || []);
      const radioCount = groupParent.querySelectorAll('div[role="radio"]').length;
      if (radioCount >= 2) break;
      groupParent = groupParent.parentElement;
    }
    if (!groupParent || processedDivRadioParents.has(groupParent)) return;
    const groupRadios = Array.from(groupParent.querySelectorAll('div[role="radio"]'));
    if (groupRadios.length < 2) return;
    processedDivRadioParents.add(groupParent);

    // Find the question text — look for sibling element(s) in the parent's parent
    let questionText = '';
    const questionContainer = groupParent.parentElement;
    if (questionContainer) {
      for (const child of Array.from(questionContainer.children)) {
        if (child === groupParent || child.querySelector('div[role="radio"]')) continue;
        const t = (child.innerText || child.textContent || '').trim().replace(/\\s+/g, ' ');
        if (t.length > 3) { questionText = t.replace(/\\*\\s*$/, '').trim(); break; }
      }
    }
    if (!questionText) return;

    const key = 'div-radio::' + questionText;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({
      type: 'div-radio',
      label: questionText,
      options: groupRadios.map(r => ({
        label: (r.innerText || r.textContent || '').trim(),
        checked: r.getAttribute('aria-checked') === 'true',
        globalIdx: allPageDivRadios.indexOf(r),
      })),
    });
  });

  // ---- select dropdowns ----
  root.querySelectorAll('select').forEach(sel => {
    if (seen.has(sel.id || sel.name)) return;
    seen.add(sel.id || sel.name);
    const label = labelFor(sel);
    // Skip country-code phone selects (label is empty or purely a flag)
    if (!label && !sel.name) return;
    fields.push({
      type: 'select',
      label: label,
      id: sel.id,
      name: sel.name,
      value: sel.options[sel.selectedIndex]?.text?.trim() || '',
      options: [...sel.options].map(o => o.text.trim()).filter(Boolean),
    });
  });

  // ---- text / number inputs ----
  root.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"]):not([type="search"])').forEach(inp => {
    if (seen.has(inp.id || inp.name)) return;
    if (inp.closest('fieldset')) return; // handled above
    seen.add(inp.id || inp.name);
    const label = labelFor(inp);
    fields.push({
      type: inp.type === 'number' ? 'number' : 'text',
      label: label,
      id: inp.id,
      name: inp.name,
      value: inp.value,
    });
  });

  // ---- standalone checkboxes (acknowledgment/agreement, not "Follow company") ----
  root.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (seen.has(cb.id || cb.name)) return;
    const fs = cb.closest('fieldset');
    if (fs && fs.querySelectorAll('input[type="checkbox"]').length > 1) return; // multi-checkbox group, not a single acknowledgment
    let label = labelFor(cb);
    if (!label && fs) {
      label = fs.querySelector('legend')?.innerText?.trim() || '';
    }
    if (!label && fs) {
      // LinkedIn's custom checkbox UI: text lives in a sibling <p>/<span>, not a <label>
      label = (fs.querySelector('p, span:not(:has(input))')?.innerText || '').trim();
    }
    if (!label || /follow/i.test(label)) return; // "Follow company" handled separately
    seen.add(cb.id || cb.name);
    fields.push({ type: 'checkbox', label: label, id: cb.id, name: cb.name, checked: cb.checked });
  });

  // ---- textareas ----
  root.querySelectorAll('textarea').forEach(ta => {
    if (seen.has(ta.id || ta.name)) return;
    seen.add(ta.id || ta.name);
    const label = labelFor(ta);
    fields.push({ type: 'textarea', label: label, id: ta.id, name: ta.name, value: ta.value });
  });

  // ---- file input ----
  const fileInput = root.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
  const hasFileInput = !!fileInput;

  // ---- buttons ----
  function btnText(btn) { return (btn.getAttribute('aria-label') || btn.innerText || '').trim().toLowerCase(); }
  // On in-page apply forms (/apply/ URL), buttons may be anywhere in document
  const allBtns = location.href.includes('/apply/')
    ? [...document.querySelectorAll('button:not([disabled])')]
    : [...modal.querySelectorAll('button:not([disabled])')];
  const buttons = {
    next:    allBtns.find(b => /continue|next step|^next$/i.test(btnText(b))) || null,
    review:  allBtns.find(b => /review/i.test(btnText(b))) || null,
    submit:  allBtns.find(b => /submit application/i.test(btnText(b))) || null,
    dismiss: allBtns.find(b => /dismiss|discard/i.test(btnText(b))) || null,
  };

  // ---- success detection ----
  const bodyText = document.body.innerText;
  const done = /your application was sent|application submitted/i.test(bodyText);

  return { fields, buttons: Object.fromEntries(Object.entries(buttons).map(([k,v]) => [k, !!v])), hasFileInput, pageTitle, done };
})()
`;

// ── Field filling ────────────────────────────────────────────────────────────
// All fill operations use the React-compatible native value setter + events

function makeTextFillJS(id, value) {
  return `
(function() {
  const inp = document.getElementById(${JSON.stringify(id)});
  if (!inp) return 'not_found';
  const setter = Object.getOwnPropertyDescriptor(
    inp.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
    'value'
  ).set;
  setter.call(inp, ${JSON.stringify(String(value))});
  inp.dispatchEvent(new Event('input',  { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  inp.dispatchEvent(new Event('blur',   { bubbles: true }));
  return 'ok';
})()`;
}

function makeSelectFillJS(id, targetText) {
  return `
(function() {
  const sel = document.getElementById(${JSON.stringify(id)});
  if (!sel) return 'not_found';
  const target = ${JSON.stringify(targetText.toLowerCase())};
  const opt = [...sel.options].find(o =>
    o.text.trim().toLowerCase().includes(target) ||
    target.includes(o.text.trim().toLowerCase())
  );
  if (!opt) return 'option_not_found:' + target;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, opt.value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok:' + opt.text.trim();
})()`;
}

function makeRadioClickJS(radioId) {
  return `
(function() {
  const radio = document.getElementById(${JSON.stringify(radioId)});
  if (!radio) return 'not_found';
  radio.click();
  return 'ok';
})()`;
}

function makeDivRadioClickJS(globalIdx) {
  return `
(function() {
  const radios = Array.from(document.querySelectorAll('div[role="radio"]'));
  const radio = radios[${globalIdx}];
  if (!radio) return 'not_found:idx_' + ${globalIdx};
  radio.click();
  return 'ok:' + (radio.textContent || '').trim();
})()`;
}

function makeCheckboxClickJS(id) {
  return `
(function() {
  const cb = document.getElementById(${JSON.stringify(id)});
  if (!cb) return 'not_found';
  // LinkedIn's custom checkbox UI wraps the real input in a div[role="checkbox"] that
  // handles the actual click/keyboard interaction — click that if present.
  const wrapper = cb.closest('[role="checkbox"]');
  if (wrapper) { wrapper.click(); return 'ok:wrapper'; }
  if (!cb.checked) cb.click();
  return 'ok:input';
})()`;
}

function makeButtonClickJS(ariaLabelPattern) {
  return `
(function() {
  const pattern = ${JSON.stringify(ariaLabelPattern)};
  const re = new RegExp(pattern, 'i');
  const modal = ${MODAL_EXPR};
  if (!modal) return 'no_modal';
  const btn = [...modal.querySelectorAll('button')].find(b =>
    re.test(b.getAttribute('aria-label') || '') || re.test(b.innerText || '')
  );
  if (!btn) return 'btn_not_found';
  if (btn.disabled) return 'disabled';
  btn.click();
  return 'ok';
})()`;
}

// ── Job eligibility check ────────────────────────────────────────────────────
const ELIGIBILITY_JS = `
(function() {
  const text = document.body.innerText;

  // Company name + job title from the job detail page
  const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title h1, .topcard__title, h1.t-24');
  const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name a, .topcard__org-name-link, .topcard__flavor--black-link');
  const title   = titleEl?.innerText?.trim()   || '';
  const company = companyEl?.innerText?.trim() || '';

  // Posted time — look for the time element or the "ago" text
  const timeEl = document.querySelector('span.tvm__text.tvm__text--neutral + span, .jobs-unified-top-card__posted-date, .topcard__flavor--metadata');
  let posted = '';
  const allSpans = [...document.querySelectorAll('span, li')];
  for (const s of allSpans) {
    if (/^(\\d+\\s*(minute|hour|day|week|month)s?\\s*ago|just now|reposted)/i.test(s.innerText?.trim())) {
      posted = s.innerText.trim();
      break;
    }
  }

  const reposted = /reposted/i.test(text.slice(0, 3000));

  // Parse age: only "Xm ago", "Xh ago", or "just now" count as within 24h
  // (999999 not Infinity — CDP's returnByValue JSON-serializes Infinity as null)
  let ageHours = 999999;
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

  // Easy Apply button — scoped to the job's own top-card action, NOT a page-wide text
  // search. A page-wide "button, a" scan also matches the "similar jobs" recommendation
  // rail, whose cards are long <a> elements that happen to contain "Easy Apply" as a
  // badge for a DIFFERENT job — .find() then returns whichever comes first in DOM order,
  // which can be the wrong job entirely. Fix: prefer LinkedIn's stable top-card button
  // id/class, and fall back to a short-own-text match (own trimmed text < 25 chars) so
  // long recommendation-card anchors can never qualify.
  const stableBtn = document.querySelector(
    '#jobs-apply-button-id, button.jobs-apply-button, .jobs-apply-button--top-card button'
  );
  const easyApplyBtn = stableBtn || [...document.querySelectorAll('button, a')].find(b => {
    const aria = (b.getAttribute('aria-label') || '').trim();
    const text = (b.innerText || '').trim();
    const combined = aria + ' ' + text;
    if (text.length > 25 && aria.length > 25) return false; // long card text, not a real button
    if (!/easy apply/i.test(combined)) return false;
    if (/apply on company website|apply externally/i.test(combined)) return false;
    return true;
  });
  const hasEasyApply = !!easyApplyBtn && /easy apply/i.test(
    (easyApplyBtn.getAttribute('aria-label') || '') + ' ' + (easyApplyBtn.innerText || '')
  );

  return { title, company, posted, reposted, ageHours, hasEasyApply };
})()
`;

// ── Main apply flow ──────────────────────────────────────────────────────────
async function applyToJob(cdp, jobUrl, resumePath, extraAnswers) {
  // 1. Navigate
  await cdp.navigate(jobUrl);
  // Wait for the top-card apply button specifically (not just any "apply" text anywhere
  // on the page) so the eligibility check below doesn't race a not-yet-hydrated button.
  await cdp.waitFor(
    `!!document.querySelector('#jobs-apply-button-id, button.jobs-apply-button, .jobs-apply-button--top-card button') || document.querySelector('h1')`,
    20000, 500
  );
  await sleep(1500); // extra tick for the button's final text ("Apply" vs "Easy Apply") to settle

  // 2. Eligibility
  let meta = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    meta = await cdp.eval(ELIGIBILITY_JS);
    if (meta && (meta.hasEasyApply || meta.title || attempt === 2)) break;
    await sleep(2000);
  }
  if (!meta) fail({ success: false, reason: 'error', message: 'Failed to read page' });

  const { title, company, posted, reposted, ageHours, hasEasyApply } = meta;
  process.stderr.write(`[job] ${company} | ${title} | posted: ${posted} (${ageHours.toFixed(1)}h ago)\n`);

  // Blocklist check
  if (BLOCKLIST && BLOCKLIST.test(company)) fail({ success: false, reason: 'blocklisted', company, title });
  if (reposted)                    fail({ success: false, reason: 'reposted',    company, title });
  if (ageHours > 24)               fail({ success: false, reason: 'too_old',     company, title, posted });
  if (!hasEasyApply)               fail({ success: false, reason: 'no_easy_apply', company, title });

  if (DRY_RUN) {
    console.log(JSON.stringify({ success: false, reason: 'dry_run', company, title, url: jobUrl }));
    process.exit(0);
  }

  // 3. Click Easy Apply — same stable-selector-first scoping as the eligibility check,
  // so we never click a "similar jobs" recommendation card instead of this job's own button.
  const clickResult = await cdp.eval(`
(function() {
  const stableBtn = document.querySelector(
    '#jobs-apply-button-id, button.jobs-apply-button, .jobs-apply-button--top-card button'
  );
  const btn = stableBtn || [...document.querySelectorAll('button, a')].find(b => {
    const aria = (b.getAttribute('aria-label') || '').trim();
    const text = (b.innerText || '').trim();
    if (text.length > 25 && aria.length > 25) return false;
    return /easy apply/i.test(aria + ' ' + text);
  });
  if (!btn) return 'btn_not_found';
  if (!/easy apply/i.test((btn.getAttribute('aria-label')||'') + ' ' + (btn.innerText||''))) return 'not_easy_apply';
  if (btn.disabled) return 'disabled';
  btn.click();
  return 'ok';
})()
`);
  process.stderr.write(`[click] Easy Apply: ${clickResult}\n`);
  if (clickResult !== 'ok') fail({ success: false, reason: 'error', message: `Easy Apply click: ${clickResult}` });

  // Wait for the apply form to actually render with form fields
  // Page always has 2 inputs (language select + job search) — wait for at least 4 to know form is loaded
  let modalFound = await cdp.waitFor(
    `(location.href.includes('/apply/') ?
      (document.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select').length >= 4 ||
       document.body.innerText.includes('Contact info') ||
       document.body.innerText.includes('Additional Questions'))
      : !!(${MODAL_EXPR}))`,
    15000
  );
  let urlAfterClick = await cdp.eval(`location.href`);

  // Fallback: if the click redirected away from the apply form (similar-jobs collection,
  // search-results with a different currentJobId, etc.), navigate directly to the
  // /apply/ URL for this specific job instead of whatever LinkedIn redirected to.
  if (!modalFound && !urlAfterClick.includes('/apply/')) {
    process.stderr.write(`[fallback] Redirected away from apply form (${urlAfterClick.slice(0,80)}), navigating directly to apply URL\n`);
    const jobId = jobUrl.match(/\/jobs\/view\/(\d+)/)?.[1];
    if (jobId) {
      await cdp.navigate(`https://www.linkedin.com/jobs/view/${jobId}/apply/`);
      await sleep(2000);
      modalFound = await cdp.waitFor(
        `document.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select').length >= 4 ||
         document.body.innerText.includes('Contact info') ||
         document.body.innerText.includes('Additional Questions')`,
        15000
      );
      urlAfterClick = await cdp.eval(`location.href`);
    }
  }

  const modalType = await cdp.eval(`
    (location.href.includes('/apply/') ? 'in-page:' : 'modal:') +
    (document.querySelector('.jobs-easy-apply-modal') ? 'easy-apply-modal' :
     document.querySelector('[data-test-modal-id="easy-apply-modal"]') ? 'test-modal-id' :
     [...document.querySelectorAll('div[role="dialog"]')].length + '_dialogs')
  `);
  process.stderr.write(`[form] url=${urlAfterClick.slice(0,80)} | type=${modalType} | found=${modalFound}\n`);
  if (!modalFound) fail({ success: false, reason: 'error', message: 'Apply form did not render' });

  await sleep(1500); // brief extra wait for React sub-components to mount

  // 4. Page loop
  const unknownQuestions = [];
  let pageNum = 0;
  const MAX_PAGES = 15;

  while (pageNum < MAX_PAGES) {
    pageNum++;
    await sleep(600);

    const state = await cdp.eval(EXTRACT_JS);
    if (!state || state.error) fail({ success: false, reason: 'error', message: `Extract failed: ${state?.error}` });

    process.stderr.write(`[page ${pageNum}] "${state.pageTitle}" — ${state.fields.length} fields, buttons: ${JSON.stringify(state.buttons)}\n`);
    // Debug: log ALL fields including unlabeled ones
    state.fields.forEach((f, i) => {
      process.stderr.write(`  [field ${i}] type=${f.type} label="${f.label}" id="${f.id||''}" value="${f.value||''}"${f.options?` options=[${f.options.slice(0,3).join(',')}]`:''}\n`);
    });

    // Check if already done (success appeared)
    if (state.done) break;

    // ---- Handle file upload (always upload fresh) ----
    if (state.hasFileInput && resumePath) {
      process.stderr.write(`[upload] ${resumePath}\n`);
      try {
        // Click "Upload resume" button to activate file input
        await cdp.eval(`
          (function() {
            const btn = Array.from(document.querySelectorAll('button, label, span')).find(el =>
              /upload resume/i.test((el.innerText || el.textContent || '').trim())
            );
            if (btn) btn.click();
          })()
        `);
        await sleep(600);
        await cdp.uploadFile('input[type="file"]', resumePath);
        await sleep(2000);
        // Select the newly uploaded resume (first radio in list)
        await cdp.eval(`
          (function() {
            const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
            if (radios.length > 0 && !radios[0].checked) {
              radios[0].click();
              radios[0].dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `);
        await sleep(500);
        const resumeBasename = resumePath.split('/').pop();
        const selectedOk = await cdp.eval(`
          (function() {
            const modal = ${MODAL_EXPR};
            if (!modal) return false;
            return modal.innerText.includes(${JSON.stringify(`Deselect resume ${resumeBasename}`)});
          })()
        `);
        if (!selectedOk) {
          fail({ success: false, reason: 'error', message: `Uploaded resume "${resumeBasename}" was not confirmed as the selected resume — refusing to submit with a possibly-wrong resume.` });
        }
      } catch (e) {
        fail({ success: false, reason: 'error', message: `Resume upload failed, refusing to submit with a possibly-wrong pre-selected resume: ${e.message}` });
      }
    }

    // ---- Set phone country code to US (+1) if present on this page ----
    await cdp.eval(`
      (function() {
        const cs = Array.from(document.querySelectorAll('select')).find(s => s.options.length > 100);
        if (!cs) return;
        const us = Array.from(cs.options).find(o => o.text.includes('United States (+1)'));
        if (!us || cs.value === us.value) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(cs, us.value);
        cs.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);

    // ---- Fill fields ----
    for (const field of state.fields) {
      if (!field.label) continue;
      const answer = matchAnswer(field.label, extraAnswers);

      if (field.type === 'radio') {
        if (!answer) {
          // Radio: if only yes/no options and no match, flag as unknown
          const hasYesNo = field.radios.some(r => /^yes$/i.test(r.label));
          if (hasYesNo) {
            unknownQuestions.push({ label: field.label, type: 'yes-no-radio', options: field.radios.map(r => r.label) });
          }
          // Non-yes/no radio with no match → flag
          else {
            unknownQuestions.push({ label: field.label, type: 'radio', options: field.radios.map(r => r.label) });
          }
          continue;
        }
        // Find the radio option that matches
        const targetLabel = answer.value;
        const radio = field.radios.find(r =>
          r.label.toLowerCase().includes(targetLabel.toLowerCase()) ||
          targetLabel.toLowerCase().includes(r.label.toLowerCase())
        );
        if (!radio) {
          process.stderr.write(`[radio] no option matching "${targetLabel}" in [${field.radios.map(r => r.label).join(', ')}]\n`);
          unknownQuestions.push({ label: field.label, type: 'radio', options: field.radios.map(r => r.label) });
          continue;
        }
        if (!radio.checked) {
          const r = await cdp.eval(makeRadioClickJS(radio.id));
          process.stderr.write(`[radio] "${field.label}" → "${radio.label}": ${r}\n`);
        }

      } else if (field.type === 'select') {
        if (!answer) {
          // Skip pre-filled selects: value is set AND appears in options list
          const isPrefilled = field.value && field.options.some(o =>
            o === field.value || o.includes(field.value) || field.value.includes(o)
          );
          // Also skip if only 1 option (auto-selected)
          const isSingleOption = field.options.length === 1;
          if (isPrefilled || isSingleOption) {
            process.stderr.write(`[select] "${field.label}" pre-filled as "${field.value}", skipping\n`);
          } else {
            unknownQuestions.push({ label: field.label, type: 'select', options: field.options });
          }
          continue;
        }
        const r = await cdp.eval(makeSelectFillJS(field.id, answer.value));
        process.stderr.write(`[select] "${field.label}" → "${answer.value}": ${r}\n`);

      } else if (field.type === 'text' || field.type === 'number' || field.type === 'textarea') {
        if (!answer) {
          // Skip if already filled (from LinkedIn profile)
          if (field.value && field.value.trim()) {
            process.stderr.write(`[text] "${field.label}" pre-filled as "${field.value}", skipping\n`);
          } else {
            unknownQuestions.push({ label: field.label, type: field.type });
          }
          continue;
        }
        if (field.value !== answer.value) {
          const r = await cdp.eval(makeTextFillJS(field.id, answer.value));
          process.stderr.write(`[text] "${field.label}" → "${answer.value}": ${r}\n`);
        }

      } else if (field.type === 'checkbox') {
        if (!answer) {
          unknownQuestions.push({ label: field.label, type: 'checkbox' });
          continue;
        }
        if (!field.checked) {
          const r = await cdp.eval(makeCheckboxClickJS(field.id));
          process.stderr.write(`[checkbox] "${field.label.slice(0,60)}" → checked: ${r}\n`);
        }

      } else if (field.type === 'div-radio') {
        // Default to Yes for unknown yes/no questions
        const targetLabel = (answer?.type === 'yes-no-radio') ? answer.value : 'Yes';
        const targetOption = field.options.find(o =>
          o.label.toLowerCase() === targetLabel.toLowerCase()
        );
        if (!targetOption) {
          process.stderr.write(`[div-radio] option "${targetLabel}" not found in [${field.options.map(o=>o.label).join(', ')}]\n`);
          continue;
        }
        if (!targetOption.checked) {
          const r = await cdp.eval(makeDivRadioClickJS(targetOption.globalIdx));
          process.stderr.write(`[div-radio] "${field.label.slice(0,60)}" → "${targetLabel}": ${r}\n`);
          await sleep(400);
        }
      }
    }

    // Stop if unknown questions — close modal and return
    if (unknownQuestions.length > 0) {
      await cdp.eval(makeButtonClickJS('dismiss|discard'));
      await sleep(500);
      await cdp.eval(makeButtonClickJS('discard'));
      return { success: false, reason: 'unknown_questions', company, title, url: jobUrl, unknownQuestions };
    }

    // ---- Uncheck "Follow company" if present ----
    await cdp.eval(`
      (function() {
        const modal = document.querySelector('.jobs-easy-apply-modal, div[role="dialog"][aria-modal="true"]');
        if (!modal) return;
        modal.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          const lbl = document.querySelector('label[for="' + cb.id + '"]')?.innerText || '';
          if (/follow/i.test(lbl) && cb.checked) cb.click();
        });
      })()
    `);

    // ---- Advance to next page (fresh button search AFTER filling fields) ----
    // Note: Next button may be disabled before filling but enabled after — always do fresh search here
    await sleep(300); // brief pause for React to process field changes
    const advResult = await cdp.eval(`
      (function() {
        function btext(b) { return (b.getAttribute('aria-label') || b.innerText || '').trim().toLowerCase(); }
        const btns = Array.from(document.querySelectorAll('button'));
        // Debug: log all button texts
        const allBtnTexts = btns.map(b => '"' + btext(b).slice(0,40) + '"' + (b.disabled ? '[dis]' : '')).join(', ');
        if (typeof process !== 'undefined') {}  // browser context — no process
        const _log = allBtnTexts;  // accessible via return value inspection
        const submitBtn  = btns.find(b => /submit application/i.test(btext(b)));
        const reviewBtn  = btns.find(b => /^review/i.test(btext(b)));
        const nextBtn    = btns.find(b => /continue|next step|^next$/i.test(btext(b)) && !/company website|externally/i.test(btext(b)));
        const actionBtn  = submitBtn || reviewBtn || nextBtn;
        if (!actionBtn) return 'no_button|all_btns:' + allBtnTexts;
        const label = btext(actionBtn);
        if (actionBtn.disabled) return 'disabled:' + label + '|all_btns:' + allBtnTexts;
        actionBtn.click();
        return 'clicked:' + label;
      })()
    `);
    process.stderr.write(`[advance] ${advResult}\n`);

    if (advResult.startsWith('clicked:submit')) {
      // Wait for success confirmation
      const success = await cdp.waitFor(
        `/your application was sent|application submitted/i.test(document.body.innerText)`,
        12000
      );
      if (success) break;
      const errText = await cdp.eval(
        `document.querySelector('[role="alert"]')?.innerText?.trim() || ''`
      );
      if (errText) fail({ success: false, reason: 'error', message: `Submit error: ${errText}`, company, title });
      break;
    } else if (advResult.startsWith('clicked:')) {
      await sleep(1500); // wait for next page to load
    } else {
      process.stderr.write(`[warn] could not advance: ${advResult}\n`);
      // If form is already done (navigated away after submit)
      const isDone = await cdp.eval(`/your application was sent|application submitted/i.test(document.body.innerText)`);
      if (isDone) break;
      break;
    }
  }

  // 5. Confirm success
  const confirmed = await cdp.eval(
    `/your application was sent|application submitted/i.test(document.body.innerText)`
  );

  return { success: !!confirmed, company, title, url: jobUrl };
}

// ── Entry point ──────────────────────────────────────────────────────────────
let cdp;
try {
  cdp = await connect(CDP_PORT);
} catch (e) {
  fail({ success: false, reason: 'error', message: `CDP connect failed: ${e.message}` });
}

try {
  const result = await applyToJob(cdp, JOB_URL, RESUME, EXTRA);
  console.log(JSON.stringify(result));
} catch (e) {
  console.log(JSON.stringify({ success: false, reason: 'error', message: e.message }));
} finally {
  cdp.close();
}
