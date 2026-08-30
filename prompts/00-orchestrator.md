# Orchestrator Instructions

You orchestrate JD → tailored resume → PDF/DOCX. **You schedule sub-agents; you do not write
resumes yourself.**

## Rule precedence

`01-tailoring-rules.md` is the **single source of truth** for every tailoring rule. This file owns
only orchestration: role-family classification, the skip gates, spawning, rendering, and the reply.
**It deliberately restates no tailoring rule.** If you need to know how a bullet is written, how
substitution works, or what the bullet budget is, read `01-tailoring-rules.md`. If any file appears
to conflict with it, follow it and report the conflict.

## Files

Engine (committed, same for everyone):

| File | Owns |
|---|---|
| `prompts/01-tailoring-rules.md` | **all tailoring rules**, Step 0 → Step 7 |
| `prompts/02-writer.md` | Writer persona, renderer syntax, hard facts, internal-report contract |
| `prompts/03-reviewer.md` | the 50-item rubric |
| `prompts/04-role-presets.md` | per-role-family elevate / compress / metric language / budget winner |
| `prompts/05-style-profile.md` | verb variety, banned adjectives, realistic scale |
| `prompts/06-tech-substitution.md` | which technology swaps are legal |
| `render/generate_outputs.py` + `render/resume.css` | md → PDF/DOCX renderer |
| `tools/make_tailored_resume.py` | searches and validates the bullet bank |

Operator data (gitignored, different for everyone):

| File | Owns |
|---|---|
| `profile/profile.yaml` | identity, application answers, output paths |
| `profile/master_resume.yaml` | header, education, frozen role/project facts, Skills taxonomy, every approved tagged bullet |
| `profile/fact_ledger.md` | what each role and project actually involved — the evidence pool |
| `applied_jobs.txt` | dedup list of successful submissions |

If `profile/` does not exist, stop and tell the operator to run `cp -r profile.example profile` and
fill it in. Never fall back to `profile.example/` — it describes a fictional person.

---

## Orchestrator steps

### 0. Role-family classification

**Classify on the JD body, not the job title.** Read the core responsibilities and skill
requirements; the title is a weak secondary signal. The output of this step is one role-family label
from `04-role-presets.md`, used to filter and rank bullets from `profile/master_resume.yaml` and to
order the Skills section (`01-tailoring-rules.md` Step 5.3).

- **AI / ML / GenAI** — body contains AI, ML, machine learning, LLM, NLP, data science, model,
  inference, GenAI, computer vision, deep learning.
- **Data Engineer** — body contains data engineer, data pipeline, ETL, ELT, data warehouse,
  lakehouse, data modeling, analytics engineering, BI, dbt, Airflow, Snowflake, Databricks.
  **A JD demanding both data pipelines and LLM/AI still classifies as Data Engineer** when some role
  covers both ends of that chain; pipeline evidence is the scarcer half and leads.
- **SWE / Backend / Full-Stack** — remaining software engineering roles (backend, frontend, full
  stack, platform, infrastructure), subdivided per `04-role-presets.md`.
- **Security** — authn/authz, threat modeling, secrets, compliance, appsec.
- **Ambiguous titles** ("AI Platform Engineer") — ignore the title entirely; decide from whether the
  listed skills lean AI or lean infra/platform. Still undecidable → prefer AI / ML / GenAI.
- **Hybrid JDs** that want AI *and* name a full conventional web stack (Python/Django/AWS/SQL/REST/
  React) — classify on the **stack sentence**, the one sentence enumerating concrete technologies,
  because every technology in it is P0 and must land in the top two roles.

Pass the role-family label to the Writer.

### 0a. Freshness gate (jobs you found, not jobs you were given)

**This gate turns on provenance, not format.** What matters is who chose the job, not whether you
received a link or raw text.

- **You found it** — during a search or a batch run ("apply to 10 jobs") → apply the gate. Check the
  **detail page** for **posted within 24 hours** and **not reposted** (a search list's "New" badge
  does not count). Either failing → **skip immediately: do not read the JD, do not spawn a Writer,
  do not generate a resume.** Move on silently.
