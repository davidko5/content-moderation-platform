# ROADMAP

Execution plan derived from `moderation-platform-spec.md`. The spec is the
_architecture_; this is the order I build it in to _learn_ it.

**Services (4):** Ingest · Classification (scores + policy + decides) · Review (human-only)
· Webhook (delivery). `content.decided` is emitted by both Classification (auto) and Review
(human); Webhook delivers it; Ingest consumes it to track status. See spec → Service Boundary Reasoning.

## Rules for this file

- One major new concept per milestone, on familiar scaffolding, each independently demoable.
- **Decompose a milestone into steps only when I start it.** Later milestones stay as
  headlines on purpose — the design will change as I learn, so pre-planning it is waste.
- A step is done when it **runs** _and_ I can **explain every new line**.
- Before each milestone: write down its 3–5 new concepts and which I'll hand-write myself.
- **Testing is cross-cutting, not a milestone.** A reliability/concurrency milestone isn't
  done until the test that _proves its claim_ passes. Test only what can't be verified by
  hand (see spec → Testing); most code gets no tests, on purpose. Difficulty ladder:
  unit (M1) → integration / Testcontainers (M2) → concurrency (M5).

## Status

- **Current:** M0 done (one event across the wire). Next: M1.
- **2-month target = M0–M5** (re-baselined). At ~10–15 focused hrs/week, first-ever
  RabbitMQ + backend tests + Testcontainers, M0–M5 _is_ a full honest 2 months — and it's
  already the whole core interview story (choreography → outbox → signed webhooks → SKIP
  LOCKED). **M6–M9 = a second ~6–8 weeks.** The metric is "can I explain every line," not
  "did I hit the date" — let milestones slip without it counting as failure.
- Milestones are ordered by **learning + resume value**, so M0–M5 is also the natural
  stopping point: a defensible system on its own. M6+ thickens it.
- **Review backlog:** correctness/depth notes from the architecture review live in
  `REVIEW-BACKLOG.md`, tagged per milestone. Read the relevant section when you start a
  milestone — they're not start-blockers, they're "get this right when you build it."

---

## MVP spine (text only)

### M0 — One event across the wire · NEW: RabbitMQ producer/consumer

_Goal: one event flows from one service to another over a real broker._

- [x] pnpm workspace: `apps/ingest`, `apps/classification`, `packages/events`
- [x] `docker-compose` with **RabbitMQ + Postgres only** (nothing else yet)
- [x] `packages/events`: define the `content.uploaded` event type, export it
- [x] Ingest: `POST /content` validates input, inserts a content row via Drizzle
- [x] Ingest: publish `content.uploaded` after the insert
- [x] Classification: connect, declare queue/binding, consume `content.uploaded`,
      log it, ack it. **Decision logic fully stubbed** (no model).
- [x] Prove it: POST → consumer logs the message and acks it. I can explain
      exchange vs queue vs binding.

### M1 — Choreography loop, stubbed brain · NEW: multi-hop + closing the loop

_Goal: a decision flows back and updates the content's status. Two real hops._

- [ ] Carry `tenantId` on every row and event — hardcode one dev tenant for now,
      so isolation isn't retrofitted later
- [ ] Classification: stub-decide (threshold on a fake score) → publish `content.decided`
      (always "approved" for now; add the type to `packages/events`)
- [ ] Ingest: consume `content.decided` → update `content.status` (Ingest owns the Content
      record's lifecycle; this is your single source for status/stats)
- [ ] **First test (unit):** the decision-threshold function in Classification — pure logic,
      no I/O. Sets up the test runner (vitest/jest). A confidence win before the hard ones.
- [ ] Prove it: one POST flows Ingest → Classification → back to Ingest; content ends `approved`.
      _(db-per-service becomes real at M2, when Classification gets its own dedup store. Review +
      its DB and the `content.needs_review` fork arrive at M5.)_

### M2 — Idempotency + consumer reliability · NEW: dedup, manual ack, DLQ

_Goal: don't process twice, don't silently lose a message._

- [ ] Content-hash dedup on upload (same payload → same content, no duplicate row)
- [ ] Consumer dedup keys in Classification (and Ingest's `content.decided` consumer) —
      survive redelivery. _Classification gets its own DB here → db-per-service is now real._
- [ ] Manual ack only after successful processing; deliberately nack to test requeue
- [ ] Dead-letter queue for failed classifications; force a failure, watch it land
- [ ] **Test harness (integration):** Testcontainers — ephemeral Postgres + RabbitMQ, clean
      state per run. Set up once here; reused by every later integration test.
- [ ] **First integration test:** send the same message twice → assert one effect
      (idempotency). Your first real backend integration test.
- [ ] Prove it: redeliver a message and double-POST a payload — neither double-processes.

---

## MVP spine — remaining (headlines; decompose when reached)

- **M3 — Transactional outbox** · NEW: the dual-write problem, outbox relay.
  In Classification's decide path: write the decision + an outbox row in one transaction;
  a poller publishes `content.decided`. (Reused by Review at M5.)
  _Test:_ simulate failure between the write and the publish → no lost or orphan event.
- **M4 — Webhook service** · NEW: a dedicated `apps/webhook` consuming `content.decided`;
  HMAC signing, retry w/ exponential backoff + jitter, delivery idempotency keys, outbound DLQ.
  Build a tiny test receiver as the "customer".
  _Test:_ deterministic HMAC unit test; integration — fail the receiver → assert backoff + eventual DLQ.
- **M5 — Review service + human queue (SKIP LOCKED)** · NEW: claim-once concurrency
  _(your headline pattern)_ + the uncertain fork. `apps/review` + its own DB; Classification now
  also emits `content.needs_review` for low-confidence items; Review queues them, a human claims
  one via `SELECT … FOR UPDATE SKIP LOCKED`, resolves → `content.decided` (reuse the M3 outbox).
  Simulate concurrent moderators.
  _Test (the big one):_ N parallel claims → each row claimed exactly once.
- **M6 — Rate limiting + backpressure** · NEW: Redis limits, queue-depth shedding.
  Per-API-key rate limit on Ingest; Ingest 429s when the classification queue is too deep.
  _Test:_ exceed the limit → 429; push queue depth over threshold → shedding.
- **M7 — Real Tier-1 classifier** · NEW: `onnxruntime-node` + BullMQ in-service jobs.
  Swap the stub for a Detoxify-style ONNX model; per-category scores + tenant thresholds.
- **M8 — Observability** · NEW: OTel traces across async hops, Prometheus + Grafana,
  correlation IDs. Trace upload → classification → decision → webhook end to end.
- **M9 — Auth + multi-tenant isolation** · NEW (mostly _integration_ — auth is your existing
  strength): API keys + HMAC for B2B clients, JWT for the moderator UI, MTAS as auth broker,
  enforced tenant scoping, demo/sandbox tenant, OpenAPI/Swagger.

## After MVP (from the spec's phasing)

- **Phase 1.5 — Tier-2 LLM:** per-tenant context rules + borderline escalation, context-doc injection.
- **Phase 2 — Images:** classifier, S3/MinIO upload path, larger-payload backpressure,
  k6 load test, optional k8s manifests.

## Frontend (built with Claude Design/Code — not learning time)

- Moderator UI must exist by **M5** to exercise the review queue.
- Guided demo over the live pipeline by **end of MVP**.
- B2B dashboard alongside **M9**.
