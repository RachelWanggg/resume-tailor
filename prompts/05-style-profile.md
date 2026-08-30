# Style Profile

> **All bullet-writing rules live in `01-tailoring-rules.md` Step 4.** That file is
> the source of truth for the bullet pattern, length band, verb lists, bolding, metric definiteness,
> the marketing-metric ban, punctuation, taglines, tech density, and tense. Read it there; it is not
> duplicated here, because two copies of a rule means one of them is always stale.
>
> This file holds only the conventions that Step 4 does not cover.

## Verb variety within a role

Do not reuse the same opening verb twice inside one role or project. Cross-role repeats are fine.
The universal prompt supplies the approved verb list; this rule governs how you spend it.

Prefer the precise verb over the generic one. A bullet about replacing a system opens with
`Rebuilt` or `Replaced`, not `Built`. A bullet about adding instrumentation opens with `Logged` or
`Instrumented`. A bullet about narrowing a retry loop opens with `Tuned`.

## Words that do not belong on the page

- **Adjectives of self-praise:** scalable, robust, efficient, seamless, cutting-edge, innovative.
  If the system was scalable, the number shows it.
- **Soft-skill verbs as the accomplishment:** collaborated, communicated, coordinated, partnered.
  These are only acceptable inside a concrete technical action ("gated deployments on peer review"),
  never as the thing achieved.
- **Vague nouns standing alone:** architecture, systems, scale, solutions, infrastructure. Each is
  acceptable only when bound to a specific technology or a number.

## Realistic scale for an intern / new-grad resume

- User counts: up to 100K. Never 1M+.
- Throughput: hundreds of QPS. Never 1B.
- Team: never claim to have led one.
- Cost figures: consistent with small-scale systems.

## Reference

`04-role-presets.md` supplies the metric vocabulary per role family and the reframing table.
`profile/fact_ledger.md` supplies the fact ledger; Parts 1–5 govern substitution.
