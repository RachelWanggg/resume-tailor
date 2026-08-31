# Technology Substitution Rules

Which technologies are legal peer swaps when `01-tailoring-rules.md` Step 3b fires. This file
governs **substitution, not truth**.

The companion to this file is your `profile/fact_ledger.md` — the record of what each of your roles
and projects *actually* involved. That is the evidence pool; this file only checks whether two
technologies are structurally interchangeable. A swap is legal only when the fact ledger explicitly
confirms the target technology for that role. Membership in an interchange pool is not evidence.

Your `profile/master_resume.yaml` bullets are deliberately narrower than the fact ledger. A bullet
names the two or three technologies that carry the story; everything else waits in the ledger until
a JD asks for it.

---

# PART 1 — INTERCHANGE POOLS

Swaps are structurally coherent **within a row**, subject to direct fact-ledger support for the
target technology.

| Layer | Peers | Notes |
|---|---|---|
| Cloud platform | AWS ↔ Azure ↔ GCP | Whole-family swap required, see Part 3 |
| Messaging / queueing | SNS + SQS ↔ Azure Service Bus ↔ GCP Pub/Sub ↔ Kafka ↔ RabbitMQ | Kafka implies a log, not a queue: only where ordering or replay is in context |
| Serverless compute | Lambda ↔ Azure Functions ↔ Cloud Functions | Moves with the cloud family |
| Managed cache | ElastiCache Redis ↔ Azure Cache for Redis ↔ Memorystore | Bare "Redis" is provider-neutral and may stay unqualified |
| Relational store | PostgreSQL ↔ MySQL ↔ Azure SQL ↔ Cloud SQL ↔ RDS | Stays relational, see Part 2 |
| Python web framework | FastAPI ↔ Django ↔ Flask | Directional caveats in Part 2 |
| JVM web framework | Spring Boot ↔ Quarkus ↔ Micronaut | |
| API protocol | REST ↔ gRPC ↔ GraphQL | Match the bullet's call pattern |
| ORM | raw SQL ↔ Hibernate / JPA ↔ SQLAlchemy ↔ Django ORM | Must match the language |
| Frontend framework | React ↔ Vue ↔ Next.js | Next.js only where SSR or routing is in context |
| CI/CD | GitHub Actions ↔ GitLab CI ↔ Jenkins ↔ CircleCI ↔ Concourse | Runner OS and script language move with it |
| Monitoring | CloudWatch ↔ Prometheus + Grafana ↔ Datadog ↔ Azure Monitor ↔ Cloud Monitoring | |
| Infrastructure as code | Terraform ↔ Pulumi ↔ CloudFormation ↔ Bicep | CloudFormation is AWS-only, Bicep Azure-only: both move with the cloud family |
| Agent framework | LangGraph ↔ LangChain ↔ CrewAI ↔ AutoGen | |
| Containers | Docker ↔ Docker Compose ↔ Kubernetes | K8s only where replicas, scheduling, or autoscaling are in context |
| Vector store | pgvector ↔ Pinecone ↔ Weaviate ↔ Chroma ↔ FAISS | Never swaps with a relational store |
| Test framework | pytest ↔ unittest ↔ Jest ↔ Vitest ↔ JUnit | Must match the bullet's language |
| Model provider | Claude ↔ OpenAI ↔ Gemini | |
| ML framework | PyTorch ↔ TensorFlow | |
| Scheduler | Slurm ↔ Ray ↔ Airflow | Airflow only for pipeline orchestration, not cluster job scheduling |
| Workflow automation | n8n ↔ Zapier ↔ Make ↔ Temporal | Temporal only where durable execution is in context |
| Push / SMS delivery | Twilio ↔ FCM ↔ SNS mobile push ↔ Firebase | Only where the fact ledger records a real delivery path |

---

# PART 2 — FORBIDDEN SWAPS

| Never | Why it breaks |
|---|---|
| PostgreSQL → MongoDB in a bullet naming transaction schema, read-after-write consistency, ACID, or foreign keys | A document store has none of these semantics |
| Relational store ↔ vector store | Entirely different job |
| Cache ↔ queue, either direction | One is the read path, one is asynchronous decoupling |
| Cache ↔ monitoring, or any cross-layer pairing | Not peers, however fluent the candidate is in both |
| Any language swap in a bullet naming a framework of the original language (Java → Go beside Spring Boot) | Language and framework are welded together |
| Batch → streaming, or streaming → batch | Different data shape, different SLA vocabulary |
| FastAPI → Django in a bullet whose point is async or low latency | Django's strengths run the other way |
| Django → FastAPI in a bullet naming the ORM, admin, or templates | Same problem, opposite direction |
| Docker → Kubernetes in a single-instance bullet | K8s implies orchestration not in evidence |
| RAG → fine-tuning / LoRA | Retrieval and model adaptation are different problems |

---

# PART 3 — FAMILIES THAT MOVE TOGETHER

Swapping the cloud means rewriting every dependent noun in that bullet **and in every sibling
bullet of the same role**. Half-swapped output is a fabrication tell.

| | AWS | Azure | GCP |
|---|---|---|---|
| Pub/sub topic | SNS | Service Bus topic | Pub/Sub topic |
| Queue | SQS | Service Bus subscription / Storage Queue | Pub/Sub subscription |
| Serverless | Lambda | Azure Functions | Cloud Functions |
| Monitoring | CloudWatch | Azure Monitor | Cloud Monitoring |
| Managed cache | ElastiCache | Azure Cache for Redis | Memorystore |
| Managed relational | RDS | Azure SQL Database | Cloud SQL |
| Object storage | S3 | Blob Storage | Cloud Storage |
| Dead letter | DLQ | dead-letter queue | dead-letter topic |
| IaC native | CloudFormation | Bicep | Deployment Manager |

**Worked example — a notification fan-out pipeline**

This table illustrates the dependent nouns that move together after the fact ledger confirms the
target provider. It is not permission to claim a provider that the role did not use. Leaving one
noun behind ("SNS topics with Azure Functions consumers") creates an incoherent stack.

```
AWS   : SNS fanout into SQS queues with Lambda consumers, retrying failed deliveries
        through a CloudWatch-monitored dead-letter queue
Azure : Service Bus topic fanout into subscriptions with Azure Functions consumers, retrying
        failed deliveries through a dead-letter queue tracked in Azure Monitor
GCP   : Pub/Sub topic fanout into subscriptions with Cloud Functions consumers, retrying
        failed deliveries through a dead-letter topic tracked in Cloud Monitoring
```

---

# PART 4 — TWO HARD INVARIANTS

1. **One cloud per role.** A single Experience role or project never names two providers.
   Different roles may differ; that is just two different projects.
2. **Post-swap revalidation.** After substituting, re-read the bullet and confirm the new
   technology still agrees with the verb, the metric, and the data shape. If the metric no longer
   reads naturally in the new stack's idiom, restate it in that idiom or abandon the swap.

---

# PART 5 — CONSISTENCY LEDGER

Every substitution is reported by the Writer as a `SUBSTITUTIONS` line in its internal report, and
the orchestrator surfaces that list to the operator in the final reply:

```
SUBSTITUTIONS: role_3: AWS → Azure, cloud; project queuelite: Go → Python, language
```

On a repeat application to the same company, reuse the substitutions from that earlier reply. A
recruiter or background check that sees two different stacks for the same role is a problem no
rewrite can fix. `applied_jobs.txt` records only company, role, platform, and date — it is a
deduplication list, not a substitution ledger.
