# prompts/

Every rule the agents follow lives here, in one folder, read by Claude Code and Codex alike. Nothing
in this directory contains personal data — your identity and résumé content live in `profile/`.

## The files, in reading order

| File | Read by | Owns | Edit when you want to… |
|---|---|---|---|
| `00-orchestrator.md` | orchestrator | pipeline control: role-family classification, skip gates, spawning, rendering, the reply | change which jobs are skipped, or how results are reported |
| `01-tailoring-rules.md` | Writer | **every tailoring rule**, Step 0 → Step 7 | change bullet length, verb lists, the P0/P1/P2 model, bullet budget, Skills order |
| `02-writer.md` | Writer | persona, markdown syntax the renderer needs, hard-fact protection, internal-report format | change resume section layout or the renderer contract |
| `03-reviewer.md` | Reviewer | the 50-item rubric | change what counts as a failing resume |
| `04-role-presets.md` | Writer | per-role-family emphasis, metric vocabulary, Skills lead category | add a role family, or retune an existing one |
| `05-style-profile.md` | Writer | verb variety, banned adjectives, realistic scale ceilings | change tone or the self-praise blocklist |
| `06-tech-substitution.md` | Writer, Reviewer | which technology swaps are legal, and which are forbidden | add a technology, or a swap the tables miss |

## Precedence

```
01-tailoring-rules.md  >  00-orchestrator.md  >  CLAUDE.md  >  profile/profile.yaml
```

`01-tailoring-rules.md` wins every conflict. **No rule is allowed to exist in two files** — if you
find a rule stated twice, one copy is already stale. Delete it and point at the owner instead.

## Customizing

Start by editing `04-role-presets.md` and `05-style-profile.md`; they carry the most taste per line
changed and the least risk of breaking the pipeline.

To **add a role family**: add a block to `04-role-presets.md` following the existing shape (Elevate
/ Compress / Metrics language / Bullet budget winner / Skills first category), add its keyword
triggers to `00-orchestrator.md` step 0, add its key to `skills_lead_category_by_role_family` in
`profile/master_resume.yaml`, and tag your bullets with it.

To **change how aggressively the resume tailors**, look at `01-tailoring-rules.md` Step 3
(evidence-backed alignment strategies) and Step 5.2 (bullet budget). Every claim must remain
traceable to `profile/master_resume.yaml` or `profile/fact_ledger.md`; unsupported requirements are
reported as TRUE GAPs.
