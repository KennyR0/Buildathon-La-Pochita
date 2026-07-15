# Tasks: InvoiceGuard AI MVP

**Input**: Design documents from `specs/001-process-invoices/`

**Priority**: P0 is mandatory for the demo. P1 is attempted only after the complete P0 demo passes.

**Responsibility**: A = Frontend, B = Backend/extraction, C = Supabase/rules, TEAM = joint checkpoint.

Every task includes owner, dependencies, affected areas, completion criterion, and verification.
`[P]` means it can run concurrently with the other tasks that share its dependency boundary.

## Phase 1: Bootstrap and Shared Contract — P0

- [ ] T001 [P0] Owner TEAM; deps none; affected `package.json`, lockfile, `.env.example`, `README.md`; install Node.js 22, Next.js 16.1.x, React 19.2.4+, TypeScript 5, Vitest, `@supabase/supabase-js`, official `openai`, `pdfjs-dist`, and `@napi-rs/canvas`, expose documented `dev`, `build`, `test`, and `demo:seed` commands, and define server-only OpenAI/Supabase variables; done when the lockfile fixes the exact Next.js 16.1 patch and the single app starts; verify `corepack pnpm install --frozen-lockfile`, `corepack pnpm build`, and inspection that secrets are absent from client bundles.
- [ ] T002 [P0] Owner TEAM; deps none; affected `contracts/api.yaml`, `contracts/extractor.schema.json`, `src/lib/contracts/`; freeze JSON examples and types for the five-field OpenAI payload, adapter-added metadata, `InvoiceResult`, validation errors, duplicate reference, human decision, and audit events; strings vacías después de `trim` son inválidas, valores ausentes son `null`, y total debe ser decimal no negativo; done when A/B/C can work without changing field names; verify approved, partial, duplicate, and fallback examples against the schemas. **EARLY CONTRACT CHECKPOINT**.

## Phase 2: Three Parallel Foundations — P0

- [X] T003 [P] [P0] Owner C; deps T002; affected `supabase/migrations/`, `supabase/seed/`, `fixtures/`; create exactly four tables, non-unique normalized invoice index, duplicate reference, constraints, idempotent seed, three readable demo files, and a manifest mapping exact filename plus hash to each extraction fixture; done when supplier, `PO-DEMO-1500`, USD 1500 authorization, original duplicate, and deterministic fallback mappings exist; verify `corepack pnpm demo:seed` twice, query stable rows, match each known file, and reject an unknown file from fixture selection.
- [X] T004 [P] [P0] Owner B; deps T001,T002; affected `src/lib/extraction/`, `src/lib/contracts/`; define the server-only extractor interface independently of seed and Supabase, separating the five-field model payload from adapter-added `invalid_fields`, `extraction_source`, and `fallback_reason`; done when real and fixture implementations can satisfy one interface; verify mock complete, partial, malformed, and fallback results against the adapter contract.
- [ ] T005 [P] [P0] Owner A; deps T001,T002; affected `src/app/page.tsx`, `src/components/`; build the single upload/result/timeline screen against contract-compatible mock responses, including idle/loading/error states, five fields, validations, amounts, reasons, decision, partial-field correction, and justified review controls; done when approved, partial, review, and duplicate mocks render without frontend business rules; verify browser interactions and reload-state handling with mocks.
- [X] T006 [P] [P0] Owner C; deps T003; affected `src/lib/supabase/`, `src/lib/rules/`; implement server-only supplier/order queries, indexed duplicate lookup to the original/root invoice, decimal comparison, deterministic rule precedence, invoice persistence, chronological audit repository, and explicit query/write error results; done when every accepted attempt has its own row and timeline, while a Supabase failure cannot produce a business decision or partial incorrect records; verify rules, real read/write, duplicate root reference, forced query/write failures, no incorrect partial rows, and last audit event only when persistence remains available.
- [X] T007 [P] [P0] Owner B; deps T001,T004; affected `src/lib/extraction/`; implement OpenAI Responses API through official `openai`, `OPENAI_API_KEY`, and `OPENAI_VISION_MODEL` defaulting to `gpt-5.4`; accept an image or rasterize PDF pages as PNG with `pdfjs-dist` and `@napi-rs/canvas`, request only the five structured fields, and enrich them behind the adapter; done when T007 has no dependency on schema/seed implementation and processes image and PDF inputs; verify mocked OpenAI success, page-image input, partial structured output, malformed output, and API failure.

## Phase 3: First Vertical Slice and Minute-90 Gate — P0

