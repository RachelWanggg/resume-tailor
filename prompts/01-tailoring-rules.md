# Resume ↔ JD Tailoring Rules

> **This file is the single source of truth for every tailoring rule.** If `00-orchestrator.md`,
> `02-writer.md`, `03-reviewer.md`, `CLAUDE.md`, or `profile/profile.yaml` appears to
> contradict anything here, this file wins and the other file is the bug — fix it there rather
> than working around it.
>
> **Who reads this:** the Writer sub-agent executes Step 0 → Step 7 in order. The Reviewer's rubric is derived from these steps. The orchestrator applies only Step 0's gates.
>
> **What is deliberately NOT here**, so no rule exists in two places:
>
> | Elsewhere | What it owns |
> |---|---|
> | `00-orchestrator.md` | orchestrator steps: role-family classification, skip gates, spawning, rendering, reply |
> | `02-writer.md` | Writer persona, renderer syntax, hard facts, internal-report contract |
> | `03-reviewer.md` | the rubric and its item numbering |
> | `04-role-presets.md` | per-role-family elevate / compress / metric language / budget winner |
> | `06-tech-substitution.md` | which technology swaps are legal |
> | `05-style-profile.md` | verb variety, banned adjectives, realistic scale |
> | `profile/fact_ledger.md` | what each role and project actually involved — the evidence pool |
> | `profile/master_resume.yaml` | approved tagged bullets, header, education, frozen role facts |
> | `profile/profile.yaml` | identity, application Q&A answers, output paths |

---

## Fixed facts

These are never edited to satisfy a JD. Full detail lives in `02-writer.md` (Hard facts).

All of these come from the operator's own `profile/` directory. Read them there; never assume them.

| Fact | Source | Editable? |
|---|---|---|
| Name / contact | `profile/profile.yaml` → `identity` | **No.** Real contact info, never `[REDACTED]` |
| Degrees, schools, majors, dates | `profile/master_resume.yaml` → `education` | **No** |
| Work authorization, sponsorship | `profile/profile.yaml` → `work_authorization` | **No** |
| US citizenship / security clearance | `profile/profile.yaml` → `work_authorization` | **No.** A JD requiring either the operator lacks is a **skip**, not a tailoring problem |
| Seniority | `profile/profile.yaml` → `preferences.years_of_experience` | **No** |
| Employers, dates, past-job cities | `profile/master_resume.yaml` → `roles` | **No.** Frozen |
| Additional immovable facts | `profile/master_resume.yaml` → `hard_facts` | **No** |
| Experience job titles | derived per JD | **Yes** — aligned to the JD's title family per Step 3c |

A JD requirement that contradicts any row marked **No** is a HARD MISMATCH: report it, generate the
resume anyway, and let the operator decide. Never resolve it by editing the fact.

The header city is the only mutable header field (see **Location**, below).

---

## Priority taxonomy — one scale, not two

Step 1 marks each extracted item **[MUST]** or **[NICE]** while reading the JD. Those marks then
resolve into exactly one priority tier. **P0/P1/P2 is the only scale used downstream**; `[MUST]`
and `[NICE]` never appear in a coverage verdict on their own.

| Tier | Resolves from | Required landing |
|---|---|---|
| **P0** | `[MUST]`: in the job title, in Required / Must-have, ≥3 mentions in the body, or named in the **stack sentence** (Step 1.7) | ≥1 **Experience** bullet. Skills-only = fail. Projects-only = fail |
| **P1** | `[NICE]` that **is stack-core** (test below): typically the Preferred / Nice-to-have section | ≥1 **Experience** bullet. Projects and Skills do **not** count |
| **P2** | `[NICE]` that is **not stack-core**: an off-hand mention ("familiar with Grafana a plus") | Skills section is enough |

### The stack-core test — what separates P1 from P2

A `[NICE]` item is **stack-core**, and therefore P1, when **any one** of these holds:

1. It sits in the same **technology layer** as something the JD already made P0. A layer is one row of `06-tech-substitution.md` Part 1 (cloud, messaging/queueing, serverless, cache, relational store, Python web, JVM web, API protocol, ORM, frontend, CI/CD, monitoring, IaC, agent framework, containers, vector store, test framework, model provider, ML framework, scheduler, workflow automation, push/SMS). *Example: a JD whose stack sentence names SQS makes a Preferred "Kafka" P1 — same messaging row.*
2. It appears **≥2 times** anywhere in the JD body.
3. It is named as a P0's direct dependency or runtime ("Django **on Postgres**", "Spark **on Kubernetes**").

