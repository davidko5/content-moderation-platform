# Review Backlog

Correctness/depth notes from the first architecture review (session 1). **None are
start-blockers.** Each is tagged to the milestone where you'll actually build that piece —
read its section when you start that milestone, not before. Severity = how much it bites if
ignored. Tackle when you understand the surrounding code; check items off as you address them.

Legend: 🔴 must-get-right · 🟡 should-do · 🟢 nice / resume polish

---

## M1 — choreography loop

- [x] 🟡 **Ingest's `content.decided` consumer must be idempotent** (not "monotonic" — the
      reviewer's "uploaded stomps status back to pending" scenario does NOT apply here: Ingest
      sets `pending` synchronously at INSERT, and `content.uploaded` is consumed only by
      Classification). The real risk is just **duplicate `content.decided`** (at-least-once):
      setting the terminal status twice = same result, so a plain idempotent update is enough.
      A monotonic forward-only guard (`WHERE status='pending'` / version) only becomes needed
      **if** you later make Ingest also track `needs_review` as a visible status — then two
      different states could arrive out of order. Note for then; skip now.

## M2 — idempotency + reliability (this is where most notes land)

- [ ] 🔴 **Dedup hash must include tenant.** Two tenants posting identical text ("hello")
      would collide into one row. Use `UNIQUE(tenant_id, content_hash)` + `INSERT ... ON CONFLICT`
      (DB-atomic) instead of read-then-write (races). Also decide text canonicalization (trim?).
- [ ] 🔴 **Tenant scoping is a DATA concern — start it here, not M9.** Make `tenant_id` a real
      FK with a tenant/policy table; route every query through a tenant-scoped helper; resolve
      tenant from the API key in Ingest before M6 (so rate-limit is truly per-key). Only the
      _auth integration_ (MTAS/JWT/Swagger) stays at M9. Otherwise M2 dedup, M6 rate-limit, M7
      thresholds all get reworked later.
- [ ] 🔴 **Per-listener idempotency checklist.** Every event listener can get a duplicate
      delivery. For each, define the dedup key + "one effect" rule:
  - Classification ← `content.uploaded`: dedup on messageId/contentId.
  - Review ← `content.needs_review`: `UNIQUE(contentId)` on the queue table (DB rejects the
    duplicate enqueue — else a human reviews the same item twice). ← currently missing.
  - Webhook ← `content.decided`: delivery key per (contentId, endpoint). (built at M4)
  - Ingest ← `content.decided`: status update idempotent + monotonic (see M1). ← missing.
- [ ] 🔴 **Store dedup keys in Postgres, in the SAME transaction as the effect** (a
      `processed_messages` table, PK `(consumer, message_id)`). NOT Redis (Redis is fine for
      rate-limit counters where loss is OK, not for exactly-once). Avoid the broken 3-step
      "check key → do work → write key".
- [ ] 🟡 **Idempotency test = the real proof.** Send same message twice → assert one effect.
      Stronger: redeliver _after_ a simulated mid-processing crash → still one effect. (your first
      real integration test)
- [ ] 🟡 **Testcontainers spike first.** Before the M2 reliability work, get ONE trivial test
      spinning up an ephemeral Postgres + asserting a row (separate from dedup logic). macOS has
      first-run friction (Ryuk, image pull, RabbitMQ-ready races). Pin explicit image tags
      (constructor now requires it). If it eats >1 day → fallback to truncating a shared test DB.
- [ ] 🟢 **CI early.** Stand up GitHub Actions (lint + unit + the Testcontainers integration
      test) now that the first integration test exists. The win: "every PR runs my idempotency
      test against ephemeral Postgres/RabbitMQ." Image build + deploy come later.

## M3 — transactional outbox

- [ ] 🔴 **Outbox in Ingest too (DECIDED).** Ingest does `INSERT content` + publish
      `content.uploaded` = the same dual-write the outbox solves. Crash between → row stuck
      `pending` forever, nothing classifies it. So Ingest gets the same outbox+relay pattern as
      Classification/Review — `content.uploaded` is published by the relay, not directly in the
      POST handler. (Considered + rejected: a reconciliation sweep that re-publishes stale
      `pending` rows — less consistent, keep as a fallback talking point only.)
- [ ] 🟡 **Relay = publish-THEN-mark-sent** (at-least-once). State this explicitly — it's
      _why_ every consumer must be idempotent (the M2 work closes the loop).
