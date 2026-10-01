# AI Usage Disclosure Log

## Workflow & Collaboration Model
Throughout this project, AI was used in a collaborative loop between two complementary tools:
1. **Claude (Free):** Used as a thinking partner and prompt engineer. I explained the requirements and logic of what I wanted to build; Claude evaluated my approach, highlighted flaws and edge cases (e.g. invalid status transitions, race condition test gaps, CORS requirements, missing offline app-shell caching), and drafted precise, well-structured prompts with explicit acceptance criteria.
2. **Antigravity CLI (`agy`):** Used as the terminal coding agent. I provided the prepared prompts to `agy`, which executed code edits, created tests, ran test suites (`pytest`, `npm test`), and validated builds (`npm run build`).

---

## Log by Development Phase

* **Phase 0 (Setup & Clarifications):** Used AI to generate the initial folder structure, `.gitignore`, and draft initial clarification questions for the assignment requirements. Code accepted as-is.
* **Phase 1 (SRS Preparation):** Used Claude to formulate the formal Software Requirements Specification (SRS v1.0 and v1.1) incorporating the assumptions and clarification answers.
* **Phase 2 (Design Document):** Used Claude to generate `docs/DESIGN.md` detailing the system architecture, state machine, local Dexie database schemas, REST API endpoints, and test priorities.
* **Phase 3 (Backend Implementation):** Formulated backend tasks and refined prompts with Claude. Ran `agy` to generate the pure state machine (`backend/app/workflow.py`), SQLAlchemy models, Pydantic schemas, idempotent PUT sync service, transition endpoint with audit event logging, query endpoints, demonstration data seeder (`app/seed.py`), and 160+ unit/integration tests.
* **Phase 4 (Frontend Implementation):** Reviewed local-first data flow with Claude and structured task prompts for `agy`. Built Vite/React/TypeScript scaffolding, Dexie IndexedDB schemas, headless sync engine (`frontend/src/syncEngine.ts`), local report form, report list, detail view with history, sync status badges, and Vitest test suite.
* **Phase 5 (Manual QA & Bug Fixing):** Conducted manual QA checklist in the browser. Used Claude to analyze browser errors (CORS preflight failures on `PUT /reports/{id}` and offline app reload `ERR_INTERNET_DISCONNECTED`). Prepared prompts for `agy` to add FastAPI CORS middleware, improve coordinator error feedback, and configure Vite PWA plugin with Workbox caching so the app shell loads offline.
* **Phase 6 (Code Review, Hardening & Traceability):** Used Claude to perform a strict compliance audit against SRS v1.1 and DESIGN.md. Claude flagged:
  - An invalid "Reopen" action in CoordinatorView on terminal Resolved status (fixed by removing it and adding client transition unit tests).
  - An untested race recovery branch in `test_sync_idempotency.py` (rewritten with side-effect mocking to trigger the true `IntegrityError` rollback path).
  - Weak test assertions in validation tests (rewritten to assert timezone awareness and parametrize the 5-minute future tolerance boundary).
  - Field workers unable to resume and edit drafts after saving (implemented draft editing and continuation workflow in `ReportForm.tsx` and `store.ts`).
  - Traceability table verification references in `docs/SRS.md` and synchronization edge cases / limitations in `README.md`.
  All fixes were implemented and verified through `agy`.

---

## Decisions: Accepted, Changed, Rejected

* **Accepted:** Pure state machine without I/O; Dexie-based transactional local store; UUIDs doubling as idempotency keys; headless sync engine with single-flight locking and exponential backoff; Vite PWA Workbox precaching for the offline app shell.
* **Changed:** Refined prompts to enforce strict boundary assertions instead of generic truthiness; simplified overly verbose test files; enhanced draft workflow to allow workers to edit and update saved drafts prior to submission.
* **Rejected:** Rejected the coordinator "Reopen" action (Resolved -> In Progress) proposed in early UI drafts to strictly enforce terminal states per SRS 4.1.
