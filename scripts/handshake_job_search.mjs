#!/usr/bin/env node
/**
 * handshake_job_search.mjs — Scrape Handshake job listings via Chrome DevTools Protocol.
 *
 * Requires Chrome logged into Handshake on port 9334.
 * Start Chrome if not running:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
 *     --remote-debugging-port=9334 \
 *     --user-data-dir="$HOME/.config/handshake-chrome-profile" \
 *     --no-first-run https://app.joinhandshake.com &
 *   sleep 3
 *
 * Usage:
 *   node scripts/handshake_job_search.mjs \
 *     --keywords "software engineer" \
 *    [--location "United States"]
 *    [--count 20]                    # max cards to scan from search page (default 20)
 *    [--applied-jobs ./applied_jobs.txt]
 *    [--port 9334]
 *
 * Stdout: JSON array of passing jobs:
 *   [{ url, title, company, postedAgo, jdText }, ...]
 *
 * Filters applied:
 *   1. Posted within 24h (from detail page)
 *   2. Not reposted
 *   3. Quick Apply only (not "Apply Externally")
 *   4. Not already in applied_jobs.txt
 */

import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

// ── CLI ──────────────────────────────────────────────────────────────────────
const { values: flags } = parseArgs({
  options: {
    keywords:       { type: 'string', default: 'software engineer' },
    location:       { type: 'string', default: '' },
    count:          { type: 'string', default: '20' },
    'applied-jobs': { type: 'string', default: './applied_jobs.txt' },
    port:           { type: 'string', default: '9334' },
  },
  strict: false,
});

const KEYWORDS     = flags.keywords;
const LOCATION     = flags.location;
const COUNT        = parseInt(flags.count, 10);
const APPLIED_FILE = flags['applied-jobs'];
const CDP_PORT     = parseInt(flags.port, 10);

// ── Dedup helpers ─────────────────────────────────────────────────────────────
function loadApplied(path) {
  if (!existsSync(path)) return new Set();
  const lines = readFileSync(path, 'utf8').split('\n');
  const entries = new Set();
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+?)\s*\|\s*(.+?)\s*\|/);
    if (match) entries.add(`${match[1].trim().toLowerCase()}|||${match[2].trim().toLowerCase()}`);
  }
  return entries;
}

function isAlreadyApplied(applied, company, title) {
  const co = company.toLowerCase().replace(/\b(inc|llc|ltd|corp|technologies|solutions|group)\b\.?/gi, '').trim();
  for (const entry of applied) {
    const [eCo, eTitle] = entry.split('|||');
    if (!eCo.includes(co) && !co.includes(eCo)) continue;
    const titleWords = new Set(title.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const entryWords = new Set(eTitle.split(/\W+/).filter(w => w.length > 3));
    if ([...titleWords].some(w => entryWords.has(w))) return true;
  }
  return false;
}

// ── Time helper ───────────────────────────────────────────────────────────────
function hoursAgo(text) {
  if (!text) return Infinity;
  const m = text.match(/(\d+)\s*(minute|hour|day|week|month)/i);
  if (!m) return text.toLowerCase().includes('just now') ? 0 : Infinity;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('minute')) return n / 60;
  if (unit.startsWith('hour'))   return n;
  if (unit.startsWith('day'))    return n * 24;
  return Infinity;
}

// ── CDP connection ─────────────────────────────────────────────────────────────
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

  const eval_ = async (expr, timeout = 12000) => {
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
      sleep(12000),
    ]);
  };

  const waitFor = async (exprFn, timeout = 12000, interval = 400) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const v = await eval_(exprFn);
      if (v) return v;
      await sleep(interval);
    }
    return null;
  };

  return { eval: eval_, navigate, waitFor, close: () => ws.close() };
}

