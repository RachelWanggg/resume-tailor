---
name: tailor-resume
description: Tailor the operator's resume to one or more job descriptions and produce ready-to-submit PDF/DOCX. Use whenever the user pastes JD links or raw JD text for software, AI/ML, data, or infrastructure roles. Runs an orchestrator → Writer → independent Reviewer pipeline in parallel across JDs, then outputs a 1-page PDF + DOCX per JD.
---

# Tailor Resume to JD

All instructions live in the repo's `prompts/` directory so that Claude Code, Codex, and any other
agent read exactly the same rules.

**Read `prompts/00-orchestrator.md` now and follow it.** It defines your role as orchestrator, the
skip gates, sub-agent spawning, rendering, and the reply format, and it points to the rest:

| File | Owns |
|---|---|
| `prompts/01-tailoring-rules.md` | every tailoring rule — the single source of truth |
| `prompts/02-writer.md` | Writer persona, renderer syntax, output contract |
| `prompts/03-reviewer.md` | the 50-item review rubric |
| `prompts/04-role-presets.md` | per-role-family emphasis and metric vocabulary |
| `prompts/05-style-profile.md` | verb variety, banned adjectives, realistic scale |
| `prompts/06-tech-substitution.md` | which technology swaps are legal |

The operator's own data — identity, résumé bullets, application answers — lives in `profile/`.
If `profile/` is missing, stop and tell the operator to run
`cp -r profile.example profile` and fill it in. Never read resume content from `profile.example/`;
it describes a fictional person.
