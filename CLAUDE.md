# Resume Tailoring & Auto-Apply Pipeline

Instructions for Claude Code working in this repo. Codex reads `AGENTS.md`, which points at the
same files.

## Where the rules live

The authoritative workflow is `prompts/00-orchestrator.md`. The single source of truth for every
tailoring rule is `prompts/01-tailoring-rules.md`. **Read the orchestrator prompt before processing
any JD.**

**Precedence:** `01-tailoring-rules.md` > `00-orchestrator.md` > this file > `profile/profile.yaml`.
If a rule below conflicts with the prompts, the prompts win and this file is the bug — fix it here
rather than working around it.

This file owns exactly two things: **the platform apply gates** and **the apply flows**. It
deliberately restates no tailoring rule.

## Engine vs. profile

| | Committed | Gitignored |
|---|---|---|
| `prompts/`, `scripts/`, `tools/`, `render/` | ✅ the engine | |
| `profile/` — identity, bullets, answers | | ✅ never committed |
| `outputs/`, `applied_jobs.txt` | | ✅ never committed |

`profile/master_resume.yaml` is the only source of resume content: header, education, frozen
role/project facts, the Skills taxonomy, and every approved tagged bullet. Every tailored resume is
assembled fresh from it. Never store JDs or finished resumes in it, and never add a bullet without
explicit operator approval.

**The reuse rule.** When a JD needs a technology or business theme the bank has no bullet for,
write one *with* the operator, get approval, and add it with proper tags. The next JD in that stack
finds it by search instead of being rewritten. This is what makes the tenth application cheaper
than the first.

If `profile/` does not exist, stop and tell the operator to run `cp -r profile.example profile`.
Never read resume content from `profile.example/` — it describes a fictional person.

## When the operator gives you a JD

Invoke the `tailor-resume` skill. The full orchestrator → Writer → Reviewer pipeline, keyword
extraction, bullet-bank logic, and output steps are all in `prompts/`.

---

## ⛔ Apply gates — non-negotiable

**Scope — gates turn on provenance, not format.** They apply to **any job you found yourself** on
LinkedIn or Handshake, during a search or a batch run. They do **not** apply to a job the operator
handed you, whether as a link or as raw text: they already decided it is worth applying to, and
gates 1–2 (freshness, reposted) are not a veto over that. Gate 6 (citizenship / clearance) is the
one exception and always applies, because no resume edit can satisfy it.

Check these on the **job detail page** before reading the JD, generating a resume, or applying. Any
one failing → skip immediately, record why, move to the next job. **Do not read the JD, do not
invoke `tailor-resume`, do not generate a resume** for a job that fails a gate.

| # | Gate | Rule |
|---|---|---|
| 1 | **Freshness** | Posted within 24 hours. "1d ago", "3d ago", "1wk ago" → skip |
| 2 | **Not reposted** | Detail page says "Reposted" → skip. No exceptions, either platform |
| 3 | **In-platform apply only** | LinkedIn: Easy Apply only (skip "Apply on company website"). Handshake: Quick Apply only (skip "Apply Externally") |
| 4 | **Answer from the profile** | Every application answer comes from `profile/profile.yaml`. Never invent one, and never carry an answer over from a different operator or a previous session |
| 5 | **Always a tailored resume** | Upload the PDF generated for *this* job. Never one-click submit with the platform's stored default resume |
| 6 | **No citizenship / clearance roles** | JD mentions "U.S. Citizen", "US citizenship required", "Secret / Top Secret / TS-SCI clearance", "ability to obtain a security clearance", or "favorably adjudicated Government background investigation" — under Required *or* Preferred → skip silently. The operator cannot satisfy this and no resume edit can change that |

Notes on gate 1: a search list's "New" badge means nothing. Read the detail page's
"Posted / Reposted X ago".

Notes on gate 5:
- **LinkedIn** — at the résumé step, click "Upload resume" and upload this job's PDF. Do not pick
  an older resume from the list.
- **Handshake** — if the Quick Apply modal offers "Upload new", use it. If it is the stripped-down
  modal that offers only Submit with the account's default resume, the script returns
  `simplified_modal` and stops. Upload the tailored PDF to the Handshake document library and set it
  as default first (switch back afterward). Never submit the default resume.

**"Apply to N jobs" means N successful submissions.** Skipped jobs do not count toward N; keep going
until N have actually gone out. Skipped jobs are **entirely silent** — do not mention them during
the run, and do not list them in the final summary. Report only the N that succeeded.

---

## Session start checklist

1. This file — apply gates, platform flows, output spec
2. `prompts/00-orchestrator.md` — the authoritative workflow
3. `applied_jobs.txt` — the dedup list

The Writer reads `prompts/01-tailoring-rules.md` itself. The orchestrator does not need to preload
every rule.

## Role-family classification

Classify from the **JD body, not the job title**. The seven families and their keyword triggers are
in `prompts/00-orchestrator.md` step 0 and `prompts/04-role-presets.md`. Pass the label to the
Writer, which uses it to select and rank bullets from `profile/master_resume.yaml`.

## Using the applied list

`applied_jobs.txt` groups entries by date:

```
MM/DD/YY
1. company name (lowercase) | role title (lowercase) | platform (lowercase) | MM/DD/YY
2. company name (lowercase) | role title (lowercase) | platform (lowercase) | MM/DD/YY
```

Start a new date header at the end of the file each day, numbering from 1 again.

