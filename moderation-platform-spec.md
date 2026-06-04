# Content Moderation Infrastructure — Architecture Spec (Locked)

## Who I am & why this project exists (context for any session helping me)

I'm a **frontend-focused fullstack developer** (~3.5 years: TypeScript, React, Next.js, NestJS, PostgreSQL, Redis, Docker). **I have no real microservices experience** — my backend work has been limited. I'm building this project to **learn as many real-world patterns and best practices of complex microservice backends as possible**, by building one properly end-to-end.

**Goal:** switch from frontend-leaning to **backend-focused fullstack**, and land a **mid/senior backend role**. So every decision should be weighed by: _does this teach me a real, transferable backend/systems skill, and does it hold up to a senior interviewer?_ Learning value is the point — not shipping a product, not collecting buzzwords.

What this means for how to help me: I haven't implemented most of these patterns before, so explain the _why_ behind each, flag where I'm likely to get stuck, and keep scope ruthlessly realistic for a solo dev after a day job. The frontend is built largely with Claude Design/Code so it shouldn't consume my learning time — the backend is where I need to do the real work and understand it deeply.

> ## ⚠️ This spec was written with AI, not by an experienced microservices engineer
>
> I (the developer) am not experienced enough to have authored or fully validated this independently, and the AI that helped is fallible. **Treat every decision here as a hypothesis, not gospel.** Any session using this spec should actively doubt its correctness, question whether each choice is genuinely the best way to reach my learning + job goals, and **propose updating the spec when something is wrong, over-engineered, or there's a better path.** Several earlier versions of this very spec contained mistakes that were only caught by pushing back. Keep doing that. The spec serves the goals; the goals don't serve the spec.

---

## Concept

B2B SaaS: software businesses integrate to moderate their users' content against their own policies. A cheap classifier handles the common case; an LLM handles uncertain or context-dependent cases; uncertain items route to human review; outcomes are delivered via signed webhooks.

**Framing:** This is _moderation infrastructure_ — a reliable async pipeline that runs swappable classifiers and routes uncertain cases to humans. It is not "an AI moderation model." Lead with the pipeline, not the AI.

---

## Phasing (read first)

The 2-month MVP is the **distributed-systems spine on text**. Everything else is explicitly sequenced after.

- **MVP (~2 months):** full pipeline end-to-end, **text only**. Ingest → RabbitMQ → Tier-1 classification → decision → outbox → signed webhook + human review queue with SKIP LOCKED. Docker Compose. Real text consumer (Poster) + public guided demo.
- **Phase 1.5:** Tier-2 LLM (dynamic per-tenant context rules + borderline escalation). This is the highest-value feature but also where the complexity lives — design for it now, build it after the spine is solid.
- **Phase 2:** image moderation (classifier service, S3 upload path, larger-payload backpressure), Poster image support, k6 load test, optional k8s manifests.

The `Content` model is **polymorphic from day one** (`type: "text" | "image"`) so image handling slots in later without reworking tables or event schemas. Two known types — not a generic "any content" abstraction.

---

## Services (4)

> **Revised from 3 → 4 (initial, not final).** Webhook delivery — originally folded into Moderation — is now its own service; "Moderation" is renamed **Review** and is human-only. Full reasoning in the next section. The event-flow diagram already implied a separate "Webhook dispatcher"; this just makes it a real service.

**1. Ingest API**

- Public B2B API + entry point for the guided demo
- Issues S3 signed URLs for uploads (phase 2 / image path)
- Persists the `Content` record, returns content IDs, publishes `content.uploaded`
- **Owns the Content aggregate for its whole lifecycle:** also consumes `content.decided` and updates `content.status` — one place to query "status of X" and to compute dashboard stats (this record _is_ the audit log)
- Owns content-hash dedup
- **Profile:** light I/O, latency-sensitive, scales with API request volume

**2. Classification**

