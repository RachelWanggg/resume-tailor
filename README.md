# resume-tailor

Turn a job description into a tailored, one-page resume using your own approved experience bank.
One agent writes the resume, a second agent reviews it, and the pipeline produces a PDF and DOCX.

Works with [Claude Code](https://claude.com/claude-code) and
[Codex](https://developers.openai.com/codex/cli/).

## What It Does

- Reads the JD and identifies its role family, required technologies, domain language, and hard
  qualification filters.
- Selects the most relevant experience bullets from your profile.
- Rewrites and reorders content for the JD without inventing unsupported facts.
- Runs an independent review for keyword coverage, factual accuracy, bullet quality, and one-page
  fit.
- Produces a ready-to-submit PDF and an editable DOCX.
- Optionally applies through LinkedIn Easy Apply or Handshake Quick Apply.

## Workflow

```text
Add your profile
      ↓
Paste a job URL or job description
      ↓
Analyze JD → select evidence → write resume → review resume
      ↓
PDF + DOCX
      ↓
Submit manually or use optional auto-apply
```

## Getting Started

### Prerequisites

- Python 3.11+
- Claude Code or Codex
- Microsoft Word on macOS, or LibreOffice, for PDF export
- Node.js 21+ and Google Chrome only for auto-apply

### 1. Install

Clone or download the repository, then run:

```bash
cd resume-tailor
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

### 2. Create Your Profile

Open the repository in Claude Code or Codex and say:

```text
Set up my profile using my existing resume at /path/to/resume.pdf. Ask me for any missing information.
```

The agent will create `profile/` and fill it with information from your resume. To set it up
manually instead, use the example files:

#### Manual Setup

```bash
cp -r profile.example profile
```

Replace the fictional example data in:

| File | Your information |
|---|---|
| `profile/profile.yaml` | contact details, work authorization, application answers, preferences |
| `profile/master_resume.yaml` | education, roles, projects, skills, approved bullets |
| `profile/fact_ledger.md` | the fuller facts, technologies, metrics, and limits behind each role |

For example, edit the corresponding sections of `profile/profile.yaml` like this:

```json
{
  "identity": {
    "full_name": "Jordan Rivera",
    "email": "jordan.rivera@example.com",
    "phone": "5550142",
    "city": "Austin",
    "state": "TX",
    "linkedin_url": "https://www.linkedin.com/in/jordan-rivera-example",
    "github_url": "https://github.com/example-user"
  },
  "work_authorization": {
    "authorized_to_work_us": true,
    "requires_sponsorship": false,
    "us_citizen_or_permanent_resident": false,
    "has_security_clearance": false
  }
}
```

Keep the remaining structure from `profile.example/` and replace every fictional value with your
own information.

Validate the resume bank:

```bash
python3 tools/make_tailored_resume.py validate
```

Expected result:

```json
{"valid": true, "errors": []}
```

### 3. Generate a Tailored Resume

Open the repository in Claude Code or Codex and say:

```text
Tailor my resume for this job: <job URL or pasted job description>
```

The agent reads the repository instructions, runs the Writer and Reviewer workflow, and returns:

```text
outputs/acme_backend_engineer_20260830.pdf
outputs/acme_backend_engineer_20260830.docx
```

It also reports hard qualification mismatches, technology substitutions, tailored role titles, and
`TRUE_GAP` requirements that your recorded experience does not support.

Review the PDF, then submit it manually or continue to auto-apply.

## Optional Auto-Apply

Auto-apply supports LinkedIn Easy Apply and Handshake Quick Apply. It uses a dedicated Chrome
session that you open and log into yourself; the scripts do not ask for your password.

To let the agent run the full workflow, say:

```text
Find and apply to 5 new software engineering jobs on LinkedIn using this project's apply gates.
Use a tailored PDF for every job and stop if an application asks an unknown question.
```

The workflow checks posting age, repost status, apply method, duplicate applications, citizenship
and clearance requirements, and unknown form questions before submission. Successful applications
are recorded in `applied_jobs.txt`.

See [CLAUDE.md](CLAUDE.md#linkedin-easy-apply) for the direct LinkedIn and Handshake setup and script
commands. Browser automation interacts with third-party platforms; review their current rules before
using it.

## Project Structure

```text
prompts/            Tailoring, Writer, and Reviewer rules
profile.example/    Fictional profile to copy and replace
profile/            Your working profile
scripts/            LinkedIn and Handshake automation
tools/              Resume-bank search, validation, and data scanning
render/             DOCX/PDF renderer and resume stylesheet
outputs/            Generated resumes
```

## Current Limitations

- Auto-apply supports two platforms and may break when their pages change.
- Unknown application questions stop the workflow.
- PDF export requires Microsoft Word or LibreOffice.
- Browser automation does not have end-to-end tests.

## License

MIT — see [LICENSE](LICENSE).

Not affiliated with LinkedIn, Handshake, Anthropic, or OpenAI.