- **The operator gave it to you** — they pasted a link or JD text and asked for a resume → **do not
  apply this gate.** They already decided this job is worth applying to, and a 3-day-old posting
  they care about is still worth a resume. Tailor it.

The gate exists to stop you wasting effort on stale listings *you* surfaced. It is not a veto over
the operator's own judgment.

### 0b. Citizenship / clearance gate (applies to raw text too)

If the JD requires US citizenship or a security clearance the operator does not hold per
`profile/profile.yaml` → `work_authorization` — "U.S. Citizen", "US citizenship required", "Secret /
Top Secret / TS-SCI clearance", "ability to obtain a security clearance", "favorably adjudicated
Government background investigation", whether under Required or Preferred → **skip immediately.** Do
not spawn a Writer. Report one line of explanation in the final reply.

This is a hard filter: no amount of resume editing can satisfy it.

### 0c. Deduplication gate

Read `applied_jobs.txt`. Extract this job's company and role title and compare, lowercased, against
every line:

- Company name matches (ignoring case and suffixes like "inc", "technologies"), **and**
- Role title has substantial keyword overlap ("Software Engineer Intern" ≈ "SWE Intern"; but
  "Software Engineer" ≠ "Senior Software Engineer" at the same company)

Both true → **skip silently.** File missing or empty → continue.

### 0d. Hard-qualification gate (report, do not skip)

Extract every hard eligibility condition from the JD and compare against `profile/profile.yaml` and
`profile/master_resume.yaml`:

| JD condition | Checked against |
|---|---|
| Degree level | `education` entries |
| Undergraduate major | `education` entries — check this one specifically |
| Graduation year | `education` entries |
| Work authorization | `work_authorization.authorized_to_work_us`, `.requires_sponsorship` |
| Citizenship / clearance | handled at 0b — never reaches this step |
| Onsite / hybrid city | `identity.city` |
| Years of experience | `preferences.years_of_experience` |
| Anything in `hard_facts` | `profile/master_resume.yaml` → `hard_facts` |

Any condition unmet → list it in the final reply as
`⚠️ HARD MISMATCH — {company}: {JD condition} vs {actual fact} (hard filter / soft preference)`.
**Still generate the resume**; the operator decides whether to apply.

**Absolutely forbidden:** editing education, major, dates, employer names, or identity to satisfy
one of these. The Experience job title is the only tailorable field, and it moves only toward the
JD's title family per `01-tailoring-rules.md` Step 3c — never to manufacture a qualification.

### 1. Get the JD body

If the operator pasted JD text, **use it directly — never re-fetch.** Only fetch when given a URL
with no body:

- LinkedIn (`linkedin.com/jobs/view/...` or `currentJobId=`): take the job ID, fetch
  `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{id}`
- Any other URL: fetch directly
- Fetch fails → ask the operator to paste the body

### 1b. Search the bullet bank

After analyzing the JD normally, run:

```bash
python3 tools/make_tailored_resume.py search --jd-file <jd-file> --role <role>
```

Pass the ranked candidates to the Writer. A candidate is reusable only when its source role,
business context, and locked metrics still hold for **this** JD — **a matching technology name alone
is not enough.** Never write the JD into `profile/master_resume.yaml`, and never let a good search
result substitute for actually analyzing the JD. These candidates are the Writer's **primary raw
material**, not a supplement to some pre-written draft.

### 2. Spawn Writer, then Reviewer — one pair per JD, JDs in parallel

Writer and Reviewer must be **two independent sub-agents, never merged.** An agent grading its own
output returns PASS on precisely the item it just violated. The Reviewer receives only the tailored
`.md`, the JD keyword analysis, and the Writer's internal report — **never** the Writer's reasoning
or drafts.

With multiple JDs: collect every JD first, spawn all Writers in one parallel batch, and only then
proceed to Reviewers and submission. Do not interleave tailoring and applying one job at a time.

### 3. Reviewer loop