- [ ] 🟡 **Outbox test, done right** (the roadmap's "fail between write and publish" is
      imprecise — there's no such gap). Split into two:
  1. _Atomicity:_ throw AFTER the decision-write + outbox-insert but BEFORE commit → assert
     neither row exists (deterministic — you control the throw).
  2. _Relay at-least-once:_ crash after publish but before mark-sent → restart → event
     republished AND consumer dedup collapses it to one effect.

## M4 — webhook service

- [ ] 🟡 **Use the Standard Webhooks scheme** (Svix-authored, citeable). Sign
      `id.timestamp.rawBody` with HMAC-SHA256; send `webhook-id` / `webhook-timestamp` /
      `webhook-signature`. Timestamp inside the signed string = real replay protection.
- [ ] 🟡 **Delivery key stable across ALL retries** (derive from contentId+endpoint), so a
      re-consumed message or retry produces the same key and the receiver dedups.
- [ ] 🟢 **SSRF protection (resume/post material — the bit most people miss).** Customer URLs
      are attacker-controlled. HTTPS-only; resolve the host; reject private/loopback/link-local/
      metadata IPs (incl. 169.254.169.254); connect to the pinned IP (DNS-rebind/TOCTOU); don't
      blindly follow redirects to internal IPs. Node `fetch`/undici doesn't take http.Agent — use
      undici with a custom connector that validates the resolved IP. Say "egress proxy = layer 2"
      for prod. **Worth it: cheap, high-signal, directly resume-able.**
- [ ] 🟡 **Retry test:** fail the receiver → assert backoff grew → assert it lands in DLQ.
      Compress the schedule (1s/5s/30s…) so the test runs in seconds; document prod values.

## M5 — review service + SKIP LOCKED (headline)

- [ ] 🔴 **Don't hold the row lock during human review** (minutes = connection-pool death).
      Claim = sub-second txn that flips `status='claimed'` + commits immediately. Human works with
      NO lock held. Resolve = a second short txn.
- [ ] 🔴 **Lease + claim_token.** A reaper re-queues rows stuck `claimed` past a timeout. Set a
      `claim_token` (uuid) at claim time; the resolve step checks `WHERE id=$1 AND claim_token=$2`
      so a moderator whose lease expired can't overwrite the item someone else now owns. ← this
      detail is genuine senior signal.
- [ ] 🟡 **Claim query = one statement:** CTE `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1`
      feeding `UPDATE ... RETURNING`. Use raw `sql\`\``in Drizzle (the query-builder`.for()`can't express CTE+UPDATE). Partial index:`(created_at) WHERE status='pending'` (+ tenant).
- [ ] 🟡 **Concurrency test = the resume line.** Cover 3 properties, hardest first: (a) N
      parallel claims → each row claimed exactly once; (b) worker claims then dies → after lease
      expires another reclaims, nothing lost; (c) no double-resolve.
- [ ] 🟡 **Decouple the proof from the moderator UI.** The concurrency test IS the deliverable;
      it needs no frontend. Build it first; UI is optional demo polish.
- [ ] 🟢 **Indexing pass** (you want to learn this). Index the queue claim, the dedup hash,
      `(tenant_id, status)` for dashboard reads. Run `EXPLAIN ANALYZE` on the dequeue + dedup
      lookup, keep the output — interview gold.

## M6 — rate limiting + backpressure

- [ ] 🟡 **Two different things, frame them separately.** (1) per-API-key rate limit = admission
      control — use `rate-limiter-flexible` (RateLimiterRedis, token bucket), atomic, return 429 +
      Retry-After, fail-open on Redis outage. (2) backpressure = the _honest_ version is consumer
      **prefetch** at the CPU-bound classifier; queue-depth 429 is the explicit edge load-shed.
- [ ] 🟡 **Measure queue depth via cached Redis/Prometheus, never a sync mgmt-API call on the
      request path.** Use two thresholds (shed above HIGH, resume below LOW) for hysteresis so it
      doesn't flap.
- [ ] 🟢 **Pull a minimal load test forward to here** (k6/autocannon, text spine only). You
      can't claim "Ingest sheds under load" with zero numbers. One paragraph — "at X req/s the
      queue hit N, 429 kicked in at T, p95 ingest stayed flat, nothing dropped" — beats more
      milestones. (Full k6 + image payloads stay in Phase 2.)

## M7 — real Tier-1 classifier

- [ ] 🟡 **Primary path = `@huggingface/transformers` + `Xenova/toxic-bert`** (wraps
      onnxruntime-node, bundles the tokenizer, ONNX export already done by the community). NOT
      raw onnxruntime-node first — you'd have to hand-roll WordPiece tokenization (the real time
      sink). Use `top_k: null` — toxic-bert is multi-label (6 heads); default returns only the top
      one and would silently break your per-category thresholds. Python sidecar = unlikely-needed
      fallback. (Optional: do ONE bare-onnxruntime call to understand the layer transformers.js
      hides — that's the interview-grade depth.)
- [ ] 🟢 **Split M7 into two steps** (one-new-concept rule): (1) swap stub→real model behind
      the existing interface, sync inference fine; (2) add BullMQ around it for concurrency cap +
      retry. RabbitMQ alone is enough until the model is real — BullMQ's reason to exist is the
      CPU/concurrency cap (and the LLM rate-limiter in Phase 1.5), not "moderation needs 2 queues."

## M8 — observability

- [ ] 🟡 **Trace context does NOT auto-propagate across RabbitMQ — but a library does it.** Use
      `@opentelemetry/instrumentation-amqplib` (auto-injects W3C `traceparent` into message headers)
      — works only with raw amqplib + OTel initialized BEFORE NestFactory (init-after is the #1
      silent-drop bug). Budget this milestone ~2× others (most likely rabbit hole). Consider
      pulling a minimal trace forward to M3–M4 while only 2–3 services exist.
- [ ] 🟡 **Spec error: Prometheus can't store traces.** It's metrics-only. To actually SEE the
      end-to-end trace you need 1 extra container (`jaegertracing/all-in-one`, accepts OTLP
      directly). Keep Prometheus+Grafana for the 4 metrics; add Jaeger only for traces. Knowing
      metrics≠traces is itself senior signal.
- [ ] 🟢 **SLOs + 1 alert + a one-page runbook** for the 3 failure modes you already named
      (Classification down → uploads queue; Webhook down → decisions wait; queue depth climbing).
      Near-zero code, directly arms "tell me about a failure" interview questions.

## M9 — auth + multi-tenant

- [ ] 🟡 **Only the auth-integration half lives here** (MTAS/JWT/demo tenant/Swagger). The
      data-model/scoping half was pulled forward to M2 (see above).
- [ ] 🟢 **Reconsider MTAS-as-separate-service.** Auth is your existing strength; a standalone
      auth broker adds distributed-auth surface without teaching a new pattern. Keep API-key+HMAC
      (core to the B2B story); consider folding auth into Ingest unless a target job wants "built a
      standalone auth service." Low priority — decide later.

## Phase 1.5 — Tier-2 LLM

- [ ] 🟡 **PII / data-governance story** (a senior WILL ask — you're shipping the spiciest
      content to a third party). Require zero-retention/no-training provider config; make Tier-2
      per-tenant opt-in; name redaction-before-send + a self-hosted-LLM escape hatch. Defend it,
      don't build it.
- [ ] 🟡 **Define the Tier-1→Tier-2 routing precisely.** "uncertain OR context-rule applies"
      as written would route 100% of a tenant's traffic to the expensive tier (a context rule is
      always true for that tenant). Gate context-rule escalation on a cheap pre-filter
      (keyword/embedding match) too. Target Tier-2 traffic <10–15% so the cost story holds.
- [ ] 🟢 **Graceful degradation:** Tier-2 timeout → route to human Review instead of blocking.
      Good story: expensive tier failing degrades to the human queue, not to data loss.

---

## Spec-language polish (do whenever, low stakes)

- [ ] 🟢 Reframe Review's boundary justification: it's separate because human review is a
      different **availability/pace** domain (can be down for hours without blocking auto path) +
      holds long-lived state. SKIP LOCKED is the mechanism _inside_ it, not the reason it's split.
- [ ] 🟢 Name Ingest's 3 responsibilities (write fast-path / decided-consumer / stats-read) as
      a conscious tradeoff; keep them as separate internal modules so a future split is mechanical.
      One-liner ready: "the natural 5th service is a read model over `content.decided`; clean split
      point, millions of records away."
- [ ] 🟢 Separate policy-**application** (in Classification, hot path) from policy-**config**
      (CRUD; owner + propagation path, e.g. a `policy.updated` event Classification caches).
- [ ] 🟢 Note the liveness edge: an abandoned `needs_review` item with no human → no
      `content.decided` ever → customer webhook never fires. "Waits" can mean "waits forever."
      Acknowledge it (optional: default-decision-on-SLA-timeout in Out-of-Scope).