**While browsing a search list:** compare company + role against the list right there. A match →
skip without opening the posting. Match fuzzily (ignore case and punctuation) on **company + role
only**; ignore the platform and date columns.

**After a successful submission:** append immediately. If today's header exists, add the next
number under it; otherwise add the date header first.

## Output spec

- Filename: `{company_slug}_{role_slug}_{YYYYMMDD}.docx` / `.pdf`; special characters → `_`
- Generate `.docx` (backup) and `.pdf` (submitted); do not keep the `.md`
- Upload the `.pdf`
- 1 page, US Letter
- Render with `python3 render/generate_outputs.py <input.md>`
- Styling comes only from `render/resume.css`. Never reintroduce hardcoded styling in the Python.
- **Never write a cover letter.**

---

## LinkedIn Easy Apply

### Step 1 — Search using LinkedIn's own filters

Do not guess Easy Apply status by matching button text; on a detail page that also matches the
"similar jobs" recommendation cards, which leads to applying to the wrong posting. Use LinkedIn's
three built-in filters instead:

- **Past 24 hours** → `f_TPR=r86400`
- **Easy Apply** → `f_AL=true`
- **Under 10 applicants** → `f_EA=true`

```
https://www.linkedin.com/jobs/search-results/?keywords=<KEYWORDS>&location=United%20States&f_TPR=r86400&f_AL=true&f_EA=true
```

Open it with `node scripts/linkedin_cdp.mjs nav "<url>"`, then read the left-hand list with
`node scripts/linkedin_cdp.mjs eval "<js>"` against `[data-occludable-job-id]` cards to get each
job's id, title, company, and posted time.

**Filters describe the search page, not each result.** Still verify posted time and reposted status
on the detail page (gates 1–2).

### Step 1.5 — Dry-run before generating anything

Run sequentially, never in parallel — the scripts share one browser tab.

```bash
node scripts/linkedin_easy_apply.mjs --job-url "<url>" --resume /dev/null --dry-run
```

- `"reason":"dry_run"` → eligible, continue to step 1.6
- `"reason":"no_easy_apply"` / `"reposted"` / `"too_old"` / `"blocklisted"` → skip
- `"reason":"no_profile"` → tell the operator to set up `profile/` first

**Generating a resume is the most expensive step. Never do it before the dry-run passes.**

### Step 1.6 — Generate the tailored resume

Read the JD body (`node scripts/linkedin_cdp.mjs eval "document.body.innerText"`, or the guest API
at `jobs-guest/jobs/api/jobPosting/{id}`) and pass it to `tailor-resume`.

### Step 2 — Apply

Check whether the LinkedIn Chrome is running:

```bash
curl -s http://127.0.0.1:9333/json/list 2>/dev/null | head -1
```

No output → start it, then **log in by hand once** in the window that opens. The session persists in
that profile directory afterward.

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/.config/linkedin-chrome-profile" \
  --no-first-run https://www.linkedin.com &
```

```bash
node scripts/linkedin_easy_apply.mjs \
  --job-url "https://www.linkedin.com/jobs/view/<id>" \
  --resume  "outputs/<resume>.pdf" \
 [--salary 95000] \
 [--extra-answers '{"question": "answer"}'] \
 [--dry-run]
```

Returns one JSON line on stdout. `"reason":"unknown_questions"` → show the questions to the
operator, then re-run with `--extra-answers`. The script never guesses an answer.

---

## Handshake Quick Apply

Use the scripts throughout; do not drive this with browser MCP tools.

### Step 1 — Search

```bash
node scripts/handshake_job_search.mjs --keywords "software engineer" [--count 20]
```

Outputs a JSON array of `{ url, title, company, postedAgo, jdText }`, already filtered for gates
1–3 and deduped against `applied_jobs.txt`.

### Step 1.5 — Dry-run, then generate

```bash
node scripts/handshake_quick_apply.mjs --job-url "<url>" --resume /dev/null --dry-run
```

`"reason":"dry_run"` → pass the `jdText` to `tailor-resume`. Any other reason → skip.

### Step 2 — Apply

Same pattern as LinkedIn on port **9334** with `$HOME/.config/handshake-chrome-profile`:

```bash
curl -s http://127.0.0.1:9334/json/list 2>/dev/null | head -1
```

```bash
node scripts/handshake_quick_apply.mjs \
  --job-url "<url>" \
  --resume  "outputs/<resume>.pdf" \
 [--dry-run]
```

`"reason":"simplified_modal"` → the modal has no upload control; see gate 5 above.

---

## Browser automation, when a script does not cover it

**Never use `browser_snapshot` for routine state checks.** A single snapshot can exceed 90K
characters. Use `browser_evaluate` instead:

| To check | Use |
|---|---|
| Posted time / reposted | `browser_evaluate` → filter `body.innerText` |
| Whether a button exists | `browser_evaluate` → query `button` text |
| Dialog or form contents | `browser_evaluate` → read `dialog.innerText` |
| Radio / checkbox state | `browser_evaluate` → check `input[type="radio"].checked` |

Use a snapshot only when you genuinely cannot locate an element, then go back to `evaluate`.

## Batching strategy

Applying to several jobs: **collect every JD first, spawn all Writers in one parallel batch, wait
for all of them, then submit one at a time.** Do not interleave "apply one, tailor one" — that
spreads sub-agent overhead across the whole session and inflates context.

## Before pushing

```bash
python3 tools/pii_scan.py
python3 -m unittest discover -s tests
```

Both must pass. `profile/` and `outputs/` must never be committed.