Otherwise it is **P2**, even when it sits in the Preferred section. *Example: the same backend JD's closing "Grafana experience a plus" is P2 — the monitoring row holds no P0, Grafana is mentioned once, and nothing depends on it.*

Preferred sections routinely produce both tiers. The split is a cost decision, not a politeness ranking: a P1 has to be paid for out of the 12-bullet Experience budget, a P2 costs one word in Skills.

A P0 or P1 item with no legal landing is not silently dropped. It is reported as a **TRUE GAP**, or,
where it exists in Skills but no Step-3b swap could put it in a bullet, as **`SKILLS_ONLY`** with
the reason. Silently absent = fail.

---

## Step 0 — Qualification pre-check

Extract every **hard** eligibility condition the JD states: work authorization and sponsorship,
citizenship, security clearance, licensure, degree level, degree major, graduation window, years of
experience, onsite city.

Compare each one against the fixed facts above. For any condition not met, open the internal report
with:

```
HARD MISMATCH: <JD condition> vs <actual fact> | hard filter | soft preference
```

Then continue the remaining steps anyway, so the operator can decide whether to apply.

Two conditions are **skips, not mismatches** — the orchestrator drops the job before a Writer is
ever spawned (`00-orchestrator.md` step 0a-1): a JD requiring **US citizenship** or a **security clearance**
(Secret / Top Secret / TS-SCI, "ability to obtain a clearance", "favorably adjudicated Government
background investigation"), whether it sits under Required or Preferred.

**Under no circumstances** may a degree, major, graduation date, employer name, or date range be
changed to satisfy one of these conditions. If a condition can only be met by altering a fixed fact,
it is a HARD MISMATCH permanently. Job titles are the one exception and are governed by Step 3c —
but a title is never stretched to satisfy an eligibility condition either; Step 3c aligns vocabulary,
it does not manufacture seniority or experience.

*(Worked example: a JD asking for a bachelor's in Computer Science against a BS in Mathematics is a
HARD MISMATCH, severity: hard filter, reported on line one and never resolved by editing Education.)*

---

## Step 1 — Parse the JD into a literal keyword inventory

Extract, **using the JD's exact wording, not synonyms**:

1. **Hard requirements** — named languages, frameworks, tools, platforms, protocols. Keep only
   **grep-able** technology: things that would appear in an `import`, `package.json`,
   `requirements.txt`, or `Dockerfile`.
2. **Repeated multi-word phrases** — noun phrases appearing more than once, or in both
   "What You'll Do" and "What You'll Bring". Repetition = the team's actual priority. These are the
   highest-value strings to mirror verbatim.
3. **Quality attributes** — reliability, robustness, accuracy, latency, scale, uptime, cost,
   security, compliance. These decide what *kind of metric* the bullets are measured in.
4. **Domain vocabulary** — the industry's own words (clinical, ledger, claims, tenant, SLO,
   care workflow, fulfillment, telemetry). The cheapest differentiation available.
5. **Company mission / product mechanism** — 1–2 sentences on what the product actually does.
   Feeds Step 6.
6. **Implicit signals** — seniority, onsite requirement, builder vs owner, whether frontend is
   expected on top of backend.
7. **The stack sentence** — the single sentence enumerating concrete technologies, usually
   "Familiarity with … including X, Y, Z" or "Experience with X and Y". **Every technology in that
   one sentence is automatically P0.** It is the technical anchor of the whole JD; a resume that
   misses it reads as written for a different job.
8. **Team scope** — what the team physically owns (hardware fleet, billing ledger, clinical
   workflows, developer tooling). If the candidate's background has no structural analogue, say so
   now rather than at the end.

Output as a numbered list, each item marked **[MUST]** or **[NICE]**, then resolved to P0/P1/P2 per
the taxonomy above.

**Drop from every dimension:** adjectives, soft skills (`team player`, `passionate`,
`strong communication`, `ownership`), generic nouns (`systems`, `scale`, `architecture` unless
bound to concrete tech), years-of-experience requirements, and degree requirements — those belong
to Step 0, not to the keyword inventory.

---

## Step 2 — Inventory the resume's actual evidence

