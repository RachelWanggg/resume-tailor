# Resume Tailoring Pipeline — Codex entry point

This file intentionally contains **no rules of its own**. A rule that exists in two places drifts,
so everything lives in exactly one file and this one only points.

Read these, in order, before touching anything:

1. **`prompts/00-orchestrator.md`** — the authoritative workflow: role-family classification, skip
   gates, Writer/Reviewer orchestration, rendering, reply format.
2. **`prompts/01-tailoring-rules.md`** — **the single source of truth for every tailoring rule**:
   Step 0 qualification gate, the JD inventory, P0/P1/P2, the mapping matrix, technology
   substitution, bullet writing, ordering and budget, Skills order, domain alignment, QC checklist.
3. **`CLAUDE.md`** — the platform apply gates (24h, not reposted, in-platform apply only, answers
   from the profile, always a tailored resume, skip citizenship/clearance roles), the LinkedIn and
   Handshake script flows, `applied_jobs.txt` dedup rules, and the output spec. Codex and Claude
   Code follow the same one.
4. **`applied_jobs.txt`** — the dedup list of past submissions.

Supporting references, read when the workflow calls for them:
`prompts/02-writer.md` (Writer contract, renderer syntax, hard facts) ·
`prompts/03-reviewer.md` (the 50-item rubric) · `prompts/04-role-presets.md` ·
`prompts/05-style-profile.md` · `prompts/06-tech-substitution.md`

**Precedence:** `01-tailoring-rules.md` > `00-orchestrator.md` > `CLAUDE.md` >
`profile/profile.yaml`.

## The operator's data

Everything personal lives in `profile/`:

- `profile/master_resume.yaml` — the single source of resume content: header, education, frozen
  role/project facts, the Skills taxonomy, and every approved tagged bullet. Every resume is
  assembled fresh from it.
- `profile/fact_ledger.md` — what each role and project actually involved; the evidence pool that
  decides whether a technology claim is legitimate.
- `profile/profile.yaml` — identity, application Q&A answers, output paths. Facts only, no workflow.

When the operator asks to set up their profile from an existing resume, copy `profile.example/` to
`profile/`, populate all three files from the supplied resume, and ask for anything missing. Never
invent a fact. If tailoring is requested before setup and no resume was supplied, ask the operator
to set up `profile/` first. Never treat `profile.example/` as the operator's resume; it describes a
fictional person.

Role-family classification is driven by **JD body content, not job title** — see
`prompts/00-orchestrator.md` step 0.

## Rendering

```bash
python3 render/generate_outputs.py <input.md>
```

Styling comes only from `render/resume.css`. PDF export uses Microsoft Word on macOS, or
LibreOffice anywhere; on macOS the execution context must be allowed to automate Word.
