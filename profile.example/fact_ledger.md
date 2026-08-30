# Fact Ledger

> **This file is the truth.** It records what each of your roles and projects *actually* involved —
> deliberately broader than what any single tailored resume shows. `01-tailoring-rules.md` Step 2
> draws its evidence from here, and `06-tech-substitution.md` will only permit a technology swap
> that this ledger supports.
>
> Nothing here is invented. If you did not do it, it does not go in this file, and no amount of
> JD pressure downstream can put it on the page.
>
> **Everything below describes Jordan Rivera, a fictional person.** Replace it with your own.

## How to write your own

One section per role and per project, in the same reverse-chronological order as
`master_resume.yaml`. For each, record:

1. **Business context** — what the product was and who used it. This is what makes a technology
   plausible or implausible later. A swap that fits the tech but not the business fails.
2. **Confirmed technologies** — everything you genuinely touched, including the parts no bullet
   currently mentions. This is the reservoir a future JD draws from.
3. **Numbers you can defend** — the real measurements. A metric that reaches the resume becomes a
   `locked_metric` in `master_resume.yaml` and can never be adjusted afterward.
4. **Explicit negatives** — things you did *not* do that a reader might assume you did. These are
   the most valuable lines in the file, because they stop a plausible-sounding fabrication before
   it starts.

Date every correction. When you discover the ledger recorded something wrong, fix it here first;
every downstream file inherits from this one.

---

# Cobalt Health · Austin, TX · Jun. 2025 – Present

*Title is JD-driven per `01-tailoring-rules.md` Step 3c — no fixed starting title. Real duties:
document extraction with LLMs, the backend that serves it, and the reviewer tooling around it.*

**Business context:** clinical billing SaaS for small medical practices. The product ingests
insurance remittance documents (EOBs), extracts payment and adjustment fields, and posts them
against outstanding claims. Roughly 90 practices; tens of thousands of documents per month. Errors
are expensive and visible, which is why every automated decision has a human escape hatch.

**Confirmed:**
- **Python 3.12**, **Django** (the existing app), **FastAPI** (the extraction service)
- **PostgreSQL** — claims, remittances, audit trail
- **LLM extraction** against OpenAI and Claude APIs, output validated with **JSON Schema**
- Golden-set evaluation harness, 480 hand-labeled documents, run in CI on every prompt change
- **React + TypeScript** reviewer console
- **AWS**: RDS, S3 for document storage, Secrets Manager, IAM per-service roles
- **Terraform** for the pieces added during the secrets migration (not the whole estate)
- SOC 2 readiness work: audit logging, access review, credential rotation

**Numbers that can be defended:**
- Mis-posted claim rate 4.1% → 0.6% after the extraction rewrite
- 480 labeled documents in the golden set
- Median human review 6 min → 90 s
- 23 credentials migrated out of the deploy repo
- 11 endpoints that previously logged no audit record

**Explicitly NOT done here:**
- No model training or fine-tuning. Prompting and retrieval only.
- No Kubernetes. Services run on ECS.
- No PHI left the customer's region; there was no cross-region replication to speak of.

---

# Northwind Logistics · Austin, TX · Sep. 2024 – May 2025

**Business context:** freight routing and rate-quoting SaaS for regional carriers. Customers submit
shipments; the platform quotes rates pulled nightly from ~40 carrier feeds and books the route.
Rate data is the product, so freshness and correctness of the pipeline matter more than latency.

**Confirmed:**
- **Python**, **Django**, REST APIs with versioned contracts
- **PostgreSQL** (12M+ shipment rows), query profiling with `EXPLAIN ANALYZE`, partial composite
  indexes
- **Airflow** — incremental DAGs, per-source watermarks
- **dbt** — 34 models, schema and freshness tests
- **Redis** — rate-lookup cache with single-flight fill
- **React + TypeScript** — multi-step booking form
- **GitHub Actions**, **Docker** layer caching, parallel test jobs

**Numbers that can be defended:**
- Nightly ingestion 9 h → 22 min
- Route-quoting p95 1.8 s → 210 ms
- $1,900/month reduction in third-party API spend
- CI feedback 18 min → 5 min
- Booking-form abandonment 38% → 14%
- 3 upstream feed outages caught by dbt tests in the first month

**Explicitly NOT done here:**
- No streaming. Everything is batch; there was no Kafka and no event bus.
- No data warehouse. dbt ran against Postgres, not Snowflake or BigQuery.
- Did not own the carrier integrations themselves, only the ingestion of their feeds.

---

# Beacon IoT Systems · Denver, CO · Jun. 2023 – Aug. 2024

**Business context:** industrial sensor telemetry for cold-chain warehousing. 2,400 deployed
temperature and humidity sensors report every 30 seconds through gateway devices. The customer
value is catching a refrigeration fault before inventory spoils, so false alerts are nearly as
costly as missed ones.

**Confirmed:**
- **Go** — ingestion service, dead-letter handling, mTLS device auth
- **TimescaleDB** hypertables, batched writes
- **AWS**: SQS, Lambda, S3, ACM Private CA for device certificates
- **Terraform** — full staging environment
- **Prometheus + Grafana** — decode failures, queue depth, write latency
- **Python** + **scikit-learn** — seasonal decomposition baseline for drift detection

**Numbers that can be defended:**
- 2,400 sensors, 30-second reporting interval
- 800 sustained writes/second on one node
- False alerts 200/week → 12/week, no true fault missed
- 6 hours of readings lost in the firmware incident that motivated the dead-letter queue
- Staging rebuilt from scratch in 12 minutes after Terraform

**Explicitly NOT done here:**
- No deep learning. The detector is a statistical baseline, not a neural model.
- No Kubernetes. This was ECS and Lambda.
- Did not write gateway firmware; consumed what it sent, including when it broke.

---

# Projects

## queuelite — Postgres-backed job queue · open source

**Context:** a deliberately small job queue, written to be read. Go, ~1,400 lines, at-least-once
delivery, visibility timeouts, `SKIP LOCKED` dequeue, no dependency beyond Postgres. 340 GitHub
stars, 9 outside contributors. Benchmarked to 1,100 jobs/second on a single instance.

**Explicitly NOT:** not distributed across nodes, no exactly-once semantics, no priority queues.

## Sensor Rule Replay Dashboard · Northlake University, Systems Lab · Jan. 2025 – Apr. 2025

**Context:** Next.js dashboard that replays 18 months of recorded sensor windows against a
candidate detection rule and shows which alerts it *would* have fired, so a rule change can be
judged before deployment. Python backend for the replay engine.

## costcli — cloud spend reconciler · open source · Oct. 2024 – Dec. 2024

**Context:** Python CLI reconciling AWS Cost Explorer exports against tagged resources, reporting
untagged spend by account. Surfaced $3,100/month of unattributed cost across 4 accounts on its
first run.

---

# Cross-cutting

Things true across more than one role, recorded once here rather than repeated above:

- Git, trunk-based development, pull-request review on every change
- Linux, Bash, Docker
- pytest and Go's built-in testing; load testing with `k6` at Northwind
- Reading production logs and metrics as the first debugging step, at all three roles

**Never claimed anywhere:** leading a team, managing people, owning a budget, or on-call ownership
of a system as the primary responder. All three roles were internships.