For each role **and project**, list what was demonstrably done, stripped of its current wording: the
system built, the techniques used, the scale, the measured outcome. Ignore how it is phrased today —
this is a raw evidence pool. `profile/fact_ledger.md` is the full ledger and is deliberately
broader than any single tailored resume.

Before drafting, use the approved `profile/master_resume.yaml` candidates the orchestrator supplies.
Retrieval does not replace JD analysis: it only avoids regenerating prose for an accomplishment
already approved. Reuse an entry only when its source role, business context, and locked metrics stay
coherent for this JD — a shared technology keyword alone is not sufficient. New bullets remain
`BANK_UPDATE` proposals until the operator explicitly approves them.

---

## Step 2b — Audit the Skills section

The Skills section is a claim about what the candidate can work in, so **it may list anything
actually used, whether or not a bullet currently names it.** Bullets are different: they are claims
about one specific system, and Step 3b governs those. Nothing is deleted from Skills merely for
lacking a bullet.

The failure mode to prevent is a **P0 or P1 technology that appears only in Skills**. A reviewer who
sees a tool in Skills goes looking for it in the bullets; finding nothing there reads as padding,
and that costs more than the keyword earns. *(This is how "Go" sat second in the Skills list with
zero supporting bullets on an infrastructure application.)*

So for each P0 and P1:

- Present in Skills **and** in an Experience bullet → covered.
- Present in Skills only → run **Step 3b**. If an interchange pool allows the swap, put it in the
  bullet. If no legal swap exists, report it under `SKILLS_ONLY` with the reason.
- Absent from both → TRUE GAP.

---

## Step 3 — Build the mapping matrix

One row per Step-1 keyword:

| JD phrase (verbatim) | P0/P1/P2 | Evidence in the resume | Verdict | Action |

Every row gets exactly one of four verdicts:

- **EXACT MATCH** — the resume already uses this literal phrase. Action: leave the wording, confirm
  it sits where a 15-second skim lands (first bullet of a role, or the first Skills category).
- **VOCABULARY GAP** — the substance exists in different words. *Highest-ROI category and usually
  the largest; apply it everywhere before reaching for any injection.* Action: rewrite the bullet in
  the JD's exact phrase, keeping every number and fact intact. JD says "agentic workflows" → the
  bullet says "agentic workflows", even when "multi-agent orchestration" is more precise.
- **ADJACENT** — the JD names a peer of something present (LangGraph where they want LangChain,
  Terraform where they want Pulumi, AWS where they want Azure). Action: run **Step 3b** and swap
  where the interchange pool allows it and the bullet still holds together. Where no swap is legal,
  surface the adjacent item explicitly and name the transferable concept in the JD's words.
- **TRUE GAP** — no basis anywhere. Action: Route per the injection strategies below; if there is no plausible host, it goes to Skills as P2 or is reported as a gap.

Projects participate in this matrix on equal footing with Experience — but a Projects landing never satisfies a P0 or P1.

### Injection strategies — apply in order

- **A (swap)** — the master resume has an equivalent Y doing the same task → swap Y → X.
- **B (embed)** — the master resume has related business context → embed X into an existing bullet.
- **C (augment)** — no exact-match context, but X is an industry-standard counterpart or extension of technology the role already uses → augment the closest bullet. If X has no real technical relationship to what the role did, fabricate a bullet, do NOT fall back to Skills.

#### When C fabricates — the boundary

Strategy C's last branch writes a **new bullet** for a technology with no basis in the evidence pool.
It is the most expensive move on the page and the only one that cannot be defended from memory, so
it is fenced:

**It fires only for an unlanded P0 or P1.** Never for a P2 — the tier gate below forbids that, and
Skills already covers P2. Never to satisfy a Step-0 eligibility condition.

**It fabricates bullet content, never identity.** These stay untouchable, exactly as before: company
names, employers, role entries, project entries, degrees, majors, graduation dates, date ranges, and
past-job cities. A fabricated bullet is always **hosted inside an existing role**, chosen by the
injection-target ranking below; it never adds a role, a project, or a line of Education.

**The fabricated bullet obeys every Step-4 rule with no exemption.** Past-tense approved verb,
200–320 characters, ≤3 technology names, one accomplishment, no em-dash, no tagline, and **one
definite metric** — which, since there is no real measurement behind it, must be a number this role
could plausibly have produced at intern scale (`05-style-profile.md`): no >100K users, no >80% gain on
a business metric, no team leadership. It must also not contradict any other number on the page for
the same product (Step 7, number coherence).