- [X] T008 [P0] Owner B; deps T003,T004,T006,T007; affected `src/app/api/invoices/process/route.ts`, `src/lib/invoice-processing/`; integrate C's repository/rule contract into file validation, extraction, structural validation, queries, rules, decision persistence, and audit; translate any Supabase query/write failure to HTTP `503`, never return `APPROVED`, `REJECTED` or a completed/success response, and preserve no incorrect partial records; done when valid input produces persisted `APPROVED` and failures remain technical; verify image/PDF success, direct invoice/timeline evidence, forced query/write failures returning `503`, absence of false business state, and last event only when persistence is available.
- [ ] T009 [P0] Owner A+B; deps T005,T008; affected `src/app/page.tsx`, `src/components/`, invoice GET/timeline Route Handlers; replace mocks with the real process/result/timeline endpoints while preserving the frozen contract; done when the approved fixture shows extraction, validations, `APPROVED`, and a timeline that survives reload; verify the full browser flow and direct Supabase evidence.
- [ ] T010 [P0] Owner TEAM; deps T008,T009; affected running application, `README.md`, `quickstart.md`; **MINUTE-90 CHECKPOINT**: by minute 90, TEAM must run `corepack pnpm install --frozen-lockfile`, `corepack pnpm demo:seed`, `corepack pnpm test`, start with `corepack pnpm dev`, upload the approved image or PDF through real OpenAI extraction, and verify supplier/order queries, automatic `APPROVED`, an `invoices` row, required `audit_logs`, frontend decision, and persisted timeline after reload; done only when the entire vertical flow passes once. If it does not pass, TEAM immediately removes T016/T017 and all visual polish from execution and assigns A/B/C only to failed P0 steps until the gate passes.

## Phase 4: Mandatory Risk Paths — P0

- [ ] T011 [P] [P0] Owner A; deps T010; affected only `src/app/page.tsx`, `src/components/`; connect the review UI to frozen partial-correction, human-decision, mismatch, duplicate, and fallback response shapes without implementing rules or endpoints; done when missing fields can be corrected, justification is required, duplicate controls stay hidden, and all states/timelines render; verify frontend interactions using contract mocks while B and C work in separate files.
- [X] T012 [P] [P0] Owner B; deps T010; affected only extraction/orchestration and correction/human-decision Route Handlers; implement partial extraction and five-field reprocessing, exact-manifest fallback with `503 EXTRACTION_UNAVAILABLE` when no fixture matches, and justified manual-decision endpoint using C's persistence contract; done when blank justification fails, one valid resolution persists, and a second resolution returns `409` without altering original state or history; verify partial correction, complete fallback, unknown-file `503`, first resolution/reload, second resolution `409`, and unchanged prior invoice/audit data.
- [X] T013 [P] [P0] Owner C; deps T010; affected only `src/lib/rules/`, `src/lib/supabase/`, Supabase verification; complete persistence/rules for USD 2300 review, separate human decision/justification, and duplicate rejection referencing the original/root invoice; done when C's repository contract supports B's endpoints without touching Route Handlers or UI; verify amount mismatch, human persistence, duplicate precedence, both invoice rows, independent timelines, and immutable prior history.
- [ ] T014 [P0] Owner TEAM; deps T011,T012,T013; affected running application and `quickstart.md`; integrate A's UI, B's endpoints/extraction, and C's rules/persistence, then execute separately partial correction, amount mismatch plus human resolution, duplicate, complete-fixture fallback, and unknown-file extraction failure; done when all contracts agree; verify fallback audit without implying incompleteness, unknown-file `503 EXTRACTION_UNAVAILABLE`, second manual resolution `409`, and UI matching persisted state.

## Phase 5: Final Demo Gate — P0

- [ ] T015 [P0] Owner TEAM; deps T014; affected `quickstart.md`, available tests, running application; reset seed and run approved, amount mismatch with human resolution, and duplicate scenarios twice, including at least one real image/PDF extraction and persisted timelines; done when each finishes under two minutes, `corepack pnpm test` and `corepack pnpm build` pass, and direct Supabase evidence agrees with the UI; verify exactly the final gate in `quickstart.md`.

## Phase 6: Optional Only After P0 — P1

- [ ] T016 [P] [P1] Owner A; deps T015; affected `src/components/`; improve only loading/error readability without adding behavior; verify all three scenarios unchanged.
- [X] T017 [P] [P1] Owner B+C; deps T015; affected `tests/`; add only non-demo contract/rule regression cases; verify `corepack pnpm test` passes.

## Corrected Dependency Graph

```text
T001 + T002
  |-> T003 -> T006 --|
  |-> T004 -> T007 --|-> T008 -> T009 -> T010 minute-90 gate
  |-> T005 -----------|

T010 -> T011 (A) + T012 (B) + T013 (C) in parallel
T011 + T012 + T013 -> T014 TEAM integration -> T015 final gate
T015 -> optional T016 + T017
```

T007, the real extractor, depends only on bootstrap and its frozen interface; it is not blocked by
Supabase schema, seed, repositories, or frontend work. After T002, A, B, and C own separate areas.

## Scope Guard

Do not add authentication, roles, ERP, email, queues, microservices, bulk processing, product lines,
taxes, multiple currencies, supplier/order CRUD, admin panels, advanced reports, or Supabase Storage.
Fallback may replace extraction only; it never replaces rules, Supabase persistence, or audit.