- Consumes `content.uploaded`
- Tier-1 classifier (MVP); Tier-2 LLM (phase 1.5) → per-category scores
- Applies the tenant's policy (thresholds/rules) and **decides**: confident → publish `content.decided`; uncertain → publish `content.needs_review`
- Small own store (dedup keys, outbox; optional decision-detail log). Policy lives here because it runs right after scoring — a separate policy service would be function-as-a-service overcomplication at this scale
- **Profile:** CPU-bound, slow per item, bursty, batchable — separate scaling tier (this is what forces backpressure)

**3. Review** (human-only — was "Moderation")

- Consumes `content.needs_review`
- Human review queue with claim-once semantics (`SELECT FOR UPDATE SKIP LOCKED`)
- Human resolves → outbox → publish `content.decided`
- **Profile:** human-paced, state-holding, low throughput, concurrency-sensitive

**4. Webhook / Notification**

- Consumes `content.decided` from **either** path (auto from Classification, human from Review) — one outbound path, not two
- Signed delivery (HMAC) with retries, exponential backoff + jitter, DLQ; owns delivery idempotency
- **Profile:** I/O-bound on slow/flaky external endpoints, retry-heavy, can lag without blocking decisions — a distinct failure domain

**Dashboard stats / audit:** from Ingest's `Content` records (final status + decision metadata carried on `content.decided`). Single store, no separate analytics service. A read model would only appear if query latency ever demanded it (millions of records away, irrelevant to MVP).

---

## Event Flow (RabbitMQ, choreography)

```
Ingest          --content.uploaded----->  Classification
Classification  --content.decided------>  Webhook            (confident → auto)
Classification  --content.needs_review->  Review             (uncertain)
Review          --content.decided------>  Webhook            (after a human resolves)
Webhook         --signed POST---------->  Customer endpoint
Ingest          <--content.decided------  (consumes to update content.status)
```

Choreography — no central orchestrator. Each service reacts to events and decides its own next step. `content.decided` has **two producers** (Classification's auto path, Review's human path) and **two consumers** (Webhook for delivery, Ingest for status) — its schema lives in `packages/events`.

---

## Service Boundary Reasoning (initial — treat as hypothesis)

**Honest framing for interviews:** at this product's realistic early scale you'd ship a **modular monolith**, not microservices. This is built as separate services to _learn_ distributed patterns — with boundaries chosen to survive a real split. Saying that is more credible than claiming the product demanded microservices. Knowing when _not_ to split is itself senior signal.

**The test for a real boundary:** if you had to split a monolith under load, would you cut _here_ — because the two sides **scale, fail, or change differently**? If yes, real. If they always change together and share a DB transaction, it's a fake boundary and should stay one service.

**Each service against that test:**

- **Classification** — strongest, near-forced: CPU/GPU-heavy, bursty, own runtime (ONNX/models), scale + ship new models without touching the API.
- **Webhook** — strong: external endpoints are slow/flaky, retry-heavy, can lag without blocking decisions. Distinct failure domain. (Dedicated webhook delivery is a real industry pattern — Svix, Hookdeck.)
- **Review** — justified by the durable, concurrency-sensitive human queue (claim-once).
- **Ingest** — accept-fast / process-async front door; high-throughput, must-never-drop. The one most foldable into a monolith, but still a real line.

**One-line spine (the defense if challenged):** the four have radically different scaling/failure profiles — light I/O front door · bursty ML · stateful human queue · flaky-endpoint delivery. That's _why_ the split is reasoned, not cosmetic.

**Bonus property:** each stage **degrades independently** — Classification down → uploads queue; Review down → hard cases wait; Webhook down → decisions wait, nothing lost.

**Rejected:** a separate policy/decision service (keeping Classification scoring-only). Applying tenant thresholds is a cheap stateless function — a service for it is function-as-a-service overcomplication, hard to defend. Split only if policy grows into a real rules engine.

**Tradeoff accepted:** `content.decided` is emitted from two services, so the authoritative per-content status/audit is reassembled in Ingest (it owns the Content aggregate). Restores a single status/stats store without a 5th service.

### Clarifications agreed so far (working memory)