// ── Extract job cards from Handshake search list page ───────────────────────
const EXTRACT_CARDS_JS = `
(function() {
  const results = [];

  // New Handshake UI (2026-06): links go to /job-search/{jobId}
  const links = [...document.querySelectorAll('a[href]')].filter(a => /\\/job-search\\/\\d+/.test(a.href));
  const seen = new Set();

  for (const a of links) {
    const href = a.href || '';
    const m = href.match(/\\/job-search\\/(\\d+)/);
    if (!m) continue;
    const jobId = m[1];
    if (seen.has(jobId)) continue;
    seen.add(jobId);

    // Walk up to find the card container (try up to 6 levels)
    let card = a;
    for (let i = 0; i < 6; i++) {
      if (card.parentElement) card = card.parentElement;
      const txt = (card.innerText || '').trim();
      // Stop when we have enough text (title + company)
      if (txt.split('\\n').length >= 2 && txt.length > 20) break;
    }

    const cardText = card.innerText || '';
    const lines = cardText.split('\\n').map(l => l.trim()).filter(Boolean);
    // First meaningful line is usually the title, second is company
    const title   = lines[0] || '';
    const company = lines[1] || '';

    // Posted time — look for "X ago" anywhere in the card
    let postedAgo = '';
    for (const line of lines) {
      if (/\\d+\\s*(minute|hour|day|week|month)s?\\s*ago|just now/i.test(line)) {
        postedAgo = line;
        break;
      }
    }

    // Quick Apply indicator — Handshake sometimes shows "Quick Apply" badge in the card
    const hasQuickApplyBadge = /quick\\s*apply/i.test(cardText);

    results.push({
      url: 'https://app.joinhandshake.com/job-search/' + jobId,
      title,
      company,
      postedAgo,
      hasQuickApplyBadge,
    });

    if (results.length >= ${COUNT}) break;
  }
  return results;
})()
`;

