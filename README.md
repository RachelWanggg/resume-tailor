# resume-tailor

Paste a job description. Get a tailored, one-page PDF built from bullets you already approved — then
optionally let it apply for you on LinkedIn and Handshake.

It is not a template filler and not a "make my resume sound better" wrapper. It is a rule engine:
~2,000 lines of prompts that read a JD, decide which of your real accomplishments answer it, and
refuse to put anything on the page your own records do not support.

```
JD  →  classify role family  →  rank your bullets  →  Writer agent  →  Reviewer agent (≤2 rounds)
                                                                              ↓
                          apply on LinkedIn / Handshake  ←  1-page PDF + DOCX
```

Runs on [Claude Code](https://claude.com/claude-code) or Codex. Everything happens on your machine.

---

## ⚠️ Read this before you use it

**Automating LinkedIn and Handshake may violate their Terms of Service.** Both prohibit automated
access in their user agreements, and accounts have been restricted for it. The auto-apply half of
this repo is provided for personal, educational use. **You accept that risk, not the authors.** If
that is not a trade you want, use the tailoring half alone — it is the more valuable half anyway.

**You are responsible for every claim in a resume you submit.** The engine reorders, reframes, and
re-emphasizes what you give it. It can also, under narrow declared conditions, draft a bullet
describing work adjacent to what you did (see [Strategy C](#strategy-c-and-honesty)). Every such
bullet is reported back to you on a `FABRICATED:` line. **Read that line. Delete anything you cannot
discuss in an interview.** The tool cannot want the job honestly on your behalf.

**Your data stays on your machine.** No server, no telemetry, no account, no analytics. Your résumé
content lives in `profile/`, which is gitignored. The apply scripts never see your password: they
attach to a Chrome you launched and logged into yourself.

---

## What it actually does

**Tailoring.** Reads the JD and extracts a literal keyword inventory, split into P0 (must land in an
Experience bullet), P1 (same, sourced from Preferred), and P2 (a Skills mention suffices). Then it
assembles a resume from your approved bullet bank to cover them — reordering nothing about your
history, only deciding which of your real work to show and in which vocabulary.

**Reviewing.** A second agent, which never sees the Writer's reasoning, audits the result against a
50-item rubric: keyword coverage, metric definiteness, banned verbs, reverse-chronological ordering,
one-page fit, and whether any fact drifted from your records. Failures go back for one repair round.

**What it will not do**, by design:

- Change your degree, major, graduation date, employer names, or dates. A JD requiring a bachelor's
  you do not have is reported as a HARD MISMATCH, never quietly resolved.
- Claim seniority you do not hold. No "Senior", no "Lead", no level suffixes.
- Apply to roles requiring US citizenship or a security clearance you lack — those are skipped
  before a resume is even generated.
- Write cover letters.
- Guess an application question. An unrecognized question stops the run and asks you.

**Role families it tailors for:** AI/ML/GenAI · Backend · Full-Stack · SRE/DevOps/Platform · Data
Engineering · Security · plus an inferred fallback for anything else. Classification reads the JD
*body*, not the title, because titles lie.

---

## Quick start

### Prerequisites

| | |
|---|---|
| **Claude Code** or **Codex** | drives the pipeline |
| **Node ≥ 21** | apply scripts (uses the global `WebSocket`); no npm dependencies |
| **Python ≥ 3.11** | renderer and tools |
| **Microsoft Word** (macOS) *or* **LibreOffice** (any OS) | DOCX → PDF export |

```bash
git clone https://github.com/YOUR_USERNAME/resume-tailor.git
cd resume-tailor
pip install -r requirements.txt
```

### Fill in your profile

```bash
cp -r profile.example profile
```

`profile/` is gitignored — nothing in it is ever committed. It contains three files, and all three
ship filled in with a fictional person (Jordan Rivera) so you can see the shape before you write
your own:

| File | What it holds |
|---|---|
| `profile/profile.yaml` | name, contact, work authorization, application answers, browser paths |
| `profile/master_resume.yaml` | your bullet bank: header, education, roles, projects, skills, and every approved bullet with tags |
| `profile/fact_ledger.md` | what each role *actually* involved — the evidence pool, broader than any single resume |

Start with `profile.yaml`. Fields set to `null` are required and unanswered; the scripts refuse to
run until you fill them, and name the ones still missing. That includes work authorization and
sponsorship, which carry legal weight and are never guessed for you.

Then replace the bullets in `master_resume.yaml` with your own. Each one looks like this:

```json
{
  "id": "cobalt_retry_backoff",
  "status": "approved",
  "source": "Cobalt Health",
  "source_role": "Software Engineer Intern",
  "role_families": ["backend", "sre_platform"],
  "technologies": ["Python", "exponential backoff"],
  "themes": ["silent failure", "retries", "error handling"],
  "locked_metrics": ["92%"],
  "text": "Traced intermittent claim-submission failures to a clearinghouse that returned HTTP 200 with an error body, then added response-body inspection and bounded exponential backoff, **removing 92% of manual resubmissions**."
}
```

The tags are what make it searchable later. `locked_metrics` are frozen — the engine may reword a
bullet but may never round, widen, or soften a number in this list.

Check your work:

```bash
python3 tools/make_tailored_resume.py validate
```

### Tailor your first resume

In Claude Code, paste a JD (a link or the raw text):

```
Tailor my resume for this: https://www.linkedin.com/jobs/view/<JOB_ID>
```

Claude reads `prompts/00-orchestrator.md`, classifies the role family, ranks your bullets, spawns a
Writer and then an independent Reviewer, and renders the result. You get:

```
outputs/acme_backend_engineer_20260830.pdf   ← submit this
outputs/acme_backend_engineer_20260830.docx  ← backup
```

plus a report of which technologies the resume claims, what title each role was given, and anything
on the `FABRICATED` line.

To render a markdown resume by hand:

```bash
python3 render/generate_outputs.py outputs/your_resume.md
```

---

## Setting up auto-apply

This is the part that trips people up, so here it is in full.

### How login works

**The scripts have no login capability, and should not have one.** They attach over the Chrome
DevTools Protocol to a browser *you* started and *you* logged into. The repo stores no password, no
cookie, and no session token, and talks to no server of its own.

Your session lives in a dedicated Chrome profile directory under `~/.config/`, outside this repo.
That directory is credential-equivalent — treat it like a password file, and never move it inside
the repo (`.gitignore` has a backstop, but do not rely on it).

### One-time setup

Start a dedicated Chrome for LinkedIn and **log in by hand in the window that opens**:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/.config/linkedin-chrome-profile" \
  --no-first-run https://www.linkedin.com &
```

And a second one for Handshake, on a different port and profile:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9334 \
  --user-data-dir="$HOME/.config/handshake-chrome-profile" \
  --no-first-run https://app.joinhandshake.com &
```

You log in once. The session persists in the profile directory from then on. Check a port is live:

```bash
curl -s http://127.0.0.1:9333/json/version
```

On Linux, replace the binary path with `google-chrome`. On Windows, use
`chrome.exe --remote-debugging-port=9333 --user-data-dir=%USERPROFILE%\.config\linkedin-chrome-profile`.

Change the ports or directories in `profile/profile.yaml` under `browser` if these clash with
something.

### Always dry-run first

```bash
node scripts/linkedin_easy_apply.mjs \
  --job-url "https://www.linkedin.com/jobs/view/<JOB_ID>" \
  --resume /dev/null --dry-run
```

`{"reason":"dry_run"}` means the job passed every gate and a real run would proceed. Nothing was
submitted. Do this before generating a resume — generating is the expensive step.

### Then apply

```bash
node scripts/linkedin_easy_apply.mjs \
  --job-url "https://www.linkedin.com/jobs/view/<JOB_ID>" \
  --resume  "outputs/acme_backend_engineer_20260830.pdf"
```

Handshake works the same way, and ships a search command too:

```bash
node scripts/handshake_job_search.mjs --keywords "software engineer" --count 20
node scripts/handshake_quick_apply.mjs --job-url "<url>" --resume "outputs/....pdf" --dry-run
```

### The gates every job must pass

| Gate | Why |
|---|---|
| Posted within **24 hours** | older postings are usually already shortlisted |
| **Not reposted** | a repost usually means the previous round failed or the req is stale |
| **In-platform apply only** | Easy Apply / Quick Apply; external ATS links are skipped |
| **A tailored resume**, never the platform default | one-click submitting a generic resume defeats the entire point |
| **No citizenship / clearance roles** | unless your profile says you qualify |
| **Not already applied** | deduped against `applied_jobs.txt` |

### When it stops and asks

```json
{"success": false, "reason": "unknown_questions",
 "unknownQuestions": [{"label": "How many years of Kubernetes experience?", "type": "text"}]}
```

The script found a question it has no answer for and **stopped rather than guessing**. Answer it
once inline, or add it to your profile if it will recur:

```bash
node scripts/linkedin_easy_apply.mjs --job-url "..." --resume "..." \
  --extra-answers '{"years of Kubernetes": "2"}'
```

Other stop reasons: `no_profile` (set up `profile/` first), `simplified_modal` (Handshake offered no
upload control — upload your tailored PDF to the document library and set it as default first),
`blocklisted` (matched `blocklist` in your profile).

---

## Repository layout

```
prompts/            Every rule the agents follow. Start here to customize.
profile.example/    Fictional profile — copy to profile/ and replace.
profile/            YOUR data. Gitignored, never committed.
scripts/            LinkedIn + Handshake automation over Chrome DevTools Protocol.
tools/              Bullet-bank search/validate, PII scanner, CDP debug CLI.
render/             Markdown → DOCX → PDF. resume.css is the only styling source.
tests/              Scorer regression tests, run against a fixture, not your data.
outputs/            Generated resumes. Gitignored.
CLAUDE.md           Apply gates + platform flows for Claude Code.
AGENTS.md           The same entry point for Codex.
```

## Customizing the prompts

Everything lives in [`prompts/`](prompts/), one folder, read identically by Claude Code and Codex.
See [`prompts/README.md`](prompts/README.md) for the full map. The highlights:

| File | Change it to… |
|---|---|
| `01-tailoring-rules.md` | retune bullet length, verb lists, the P0/P1/P2 model, bullet budget |
| `04-role-presets.md` | add a role family or retune what each one emphasizes |
| `05-style-profile.md` | change tone, banned adjectives, realistic scale ceilings |
| `06-tech-substitution.md` | add a technology or a legal peer swap |
| `03-reviewer.md` | change what counts as a failing resume |

**Precedence:** `01-tailoring-rules.md` > `00-orchestrator.md` > `CLAUDE.md` > `profile.yaml`. No
rule is allowed to live in two files — if you find one stated twice, one copy is already stale.

## The bullet bank, and why it compounds

The first application is the expensive one. You write bullets, tag them, and approve them. Every one
goes into `profile/master_resume.yaml` with its `role_families`, `technologies`, and `themes`.

The tenth application is cheap. `tools/make_tailored_resume.py search` ranks that bank against the
new JD and hands the Writer ranked candidates, most of which are reused verbatim. You only write new
prose when a JD asks for something genuinely absent — and then that becomes bank material too.

```bash
python3 tools/make_tailored_resume.py search --jd-file jd.txt --role "Backend Engineer"
python3 tools/make_tailored_resume.py validate
python3 tools/make_tailored_resume.py add --approved --source "..." --bullet "..." \
  --source-role "..." --role-families "backend,sre_platform" --technologies "Go,PostgreSQL"
```

Nothing is ever written to the bank during tailoring. New bullets are surfaced as `BANK_UPDATE`
proposals and added only when you run `add --approved` yourself.

## Strategy C, and honesty

`01-tailoring-rules.md` Step 3 permits, as a last resort, a bullet describing work you did not
literally do. It is fenced hard: it must sit inside a real role, cover a genuinely uncovered P0/P1,
pass a two-axis plausibility test (would this industry, and would *this product*, have needed it?),
carry an honest intern-scale metric, and be **declared** on the Writer's `FABRICATED:` line, which
is surfaced to you every time.

That declaration is the point. You always know exactly what is on the page.

If you would rather never do this, delete strategy C's last branch from `01-tailoring-rules.md`
Step 3. The pipeline will report more TRUE GAPs instead. That is a completely legitimate way to run
it, and the gap report is useful on its own — it tells you what to go learn.

## Limitations and roadmap

Honest list of what is missing:

- **PDF export needs Word or LibreOffice.** The LibreOffice path is implemented but lightly tested
  outside macOS.
- **Two platforms only.** Greenhouse, Lever, Workday, and Ashby are not implemented; external
  "Apply on company website" postings are skipped by design.
- **Unknown questions halt the run.** Deliberate — but it means unattended batches can stall.
- **`applied_jobs.txt` is a flat text file.** No analytics, no UI.
- **One visual style.** `render/resume.css` is the only theme.
- **Thin test coverage.** Seven tests over the bullet-ranking scorer; no CI.
- **LinkedIn search uses hand-built URL filter parameters**, which break when LinkedIn changes them.

## Contributing

```bash
python3 tools/pii_scan.py                  # must pass — scans for names, emails, phones, secrets
python3 -m unittest discover -s tests      # must pass with no profile/ present
```

Never commit `profile/`, `outputs/`, or `applied_jobs.txt`. Run `pii_scan.py` before every push; it
is a safety net, not a guarantee, so read your diff too.

The test suite deliberately runs against `tests/fixtures/sample_bank.yaml` rather than any real
profile, so a contributor can run it on a fresh clone.

## License

MIT — see [LICENSE](LICENSE).

Not affiliated with LinkedIn, Handshake, or Anthropic.