- Ingest persists Content (return id fast, durable record, dedup hash) and tracks its lifecycle status by consuming `content.decided`.
- Classification scores **and** applies policy **and** decides (auto vs human). Decision/threshold logic + its first unit test live in **Classification**.
- Review is human-only; emits `content.decided` after a human resolves.
- Webhook is the single outbound path for both auto and human decisions.
- db-per-service = logical isolation locally (one Postgres instance, separate databases, no cross-DB queries); separate instances in prod only when a service's scaling/failure isolation demands it.
- Services run on the host in dev (infra in Docker); all connection config via env vars so containerizing later is trivial.
- `tenantId` carried on every row and event from the first multi-service milestone.

---

## Why RabbitMQ (the broker choice — keep explicit)

RabbitMQ is the message broker between services: producers publish events, consumers process them asynchronously, stages decouple. It carries the event-driven, choreographed pipeline.

**Why RabbitMQ and not Kafka here:** Kafka's main distinguishing feature is a retained, replayable log. This system doesn't need that at MVP scale — there's no built replay requirement, and the throughput doesn't demand a partitioned log. RabbitMQ is sufficient, simpler to operate, and its routing model fits a stage-to-stage pipeline well. Choosing the lighter tool that fits the actual scale (rather than the heavier one for a keyword) is the deliberate call. _(If replay/re-evaluation of history at high volume ever became a real requirement, Kafka would be the migration — noted, not built.)_

**The "why this broker" answer (rehearse):** _"RabbitMQ — sufficient throughput, clean routing for a stage pipeline, simpler to operate. Kafka's value is a replayable log, which I didn't need at this scale; I'd migrate to it if replay or partitioned-log throughput became real requirements."_

**Broker vs BullMQ split (a real design distinction):**

- **RabbitMQ** = inter-service event backbone (`content.uploaded`, `content.needs_review`, `content.decided`) — how services communicate.
- **BullMQ** = in-service job execution inside Classification (call the model, retry, DLQ). Different problem: job processing within one service, not cross-service messaging.

> **Event-driven ≠ the broker.** The event-driven _pattern_ is "services react to events, not direct commands." RabbitMQ is just the transport. The pattern — choreography, eventual consistency, async stages — is what's claimed, and it's all genuine here regardless of broker.

---

## Two-Tier Classification

Separate the **classifier** (ML model) from **rules** (tenant config). The original conflation of these is fixed below.

**Tier 1 — classifier + tenant config (MVP, fast, every item)**

- **Classifier:** ML model producing per-category scores (e.g. toxicity, threat, profanity). Text MVP uses a Detoxify-style model.
- **Run in Node** via `onnxruntime-node` (model exported to ONNX). No Python — stay in one stack. Python/FastAPI sidecar only as a forced fallback if a required model resists ONNX export.
- **Tenant config:** tenant picks which categories matter + thresholds ("block if toxicity > 0.7").
- **Static rules overlay (optional MVP):** tenant keyword blocklists applied alongside classifier scores.

**Tier 2 — LLM (phase 1.5, expensive, only when needed)**

- Invoked only for (a) **dynamic per-tenant context rules** the classifier can't express — e.g. "don't allow e-commerce commenters to reference competing products" — and (b) borderline Tier-1 scores.
- Tenant-provided context document injected into the prompt.
- **Why it's worth building:** it's a real reliability axis — slow, fallible, costs money — which makes the existing retry/DLQ/backpressure patterns _meaningful_ (the expensive tier is the bottleneck that sharpens the backpressure story). Adds depth, not breadth. Not a new service.

Routing: Tier 1 → if uncertain or context-rule applies → Tier 2 → result.

---

## Locked Patterns (forced by domain)

**Communication & events**

- RabbitMQ: 3 event types (`content.uploaded`, `content.needs_review`, `content.decided`) routed between services — justification above. These exact strings are the single source of truth (`packages/events`); spec prose is derived from them.
- BullMQ inside Classification for AI worker jobs
- Choreography — no central orchestrator
- Eventual consistency at system boundary (decision recorded ↔ customer webhook received)

**Reliability**

- Transactional Outbox in Classification and Review (atomic decision + event publish, no lost events)
- Idempotency: content-hash dedup on upload, consumer dedup keys, webhook delivery keys
- DLQ: failed classifications + exhausted webhook retries
- Retry with exponential backoff + jitter on outbound webhooks
- HMAC signing on outbound webhooks

