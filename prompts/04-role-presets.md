# Role-Family Presets

Pick the ONE block matching the target role, inferred from the JD body, not the title. This layer
sits on top of `profile/master_resume.yaml`. It does not change role order — it changes **what gets
elevated, what gets compressed, which role wins the bullet budget, which metric language the
bullets are written in, and which Skills category leads**.

If the JD matches no block below, infer the equivalent block from the JD itself before writing, and
state the inferred block in the internal report.

> **Role order is not tunable.** Experience is always strict reverse chronological by end date —
> the order `roles` appears in `profile/master_resume.yaml`. JD relevance is expressed only through
> **bullet count** (universal prompt Step 5.2): the closest role gets 4–5 bullets, the next 3–4, the
> least relevant 2–3, floor of 1, ceiling of 12 total.

> **"Bullet budget winner" names evidence, not a company.** Each preset below describes *what kind
> of experience* should win the largest budget. Resolve it against the operator's own roles by
> reading `profile/fact_ledger.md` and the `role_families`/`themes` tags in
> `profile/master_resume.yaml`. Whichever role has the deepest genuine evidence for that preset's
> **Elevate** list wins — and if no role has any, say so in the internal report rather than
> promoting a role that cannot support the claim.

## How to use a preset

1. **Elevate** — these themes win the largest bullet budget and get first claim on P0 keywords.
2. **Compress** — these get squeezed to the minimum bullet count. Never delete a role.
3. **Metrics language** — re-express existing outcomes in this vocabulary. Same fact, different
   framing, only where the reframing is literally true of what was done.
4. **Skills first category** — this category goes first, ahead of Languages, always.

> The global rules in the universal prompt Step 4 apply to **every** preset, not only the blocks
> that mention them: no marketing-outcome metrics, single definite values only, no banned verbs,
> 200–320 characters, ≤3 technologies per bullet.

---

## AI / ML / GenAI Engineer

- **Elevate:** agentic systems, LLM orchestration, retrieval/RAG, tool use and function calling,
  structured output, evaluation frameworks and human-in-the-loop, prompt engineering, inference cost
  and latency, failure modes and guardrails.
- **Compress:** generic infrastructure config, CRUD features.
- **Metrics language:** accuracy/recall, grounding and hallucination rate, token cost, inference
  latency, acceptance rate, eval scores, iteration count.
- **Bullet budget winner:** the role with the most genuine LLM/agent evidence — retrieval,
  orchestration, evaluation, or guardrail work in its ledger entry. A role whose only AI content is
  "called an API once" does not win this budget.
- **Skills first category:** `Agentic AI & LLM` (`01-tailoring-rules.md` Step 5.3).
- **Project note:** default to the project whose ledger entry is closest to the JD's problem. For
  ranking, recsys, or search-relevance JDs specifically, prefer a project involving retrieval,
  scoring, or re-ranking over a general-purpose one, if `profile/master_resume.yaml`'s `projects`
  offers one.

## SWE / Backend

- **Elevate:** system design, API design, data modeling, caching, concurrency, distributed systems,
  performance work, testing and CI/CD.
- **Compress:** product-surface and content-pipeline work; lead with architecture and system numbers.
- **Metrics language:** p50/p99 latency, throughput/QPS, error rate, uptime, cost per request, scale.
- **Bullet budget winner:** the role with the deepest service-side evidence — API surface, data
  modeling, caching, concurrency, or measured performance work.
- **Skills first category:** `Backend & APIs` (Step 5.3 table).

## SRE / DevOps / Platform / Infrastructure

- **Elevate:** reliability, incident response, observability and instrumentation, SLI/SLO and error
  budgets, IaC, capacity and autoscaling, failure modes, blast radius, rollback and progressive
  delivery, toil reduction and automation.
- **Compress:** product features and UI work; reframe them as what was learned operating them.
- **Metrics language:** availability/nines, MTTR/MTTD, deploy frequency, change failure rate, alert
  volume and noise reduction, hours of toil eliminated, infra cost.
- **Bullet budget winner:** the role carrying the most operational evidence — queueing, retries,
  dead-letter handling, instrumentation, IaC, or a real incident.
- **Skills first category:** `Practices & Tooling` (Step 5.3 table; may be renamed
  `Reliability & Tooling`).