**It must be plausible on two axes at once — US industry practice, and this role's real business
logic.** Both, not either.

*Industry axis.* The work described has to be how a US engineering team would actually have built
this, at this company size, in this era. The technology has to be one a team like that would
plausibly have adopted for that problem, wired the way the industry wires it. An intern at a
three-person AI consultancy did not run a service mesh; a 2025 agri-tech SaaS team did not build on
a technology that postdates it. If a US hiring manager reading the bullet would think "nobody does
it that way", it fails here.

*Business-logic axis.* The work has to belong to what that role's product actually does, per the
**Business context** section of `profile/fact_ledger.md` for that role. A fabricated bullet has to
be a thing **that product would have needed**.

Worked contrasts, using the example persona's roles (freight-routing SaaS, cold-chain sensor
telemetry, clinical billing) — apply the same reasoning to whatever roles the operator's ledger
actually describes:

| Fabricated bullet | Verdict |
|---|---|
| Elasticsearch over shipment records at the freight platform, to make booking history searchable | **OK** — a real need of that product, and the standard choice for that job |
| Kubernetes autoscaling of the telemetry ingestion consumers | **OK** if the bullet has replicas or load in context; the industry does run consumers this way |
| A vector store at the freight platform for semantic search over carrier contracts | **Weak** — technically buildable, but a rate-quoting product had no reason to. Fails the industry axis |
| A feature store / model registry at the clinical billing role | **FAIL** — the ledger records extraction and retrieval, explicitly no model training. Fails the business-logic axis |
| Anything about hardware fleets, datacenter capacity, or physical provisioning | **FAIL** — check the ledger; if no role touches physical infrastructure, this is unreachable |
| Terraform provisioning the telemetry staging environment | **OK** — already recorded in the fact ledger as this exact host, so it is not even fabrication |

Where nothing passes both axes, the item is a TRUE GAP and gets reported as one. **Fabricating an
implausible bullet is worse than reporting the gap** — the gap costs one keyword, the implausible
bullet costs the interview.

**It is always declared.** Every fabricated bullet is reported on the `FABRICATED:` line of the
internal report and surfaced to the operator, who studies it before the interview. An undeclared
fabricated bullet is the one failure mode this rule cannot tolerate: the operator would walk into an
interview not knowing the claim is on the page.

#### Injection is gated by tier

Injection is not free: the page holds 12 Experience bullets, and each bullet holds at most 3 technology names. Spend that budget on what the JD actually requires.

| Tier | Injection budget |
|---|---|
| **P0** | Strategies A, B, and C all available. Must reach an Experience bullet. |
| **P1** | Same as P0. Must reach an Experience bullet. |
| **P2** | **No injection.** It lands in Skills, which is its required landing anyway. One exception: strategy **B** may embed it in an existing bullet when that costs nothing — no added length, no claim on the bullet's 3-technology budget, no change to the verb or the metric. |

**When a P0 or P1 and a P2 compete for the same bullet's 3-technology budget, the P2 always yields.** A bullet carrying a P2 while any P0 or P1 is still unlanded is a defect, not a bonus — the reviewer fails it.

**Never invent a company, role, project, or degree.** Technology names, metrics, and outcomes ARE fair game to add or swap into an existing bullet when the substitution plausibly fits that role's real business context.

### Injection target capacity

A fallback ranking for *where a technology can live*. It does **not** set resume order — Step 5.1
does, and it is not tunable.

Build this ranking per operator, from `profile/fact_ledger.md`, before writing:

1. **The Experience role whose ledger covers the broadest range of compatible technology.** Usually
   the one with the most surface area, not the most recent.
2. **The next-broadest Experience role**, and so on through every role.
3. **Projects**, ordered by closeness to the JD's problem. Projects **never** count toward P0 or P1
   coverage, however well they fit — that requirement is Experience-only.
4. **Skills** — final fallback, P2 only.

A technology lands in the highest tier whose ledger entry genuinely supports it. It never lands in a
role just because that role has room.

Consult `profile/fact_ledger.md` before concluding a technology has no home. The ledger is
deliberately broader than the bullet bank: a bullet names only the two or three technologies that
carry its story, so many genuinely-used technologies appear in the ledger and in no bullet at all.
Those are real and available, and the ledger names the natural host for each. Reporting a TRUE GAP
without having read the ledger is the most common false gap in this pipeline.