**Concurrency**

- `SELECT FOR UPDATE SKIP LOCKED` on the review queue (claim-once) — the owned concurrency story; foreground this in the narrative
- Redis rate limiting per API key on Ingest (and on the public demo endpoint)
- Backpressure: Ingest sheds / 429s when classification queue depth exceeds threshold

**Storage**

- S3 (MinIO locally) + signed URLs — uploads bypass the API (image path, phase 2)
- Postgres per service (database-per-service — committed; accept the migration/setup overhead for a genuine microservice example; no cross-service joins, outbox + events are the only data-sharing path)
- ORM: **Drizzle** — SQL-first, no engine binary, clean raw-SQL/lock support (fits SKIP LOCKED + outbox better than Prisma; fresh keyword over the TypeORM used in MTAS)
- Redis: rate-limit counters, BullMQ backing store, API-key→tenant cache

**Auth & multi-tenancy**

- MTAS as auth broker (own auth service plugged in)
- API keys + HMAC for B2B clients (Ingest)
- JWT for moderator/admin UI
- Full tenant isolation: every query scoped, every event tagged
- Dedicated **demo/sandbox tenant** for the public guided demo (hard rate-limited, abuse-guarded)
- Per-tenant policy config (categories, thresholds, blocklists) + context docs (Tier 2)
- Policy versioning + audit log (every decision records active policy version + deciding tier)

**API surface**

- OpenAPI / Swagger
- Predictable error shapes, status codes, pagination, input validation

**Observability**

- OpenTelemetry traces: upload → classification → decision → webhook delivered (async hops are why tracing earns its place here)
- Prometheus + Grafana, one dashboard: classification queue depth, p95 classification latency, webhook delivery success rate, moderator queue depth
- Structured JSON logs with correlation IDs across services

---

## Frontend (Next.js — FE built with Claude Design/Code, minimal hand-effort)

- Marketing landing + signup
- **Landing-page guided demo** (provisional shape): visitor fills a form, sets an easy rule, submits text, sees a moderation-style result view. Hits the **real** Tier-1 pipeline via the public sandbox endpoint — not a mock. Text only. Shows the automated verdict + scores; if an item would route to human review, show a read-only "would be queued for review" state (no live moderator). Upsell: sign up at Poster / set up a real tenant.
- B2B dashboard: API keys, usage, policy editor, webhook config
- Moderator UI: review queue + actions (the human-check step)

**Real-time:** WebSockets / SSE for moderator queue live updates.

---

## Infra & Testing

- **Monorepo: pnpm workspaces. Turborepo deferred** — add only if/when build-test times actually annoy, or a target role wants the keyword. Primary reason for the monorepo: a shared `packages/events` holding event-schema types, imported by every service so producer/consumers can't drift — **pnpm workspaces alone deliver this**. Turborepo's value is build-cache/task orchestration, which a 4-service solo project doesn't need at the start; don't defend it as required for type-sharing (that argument loses). If added later: readable `turbo.json`, real build caching — set up structure, don't over-tune pipelines.
- **Docker Compose** for the full multi-service system (dev + a real deployed demo on Railway/Fly.io/VPS — a running URL beats local manifests)
- GitHub Actions: tests + build images + deploy

## Testing (targeted, not coverage)

I've never written backend tests — closing that gap is an explicit learning goal. But the principle here is **not coverage**. Test the behaviors that **can't be verified by hand** — which are exactly the reliability/concurrency patterns, and exactly what a senior interviewer will ask "how did you prove that?" about. The test _is_ the proof a pattern works. So testing is **cross-cutting**: each reliability milestone ships with the test that proves its claim, and isn't "done" until that test passes.