- **Surfacing note (important):** retry/backoff, queueing, dead-letter queues, rate limiting,
  caching, health checks, and CI/CD gating **are** reliability engineering. Most candidates already
  have several of these, buried inside bullets filed under a different theme. Before reporting a gap,
  re-read every bullet in `profile/master_resume.yaml` and every ledger entry looking specifically
  for: message fan-out and consumers, dead-letter handling, bounded retries and backoff, request
  queueing, cache invalidation strategy, deploy gating, structured logging, and fault injection.
  Reframing one of those in reliability vocabulary is legitimate — it is the same fact, stated in the
  idiom the JD reads in. Inventing one is not.
- **Structural-gap warning:** if the team's scope is **physical** (hardware fleet, datacenter
  capacity, provisioning), check universal prompt Step 1.8. An all-application-layer background
  against a physical-infrastructure team is a structural gap that rewording cannot close. Say so in
  the internal report and flag the application as low-probability rather than papering over it.

## Data Engineer

- **Elevate:** pipelines, ingestion, batch vs streaming, schema and contract design, orchestration,
  data quality and validation, warehouse modeling, backfills and idempotency.
- **Metrics language:** rows/events per day, freshness and lag, pipeline SLA, storage/compute cost,
  data quality pass rate.
- **Bullet budget winner:** the role that owns the longest end-to-end data path — ingestion
  through transformation to a queryable store. A role that merely reads from a database does not
  outrank one that built the pipeline filling it.
- **Skills first category:** `Data & Pipelines` (Step 5.3 table).
- **Classification note:** a JD asking for both data pipelines and LLM/AI still classifies as Data
  Engineer (see `00-orchestrator.md` Step 0), provided some role's ledger covers both ends of that
  chain. The pipeline evidence is the scarcer half and leads.

## Full-Stack

- **Elevate:** end-to-end ownership, API and UI in the same bullet, state management, client
  performance (bundle size, render/LCP), accessibility, shipping cadence.
- **Metrics language:** page load, interaction latency, adoption/retention, release frequency.
- **Bullet budget winner:** the role where the same person owned both the API and the UI on top
  of it. Split ownership across two roles is weaker evidence than one end-to-end role.
- **Skills first category:** `Backend & APIs` (Step 5.3 table).
- **Accessibility note:** if `profile/fact_ledger.md` records accessibility work (WCAG conformance,
  screen-reader support, keyboard navigation), surface it whenever the JD mentions accessibility. It
  is commonly done and almost never written down.

## Security

- **Elevate:** threat modeling, authn/authz, secrets management, dependency and supply-chain
  hygiene, least privilege, audit logging, compliance frameworks.
- **Metrics language:** vulnerabilities found/remediated, time-to-patch, blast radius reduced, audit
  findings closed.
- **Bullet budget winner:** the role with real authn/authz, secrets, or audit-trail work. Security
  evidence is usually buried inside bullets written about something else — credential handling,
  permission scoping, certificate rotation — so read the ledger before concluding there is none.
- **Skills first category:** `Practices & Tooling` (Step 5.3 table).

---

## Metric-language reframing — worked examples

One real fact supports several framings. Pick the framing that matches the JD's quality attributes
(universal prompt Step 1.3). Never invent a second number; reframe the one that exists.

The rows below use the example persona's facts. Build the same table from the operator's own
`locked_metrics` — one row per number that could legitimately be told more than one way.

| Real fact | Backend framing | SRE framing | AI / Data framing |
|---|---|---|---|
| Redis cache with single-flight fill, $1,900/month less upstream spend | cut third-party API cost by $1,900/month through request deduplication | removed duplicate upstream load during traffic spikes, saving $1,900/month | n/a |
| Dead-letter queue added after 6 hours of readings were lost | isolated undecodable payloads without dropping them | ended silent data loss; 6 hours of readings had vanished with no failure signal | preserved 6 hours of malformed records for reprocessing rather than discarding them |
| Partial composite index, p95 1.8s → 210ms | cut route-quoting p95 from 1.8s to 210ms | removed the dominant source of peak-load latency | n/a |
| Golden-set eval harness, mis-posted claims 4.1% → 0.6% | n/a | added an automated release gate on output quality | cut mis-posted claims from 4.1% to 0.6% against a 480-document golden set |
| Seasonal baseline, 200 → 12 false alerts/week | n/a | cut alert volume by 94% with no true fault missed | replaced fixed thresholds with a seasonal baseline, 200 to 12 weekly false positives |
| Incremental DAG with watermarks, 9h → 22min | n/a | cut nightly batch window from 9 hours to 22 minutes | made ingestion incremental, ending full reloads on a single malformed row |