// ── Extract detail page info ──────────────────────────────────────────────────
const EXTRACT_DETAIL_JS = `
(function() {
  const text = document.body.innerText;

  // New Handshake UI (2026-06): split-pane, h1 = "Jobs" (section header, not job title)
  // Title is in a heading within the detail panel
  const titleEl =
    document.querySelector('[data-hook="job-title"]') ||
    document.querySelector('h2:not([class*="sidebar"]):not([class*="nav"])') ||
    document.querySelector('h3');
  const title = titleEl?.innerText?.trim().split('\\n')[0] || '';

  const companyEl =
    document.querySelector('[data-hook="employer-profile-link"]') ||
    document.querySelector('[data-hook="employer-name"]') ||
    document.querySelector('a[href*="/employers/"]') ||
    document.querySelector('a[href*="/employer/"]');
  const company = companyEl?.innerText?.trim() || '';

  // Posted time — Handshake now shows "Posted X ago" inline
  let postedAgo = '';
  for (const el of [...document.querySelectorAll('span, p, div, li, time, small')]) {
    if (el.children.length > 3) continue;
    const t = (el.innerText || '').trim();
    if (/posted\\s+\\d+\\s*(minute|hour|day|week|month)s?\\s*ago/i.test(t) || /^just now$/i.test(t) ||
        /^\\d+\\s*(minute|hour)s?\\s*ago$/i.test(t)) {
      postedAgo = t.replace(/^posted\\s+/i, '').split('∙')[0].trim();
      break;
    }
  }

  const reposted = /reposted/i.test(text.slice(0, 5000));

  // Apply button detection for new Handshake UI
  const allBtns = [...document.querySelectorAll('button, a')];
  const hasExternalBtn = allBtns.some(b =>
    /apply externally|apply on company/i.test((b.innerText || '').trim())
  );
  // Quick Apply = an "Apply" button that is NOT "Apply externally"
  const hasQuickApply = !hasExternalBtn && allBtns.some(b => {
    const txt = (b.innerText || b.textContent || '').trim();
    return /^(quick\\s+)?apply$/i.test(txt) || /quick.?apply/i.test(b.getAttribute('aria-label') || '');
  });
  const isExternal = hasExternalBtn && !hasQuickApply;

  // JD text — grab the main job description section
  const descEl =
    document.querySelector('[data-hook="job-description"]') ||
    document.querySelector('.posting-description') ||
    document.querySelector('[class*="description"]') ||
    document.querySelector('main');
  const jdText = descEl
    ? (descEl.innerText || '').trim().slice(0, 4000)
    : text.trim().slice(0, 4000);

  return { title, company, postedAgo, reposted, hasQuickApply, isExternal, jdText };
})()
`;

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const applied = loadApplied(APPLIED_FILE);

  let cdp;
  try {
    cdp = await connect(CDP_PORT);
  } catch (e) {
    console.error(JSON.stringify({ error: `CDP connect failed: ${e.message}` }));
    process.exit(1);
  }

  try {
    // Build Handshake search URL (new /job-search UI as of 2026-06)
    const searchUrl = new URL('https://app.joinhandshake.com/job-search');
    searchUrl.searchParams.set('query', KEYWORDS || 'software engineer');
    searchUrl.searchParams.set('employmentTypes', '1'); // Full-Time
    searchUrl.searchParams.set('sort', 'posted_date_desc');
    searchUrl.searchParams.set('page', '1');
    searchUrl.searchParams.set('per_page', '25');

    process.stderr.write(`[search] ${searchUrl.toString()}\n`);
    await cdp.navigate(searchUrl.toString());

    // Wait for job cards to appear (React SPA needs time to render)
    const cardsAppeared = await cdp.waitFor(
      `[...document.querySelectorAll('a[href]')].some(a => /\\/job-search\\/\\d+/.test(a.href))`,
      15000, 600
    );
    if (!cardsAppeared) {
      process.stderr.write('[warn] No job cards found on search page. Check if logged in.\n');
      console.log(JSON.stringify([]));
      return;
    }
    await sleep(1500); // let React finish rendering all cards

    // Extract card list
    const cards = await cdp.eval(EXTRACT_CARDS_JS);
    process.stderr.write(`[cards] found ${cards?.length || 0} on search page\n`);

    if (!cards || cards.length === 0) {
      console.log(JSON.stringify([]));
      return;
    }

    const results = [];

    for (const card of cards) {
      // Quick dedup check against applied list before fetching detail page
      if (card.company && card.title && isAlreadyApplied(applied, card.company, card.title)) {
        process.stderr.write(`[skip] already applied: ${card.company} | ${card.title}\n`);
        continue;
      }

      // Quick time check from card (if available and obviously old)
      if (card.postedAgo && hoursAgo(card.postedAgo) > 24) {
        process.stderr.write(`[skip] too old (card): ${card.postedAgo} — ${card.title}\n`);
        continue;
      }

      // Fetch detail page for accurate info
      await sleep(600);
      await cdp.navigate(card.url);
      await sleep(2500); // SPA needs time to render detail panel

      const detail = await cdp.eval(EXTRACT_DETAIL_JS);
      if (!detail) continue;

      const { title, company, postedAgo, reposted, hasQuickApply, isExternal, jdText } = detail;

      const effectiveTitle   = title   || card.title;
      const effectiveCompany = company || card.company;
      const effectivePosted  = postedAgo || card.postedAgo;

      process.stderr.write(`[detail] ${effectiveCompany} | ${effectiveTitle} | ${effectivePosted || '?'}\n`);

      // Filters
      if (reposted) { process.stderr.write(`  → skip: reposted\n`); continue; }
      if (hoursAgo(effectivePosted) > 24) { process.stderr.write(`  → skip: too old (${effectivePosted})\n`); continue; }
      if (isExternal) { process.stderr.write(`  → skip: apply externally\n`); continue; }
      if (!hasQuickApply) { process.stderr.write(`  → skip: no quick apply button\n`); continue; }
      if (isAlreadyApplied(applied, effectiveCompany, effectiveTitle)) {
        process.stderr.write(`  → skip: already applied\n`); continue;
      }

      process.stderr.write(`  → PASS ✓\n`);
      results.push({
        url:       card.url,
        title:     effectiveTitle,
        company:   effectiveCompany,
        postedAgo: effectivePosted,
        jdText,
      });
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    cdp.close();
  }
}

main().catch(e => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