**Do NOT ask "did you actually do X?"** The operator studies before the interview. Tech is
transferable.

---

## Step 3b — Technology substitution protocol

An ADJACENT verdict is not a dead end. Where the JD names an **equivalent peer** of something
already in a bullet, swap it in. This is the second-highest-ROI move after VOCABULARY GAP, and it is
what turns a 60% keyword match into a 90% one.

The gate is **not** "which one did I use". The gate is **"does the bullet still describe a coherent
system after the swap, and can it be defended when an interviewer asks for detail?"**

The interchange pools, the forbidden-swap table, and the cloud-family movement table live in
**`06-tech-substitution.md` Parts 1–3**. That file is authoritative for which swaps are legal; do not
maintain a second copy of those tables.

### Three hard constraints on every swap

1. **Swap the whole family, never half of it.** Changing the cloud means changing every dependent
   noun in that bullet and every sibling bullet in the same role.

   ```
   AWS   : SNS fanout, SQS queues, Lambda consumers, CloudWatch-monitored DLQ
   Azure : Service Bus topic, subscriptions, Azure Functions consumers, dead-letter queue on Azure Monitor
   GCP   : Pub/Sub topic, subscriptions, Cloud Functions consumers, dead-letter topic on Cloud Monitoring
   ```

   A bullet reading "Azure Service Bus … Lambda consumers" is a fabrication tell, not a typo.

2. **One cloud per role.** A single role never shows two cloud providers. Different roles may use
   different clouds; that is just two different projects.

3. **Re-validate the business logic after the swap.** The substituted technology must agree with the
   bullet's verb, its metric, and its data shape. If the metric no longer reads naturally in the new
   stack's idiom, restate it in that idiom or abandon the swap.

Every swap is recorded in the internal report as `SUBSTITUTIONS: <role>: <from> → <to>, <pool>`, and
surfaced to the operator so the same company never sees two different stacks for the same role.

---

## Step 3c — Job title alignment

**The three Experience job titles are tailorable**, unlike company names, date ranges, and cities.
There is no fixed starting title — this step derives each of the three titles directly from the
**JD**'s title family, constrained only by what that role actually did.

**Move all three titles toward the JD's title family.** A recruiter's first pass reads the title
line, and an ATS scores the title field directly; a *Full-Stack Engineer Intern* line against a
"Machine Learning Engineer" posting loses points a bullet rewrite cannot win back.

### Four constraints

1. **`Intern` always stays.** Every one of these roles was an internship. The title tracks the JD's
   *function*, never its employment level: JD "Machine Learning Engineer" → *Machine Learning
   Engineer Intern*, never *Machine Learning Engineer*. This holds even when the JD's own title
   carries no "Intern" — a new-grad or full-time posting still gets `Intern` on these three lines.
2. **Never claim a seniority not held.** `Senior`, `Staff`, `Principal`, `Lead`, `Manager`, `Head`,
   `Director`, and level suffixes (`II`, `III`, `IV`) never appear, whatever the JD is titled. If
   the JD is "Senior Backend Engineer", the title becomes *Backend Engineer Intern*.
3. **The title must stay true to what that role actually did** per `profile/fact_ledger.md`. A role
   recorded as contract-lifecycle backend and full-stack work can read *Software Engineer Intern,
   Backend*, *Backend Engineer Intern*, or *Full-Stack Engineer Intern* — it cannot read *Machine
   Learning Engineer Intern*, because that ledger entry contains no ML. Where a JD's title has no
   honest counterpart for a role, **leave that role's title at its plainest accurate form** and say
   so in the report. A stretched title is the one thing on this page an interviewer can disprove in
   a single question.
4. **Company name, date range, and city stay frozen.** Only the italic title line moves.

### Worked examples

Using the example persona (role_1 clinical billing / LLM extraction, role_2 freight routing
backend and data, role_3 sensor telemetry and platform):

| JD title | role_1 | role_2 | role_3 |
|---|---|---|---|
| Software Engineer, New Grad | *Software Engineer Intern* | *Software Engineer Intern* | *Software Engineer Intern* |
| Machine Learning Engineer | *Machine Learning Engineer Intern* | plainest accurate form (no ML basis) | *Machine Learning Engineer Intern* |
| Backend Engineer | *Backend Engineer Intern* | *Backend Engineer Intern* | *Backend Engineer Intern* |
| Data Engineer | *Data / AI Engineer Intern* | *Data Engineer Intern* | *Data Engineer Intern* |
| Senior Full-Stack Engineer | *Full-Stack Engineer Intern* | *Full-Stack Engineer Intern* | plainest accurate form |
| Platform Engineer | plainest accurate form | *Platform Engineer Intern* | *Platform Engineer Intern* |