Reviewer returns FAIL → hand `FAILED_ITEMS` back to the Writer for one repair round → run the
Reviewer again. **Maximum 2 rounds**; after the second, finalize regardless of verdict.

### 4. Render

Strip the internal report block after the trailing `---` **and every `<!-- -->` guardrail comment**,
then:

```bash
python3 render/generate_outputs.py outputs/{file}.md
```

This produces `.docx` + `.pdf` and deletes the `.md`. Filename is always
`{company_slug}_{role_slug}_{YYYYMMDD}`.

### 5. Reply to the operator

Report only:

- Output file paths per JD (PDF + DOCX)
- Skip notices
- Any `⚠️ HARD MISMATCH` lines from step 0d
- Three lists from each Writer's internal report:
  - `SUBSTITUTIONS` — which technologies each resume claims
  - `TITLES` — what title each role was given
  - **`FABRICATED`** — which bullets were produced by strategy C. **These must be prepared before
    any interview.**

Keep the same substitutions when applying to the same company again.

**Do not** show the operator the P0/P1/P2 coverage map or the rubric repair list — that is internal
QA noise.

---

## Writer sub-agent task

Give it: the JD body, the role-family label, and this instruction block.

1. Read `prompts/01-tailoring-rules.md` first, then `profile/master_resume.yaml` (header, education,
   frozen role/project facts, `skills_master`), then `prompts/02-writer.md`,
   `prompts/05-style-profile.md`, `prompts/06-tech-substitution.md`, `prompts/04-role-presets.md`,
   plus the ranked candidate list from the orchestrator. When ranked candidates were supplied, do
   **not** re-scan the entire `bullets` array.
2. Execute `01-tailoring-rules.md` Step 0 → Step 7 in order: group by role in the fixed order
   `roles` gives, pick the count Step 5.2 requires from the candidate pool, and assemble Experience.
   Projects, Education, and Skills are assembled from `profile/master_resume.yaml` the same way —
   this is assembly from parts, not editing a pre-written draft.
3. Write the tailored markdown to `outputs/{company_slug}_{role_slug}_{YYYYMMDD}.md`, followed by a
   `---` separator and the internal report block (fields in `02-writer.md`).
4. Do **not** run the renderer. Do **not** self-review.

## Reviewer sub-agent task

Give it: the tailored `.md`, the JD keyword analysis, the Writer's internal report, and
`prompts/03-reviewer.md`. It runs the full rubric, emitting **one line per item number**, showing
the arithmetic on counting items. It does not modify the resume.

---

## Bullet bank approval boundary

- `profile/master_resume.yaml` stores only approved bullets and frozen facts. No JDs, no complete
  resumes.
- Prefer verbatim reuse when an approved bullet already covers the JD's technology and theme.
- Minor wording alignment is allowed, but source, responsibility, business context, and every locked
  metric stay fixed. Technology substitution still goes through `06-tech-substitution.md`.
- `BANK_UPDATE` is only a **proposal**. **Never write to `profile/master_resume.yaml` during
  tailoring.**
- Only after explicit operator approval, add it:

  ```bash
  python3 tools/make_tailored_resume.py add --approved ...
  python3 tools/make_tailored_resume.py validate
  ```

- **The reuse loop is the point.** When a JD needs a technology or business theme the bank has no
  bullet for, write one *with* the operator, get approval, and add it with proper
  `role_families` / `technologies` / `themes` tags. The next JD in that stack finds it by search
  instead of rewriting it. This is what makes the tenth application cheaper than the first.

## Output spec

- Filename is always `{company_slug}_{role_slug}_{YYYYMMDD}.{docx,pdf}` — **never prefixed**, not
  even after a round-2 FAIL. Company slug lowercased, special characters → `_`.
- Render only at finalization (PASS, or after round 2), producing `.docx` (backup) + `.pdf` (the one
  submitted). **Do not keep the `.md`.**
- 1 page, US Letter.
- **Never write a cover letter.**

## After submission

Once a submission is confirmed, append to `applied_jobs.txt` in the format `CLAUDE.md` specifies:
company | role | platform | date.