**Difficulty ladder (so the first test isn't the hardest):**

1. **Unit** — pure logic, no I/O (the decision-threshold function, HMAC signing, backoff-interval calc). Fast, just a runner. First taste.
2. **Integration** — real dependencies via **Testcontainers** (ephemeral Postgres + RabbitMQ, clean state per run). First real one: idempotency.
3. **Concurrency** — the SKIP LOCKED claim-once proof (N parallel claims → each row claimed exactly once). Hardest and most impressive.

**What earns a test (mapped to patterns):**

- **Idempotency / dedup** — send the same message/payload twice → assert one effect.
- **Claim-once (SKIP LOCKED)** — concurrent claims → no row claimed twice. _The headline test._
- **Webhook signing** — deterministic HMAC unit test; **retry path** — fail the receiver → assert backoff + eventual DLQ.
- **Outbox atomicity** — simulate failure between decision-write and publish → no lost/orphan event.
- **Backpressure / rate limit** — exceed limit → 429; queue depth over threshold → shedding.
- **Tier-1 routing logic** (phase, M7) — test _my_ threshold/routing, not the model's accuracy.

**Deliberately NOT tested** (most of the codebase, on purpose): stub classification logic, trivial CRUD, framework wiring NestJS already guarantees, third-party model accuracy, and any coverage-percentage target. Coverage goals are the cargo-cult version of this.

- **Harness choice — Testcontainers** (hypothesis): solves clean-state isolation, the beginner's main integration-test pain; real, resume-worthy skill. Fallback if it's a time sink: truncate a shared test DB between runs.
- Playwright E2E on guided demo + moderator UI (frontend-side, lower priority for the backend learning goal).
- **k6 load test (phase 2, last):** proves the system holds and Ingest backpressures cleanly. Load-testing an incomplete system is theater — sequence it after the spine works.

---

## Consuming Apps

- **Poster** (existing app) → full moderation consumer. Text in MVP; image support added in phase 2.
- **Landing-page guided demo** → public, zero-friction text demo over the real pipeline.

---

## Out of Scope (README roadmap)

Webhook delivery dashboard + replay UI; re-evaluation of historical content (would require re-submitting from a store, or a Kafka migration — not built); sandbox/test mode beyond the demo tenant; bulk submission endpoint; GDPR cascading data deletion.

---

## Patterns Deliberately Rejected (with reasons — this list is itself a top-down-thinking signal)

- **Kafka** — its distinguishing value is a retained, replayable log; not needed at MVP scale and not worth the operational complexity. RabbitMQ is sufficient for the throughput and fits a stage pipeline. Would migrate only if replay or partitioned-log throughput became real requirements.
- **Saga** — no compensating-action semantics needed; outbox + choreography suffices
- **Redis distributed locks (Redlock)** — Postgres `SELECT FOR UPDATE SKIP LOCKED` is better here because the lock is tied to the same transaction as the state change. _(Redis is still used heavily — rate limiting, BullMQ backing, tenant cache — only the locking feature is rejected.)_
- **Kubernetes** — `kind`/`minikube` is a single-node fake that proves YAML authoring, not distributed ops; Docker Compose + a real deployed URL is the honest story at this scale. Manifests addable in phase 2 only if a target role demands the keyword.
- **CQRS, event sourcing, gRPC, two-phase commit, DB partitioning, service mesh, separate API-gateway service, circuit breaker, GraphQL, vector DB / RAG beyond context injection, MongoDB, Terraform, Helm, ELK, separate Jaeger/Loki** — out of scope; not justified at MVP scale.

---

## Interview Narrative (infra first, AI third)

> "Content moderation **infrastructure** for B2B SaaS. Reliable async pipeline: services communicate over RabbitMQ in a choreographed, event-driven flow, with an outbox-pattern signed-webhook delivery path and human-in-the-loop review using `SELECT FOR UPDATE SKIP LOCKED` for claim-once semantics. Authenticated via my own auth service, MTAS. Two-tier classification — a cheap classifier for the common case, an LLM only for uncertain or per-tenant-context cases — for cost/latency optimization. Observable end-to-end with OpenTelemetry. A real text consumer plus a public guided demo over the live pipeline."

Lead with: pipeline, choreography/outbox, SKIP LOCKED. Mention two-tier classification as a cost optimization, not the headline. Be ready to defend "why RabbitMQ" (sufficient throughput, clean routing, simpler than Kafka whose replay/log value you didn't need) and "why SKIP LOCKED not Redis locks" (lock tied to the state-change transaction).