Note that no row upgrades every role — a title only moves where that role's ledger supports it.

Report every line as `TITLES: <company>: <plainest accurate title> → <tailored title>`, or
`unchanged`.

---

## Step 4 — Rewrite the bullets

Rewrite only the bullets the matrix says need to change.

### Wording

- Lead with the JD's phrase, not the old phrase.
- **One accomplishment per bullet.** A rewrite that joins two unrelated things with a semicolon or
  "and" gets split into two bullets.
- **No em-dashes inside bullet body text**; use commas.
- **No closing taglines** restating impact already stated ("enabling…", "translating directly to…",
  "a direct multiplier for…", "unlocking…"). If the number is good, stop at the number.
- **Bullet body is 200–320 characters** for Experience (about 3 printed lines), **150–320** for
  Projects. Over 320 → split. Under the floor → add a real fact or merge.
- **At most 3 distinct technology names per bullet.** More than 3 → split.
- Every bullet is past tense and starts with a precise action verb.

### Verbs — the canonical list

**Approved:** Built, Rebuilt, Replaced, Migrated, Shipped, Implemented, Deployed, Developed,
Integrated, Wired, Logged, Instrumented, Hardened, Tuned, Proxied, Containerized, Gated, Split,
Added, Introduced, Configured, Created, Refactored, Delivered, Optimized, Enhanced, Automated,
Validated, Modeled, Engineered, Reduced, Cut, Trained, Productionized.

**Banned as too senior:** architected, designed, led.

**Banned as weak:** worked with, helped, assisted, learnt, studied, experienced, familiar with,
knowledge of, responsible for.

Prefer the specific verb over the generic one: a bullet about replacing a system opens `Rebuilt` or
`Replaced`, not `Built`; instrumentation opens `Logged` or `Instrumented`; narrowing a retry loop
opens `Tuned`. Do not reuse an opening verb inside one role (`05-style-profile.md`).

### Numbers

- **Preserve every real metric exactly.** Numbers are the only thing separating this resume from
  every other applicant using the same keywords.
- **Every metric is a single definite value.** No "an estimated 30–50%", no "roughly 20–40%". A wide
  range reads as invented. If the honest answer is a range, take the conservative end as a single
  value, or switch to an absolute count that can be defended (hours, cases, records, requests).
  Single values such as `over 90%` and `10K+` are fine.
- **No approximation marks.** Never write `~80%`, `about 25%`, `approximately 99%`, or `roughly 1.6`.
  Write the clean figure (`80%`), or better, the exact before-and-after pair it was derived from
  (`from 233ms to 3ms`), which is stronger than any percentage. A tilde is a hedge: a skimmer reads
  it as uncertainty, and mixing hedged and unhedged numbers in one document makes the hedged ones
  look like the weak ones. `profile/master_resume.yaml`'s bullets carry no tildes; do not reintroduce one.
- Re-express the outcome in the metric language Step 1.3 surfaced. Same fact, different framing: a
  caching change is "cut p99 latency 80%" for a backend role and "cut error budget burn during peak
  load" for an SRE role — only where both framings are literally true. `04-role-presets.md` holds the
  reframing table.
- **Marketing-outcome metrics are banned** unless the target company's own product is marketing,
  social, growth, or content. Follower growth, referral traffic, engagement rate, impressions, and
  reach appear nowhere for any other kind of company. Restate the same work in engineering terms:
  manual hours removed, latency, throughput, error rate, cost, release frequency. *(A cancer-care
  clinical platform should never see "30% follower growth" in the first bullet of the first role.)*
  Marketing data as a **pipeline input** ("normalizes marketing data from Instagram, Facebook, and
  newsletter sources") is a data-domain fact and is fine; what is banned is marketing performance as
  the **outcome metric**.
- **Bold the metric together with its context** (`**cut API latency by 80%**`), never the bare
  number. Keep the bolded span under about 60 characters; bolding a 110-character clause is the same
  as bolding nothing. Do not bold a score whose significance a non-specialist cannot judge.
- Bold **only** technology names and quantified-impact phrases. Never bold a verb, a generic noun, a
  role name, or a company name. Bolding a whole company line that carries an address is allowed.

---

## Step 5 — Reallocate the page

Page space is zero-sum. Apply in this order.

**5.1 — Order roles strictly by end date, most recent first. Never reorder for JD relevance.**
This is the order `roles` already appears in `profile/master_resume.yaml`. Build a (start, end) table
and verify it rather than trusting the file. Sorting by start date buries
recent work; sorting by relevance is worse, because on an early-career resume a non-chronological
timeline reads as concealment.

**5.2 — Express JD relevance through bullet count, not position.**

| Relevance to the JD | Bullets |
|---|---|
| Closest role | 4–5 |
| Next | 3–4 |
| Least relevant | 2–3 |
| Floor for any role | 1 |
| Each project | 1–2 |

Total Experience bullets **≤12**. Never delete a role — that creates a timeline gap; compress it
instead. The most-relevant role must never carry fewer bullets than a less relevant one. Over
budget → cut from the bottom-ranked role, never from the top two.

**5.3 — Reorder the Skills section so the category matching the target role family comes first,
ahead of Languages, always.** Within each category, JD-named tools come first. Languages never sits
first unless the JD is an explicit polyglot-language screen.

The categories are whatever `profile/master_resume.yaml`'s `skills_master` defines; do not invent a category
to satisfy this rule. Use this table (same as `skills_lead_category_by_role_family` in that file):

| JD role family | Skills category first |
|---|---|
| AI / ML / GenAI | Agentic AI & LLM |
| SWE / Backend | Backend & APIs |
| SRE / DevOps / Platform | Practices & Tooling |
| Data Engineer | Data & Pipelines |
| Full-Stack | Backend & APIs |
| Security | Practices & Tooling |

Renaming a category's **title** to match the JD's vocabulary is allowed where the contents already
support it (`Practices & Tooling` → `Reliability & Tooling` on an SRE JD, which already lists fault
injection, retries and backoff, and dead-letter queues). Report the rename in the internal report.
Never move a technology into a category it does not belong to just to fill a heading.

**5.4 — Stack-landing check.** At least two thirds of the technologies from the Step-1.7 stack
sentence must appear in the bullets of the **top two roles by position** — not only in Skills, not
only in a project at the bottom of the page. If they do not, rework those bullets until they do, or
report the failure as `STACK_LANDING: … | fail`.

**5.5 — Coverage.** Every P0 and every P1 lands in an Experience bullet. Anything that cannot is
reported as `SKILLS_ONLY` or `TRUE_GAPS`, never silently dropped.

---

## Step 6 — Industry and domain alignment

Two moves, in priority order.

1. **Semantic neighbor (strong, and mandatory when one exists).** Find the role or project
   structurally closest to what the company's product actually does per Step 1.5 — same data shape,
   same failure mode, same trust requirement, same user type — and rewrite its bullets in the
   company's own domain vocabulary from Step 1.4. Name the pick and the reason in the internal
   report. **At least two of the JD's domain words must actually land in that role's bullets.**
   Naming a neighbor and then not using the vocabulary is a failed step, not partial credit.
   *(A pet-health record-structuring pipeline is the semantic neighbor of a clinical care platform:
   same unstructured-to-structured shape, same trust requirement, same reviewer-capacity outcome.
   Its bullets then read in that company's words: care workflow, care team capacity, clinical, risk
   assessment.)*
2. **Stated interest (fallback only).** Only where no neighbor exists, add ONE concrete clause to the
   Summary about the engineering problem that makes the domain hard. Never "passionate about X".

**Summary** is rewritten to ~2 lines: what the candidate builds, in the JD's own vocabulary, plus the
domain hook. Cut anything the JD does not care about. Two constraints:

- **The first self-descriptor noun phrase must match the JD's title family.** If the JD is
  "Software Engineer, New Grad", the Summary does not open with "AI Engineer".
- **Never address the reader or the posting.** No "the same way this role partners with TPMs", no
  "as your JD describes". Describe the work; let the match speak for itself. Second-person echoes of
  the posting read as keyword-stuffing to anyone who has screened resumes.

---

## Polyglot OR-list rule

When the JD lists ≥4 languages joined by `or` / `/` (e.g. `JS / TS / Python / C / C++ / Go / Java`):

1. Check overlap with the base languages (Python, Java, JavaScript, TypeScript, SQL, C/C++). If any
   match, those satisfy the requirement — **do not force more**.
2. If none overlap, pick **one** by priority — TypeScript > Go > Java > Swift > C++ — and land it in
   a **Projects** entry only, never in an Experience bullet.
3. If the JD says "primarily X", or X is in the job title, X is P0 and normal rules apply. This is
   not an OR-list case. If X is a language with no legal Step-3b swap into any bullet, report it
   under `SKILLS_ONLY` rather than leaving it silently in the Skills line.

---

## Location rule — header city only

The header contact line ends in ` | City, State`, replacing the `<<CITY, ST>>` placeholder in
`profile/master_resume.yaml`'s `header`. **Past-job locations never change.**

| JD location | Header city |
|---|---|
| Specific city (e.g. `Seattle, WA`) | that city |
| `Bay Area` / `SF Bay` | `San Francisco, CA` |
| Multiple (`NYC or SF`) | first listed |
| `Remote (US)` / not specified | drop the placeholder and the trailing ` \| ` |
| Non-US (`Toronto`, `London`) | drop the placeholder and the trailing ` \| ` |

Past-job cities are frozen: use the `city` field of each `roles` entry in
`profile/master_resume.yaml` verbatim. Where a `projects` entry carries no city, none is added.

---

## Step 7 — Quality control pass

Verify each of these before emitting. The Reviewer checks the same ground independently.

**Truthfulness**
- [ ] Step 0 run; every HARD MISMATCH stated at the top of the internal report
- [ ] No fixed fact altered (degree, major, dates, employer, past-job city)
- [ ] Every Experience title follows Step 3c: keeps `Intern`, claims no seniority not held, and
      stays true to what that role actually did
- [ ] No invented company, employer, role entry, project entry, degree, major, or date
- [ ] Every fabricated bullet (strategy C's last branch) targets an unlanded P0 or P1, sits inside an
      existing role, passes the plausibility test, carries an intern-scale definite metric that
      contradicts no other number, and is listed on the `FABRICATED:` line
- [ ] Every P0 and P1 either lands in an Experience bullet, or appears under `SKILLS_ONLY` /
      `TRUE_GAPS` with a reason
- [ ] No P2 was injected into a bullet at the cost of a P0, a P1, or the length limit

**Content**
- [ ] Every bullet covers exactly one accomplishment
- [ ] Every bullet contains at least one number and at least one technology name
- [ ] No estimated ranges; every metric is a single definite value
- [ ] No `~`, "about", "approximately", or "roughly" attached to any metric
- [ ] No marketing-outcome metrics (unless the company's product is marketing / social / growth /
      content)
- [ ] No bullet ends with a redundant "why this matters" clause
- [ ] No technical component is fully re-explained in a second bullet
- [ ] No bullet is a colon-separated scorecard of 3+ numbers

**Form**
- [ ] Experience bullets 200–320 characters; Projects 150–320
- [ ] At most 3 technology names per bullet
- [ ] Every Step-3b swap changed the entire technology family, not part of it
- [ ] No role shows two cloud providers
- [ ] No forbidden swap; every swapped bullet still agrees with its verb, metric, and data shape
- [ ] No banned verbs; no bullet opens with a weak phrase; no verb reused inside one role
- [ ] All bullets past tense
- [ ] No em-dashes inside bullet body text
- [ ] Bolded metrics carry their context and stay under ~60 characters; obscure scores unbolded
- [ ] Every experience entry uses identical formatting (Company + Location / *Title* + Dates), with
      `Jan. Feb. Mar. Apr. May Jun. Jul. Aug. Sep. Oct. Nov. Dec.` — `May` takes no period

**Placement**
- [ ] Section order is Header → SUMMARY → EXPERIENCE → PROJECTS → EDUCATION → SKILLS
- [ ] Roles sorted by end date, most recent first; no role deleted
- [ ] Bullet budget follows JD relevance; ≤12 Experience bullets
- [ ] Skills first category matches the target role family per the 5.3 table and sits ahead of
      Languages
- [ ] Stack-landing check passed, or its failure reported
- [ ] Summary's first self-descriptor matches the JD's title family
- [ ] Summary does not address the reader or the posting
- [ ] Semantic neighbor named, and ≥2 domain words present in that role's bullets
- [ ] Fits one Letter page

The output contract — what the Writer actually emits, in what syntax, with which internal-report
lines — is defined in `02-writer.md`, not here. **Never write a cover letter.**
