# Offline Field Issue Tracker

A small full-stack application for field workers to report infrastructure problems (broken water points, damaged equipment, service interruptions, safety concerns, maintenance needs) **even without connectivity**. Reports are saved on the device, synchronized safely when the connection returns, and reviewed and progressed by a coordinator.

- **Frontend:** React + Vite + TypeScript, IndexedDB (Dexie) for offline storage
- **Backend:** Python, FastAPI, SQLAlchemy, SQLite
- **Tests:** pytest (backend), Vitest (frontend)

> Documents: [Requirements (SRS)](docs/SRS.md) · [Design](docs/DESIGN.md)

---

## Contents
1. [Features](#features)
2. [Setup and run](#setup-and-run)
3. [Running the tests](#running-the-tests)
4. [Demonstration data](#demonstration-data)
5. [Architecture](#architecture)
6. [Synchronization strategy](#synchronization-strategy)
7. [Status workflow](#status-workflow)
8. [Assumptions and design decisions](#assumptions-and-design-decisions)
9. [Conflict handling if post-submission editing were added](#conflict-handling-if-post-submission-editing-were-added)
10. [Testing priorities](#testing-priorities)
11. [Manual QA checklist](#manual-qa-checklist)
12. [Known limitations](#known-limitations)
13. [Time spent and future improvements](#time-spent-and-future-improvements)
14. [AI and development-tool disclosure](#ai-and-development-tool-disclosure)

---

## Features

- Create reports: category, description, location (free text, optional coordinates), priority, status, date/time reported
- Works offline: reports persist across refresh and restart and are clearly marked **not synchronized**
- Safe synchronization: sync states **Pending / Synchronized / Failed**, automatic retry with backoff, manual "Sync now", and no duplicate server records on retry
- Status workflow: Draft → Submitted → Assigned → In Progress → Resolved, plus Rejected, with server-enforced transitions
- Report list and detail views with filters, priority, status, and sync state
- Full history per report: creation, synchronization, status changes, rejected transitions, failures
- Simulated roles: Field Worker and Coordinator (no authentication)

---

## Setup and run

**Prerequisites:** Python 3.11+, Node.js 20+, npm.

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed               # optional: load demonstration data
uvicorn app.main:app --reload    # http://localhost:8000  (API docs at /docs)
```

### Frontend
```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173 for development
```

For the **offline refresh and app-shell caching demo**, build and preview the production PWA:
```bash
cd frontend
npm run build && npm run preview # http://localhost:4173
```
Load the app once while online to register the service worker and precache the application shell, then set browser DevTools → Network → select **Offline**, and refresh the page.

The frontend expects the API at `http://localhost:8000`. Override with `VITE_API_URL` in `frontend/.env` (see `frontend/.env.example`).

<!-- TODO: verify every command above on a fresh clone before submitting. -->

---

## Running the tests

```bash
# backend
cd backend && source .venv/bin/activate && pytest

# frontend
cd frontend && npm test
```

---

## Demonstration data

`python -m app.seed` loads sample reports covering every category, priority, and status (including Rejected and Resolved examples with history). Running it twice does not create duplicates.

To demonstrate offline behaviour, open the frontend, switch to the Field Worker role, open browser DevTools → Network → select **Offline**, and create a report.

---

## Architecture

```
Browser (field worker)                          Server
 React UI ─► Local store (IndexedDB)             FastAPI routes
                ▲                                  │
 Sync engine ───┴── HTTP ─────────────────────►  Workflow rules + validation
 (queue, retry, backoff)                           │
                                                 SQLite (reports, report_events)
Browser (coordinator): React UI ─► API (online only)
```

Principles:
- **Local first.** Saving never waits for the network. The device copy is the source of truth until the server confirms receipt.
- **Server is authoritative for rules.** Validation and status transitions are enforced on the server; the client repeats validation only for fast feedback.
- **Pure domain logic.** The status workflow is a pure module with no I/O, so it can be tested exhaustively.

Full details (data model, API, sequence diagrams): [docs/DESIGN.md](docs/DESIGN.md).

---

## Synchronization strategy

1. A report's id is a UUID generated on the device. It doubles as the idempotency key.
2. The sync engine sends submitted, pending reports with `PUT /reports/{id}`, together with any history events recorded offline.
3. The server inserts the report if the id is new (201). If the id already exists with identical content it changes nothing and returns the stored report (200). If it exists with different content, it returns 409.
4. The device marks a report **Synchronized** only after a 200/201 response, in a single local transaction. Until then the local copy is untouched.
5. Failure handling:
   - Network error, timeout, or 5xx: stays **Pending**, retried with exponential backoff and jitter.
   - 422 validation error: marked **Failed** with the reason, not retried automatically; the user can fix and retry.
6. **Interrupted sync:** nothing is stored as "in progress", so a crash or closed tab leaves reports Pending and they are resent. The idempotent `PUT` makes resending safe, including when the server saved the report but the response was lost.
7. Syncing is single-flight so repeated triggers (online event, timer, button) cannot overlap.
8. History events carry their own UUIDs, so a retry cannot duplicate history.

If the server commits a report but the browser closes before the local update, the report stays Pending, and the retry returns 200 with the stored record, so there is no loss and no duplicate.

---

## Status workflow

| From | To | Who | Reason |
|---|---|---|---|
| Draft | Submitted | Field worker | – |
| Submitted | Assigned | Coordinator | – |
| Submitted | Rejected | Coordinator | Required |
| Assigned | In Progress | Coordinator | – |
| Assigned | Rejected | Coordinator | Required |
| In Progress | Resolved | Coordinator | – |

Resolved and Rejected are terminal. Any other transition returns `409 INVALID_TRANSITION`, leaves the report unchanged, shows a clear message, and is recorded in the report's history. A wrong role returns 403. Two coordinators acting on the same report: the second receives `409 STALE_STATUS` and the UI refreshes.

---

## Assumptions and design decisions

The brief left several points open. The instructor answered the first clarification round; remaining choices are documented here and in [docs/SRS.md](docs/SRS.md) section 2.4.

| Topic | Decision |
|---|---|
| Duplicates | Mandatory: retrying the same locally created report never creates a second record. Detecting similar reports from different workers is not implemented (optional per instructor). |
| Editing | A field worker can edit only a local Draft. Submitted reports are read-only for them. Coordinators change status only. |
| Reopening | Not supported; Resolved and Rejected are terminal. |
| Drafts | Local to the device; the server only receives Submitted reports. |
| Coordinators | Online only. |
| Location | Validated free text; coordinates optional and entered manually; no GPS access required. |
| Deletion | Reports are never deleted; mistaken reports are Rejected. |
| Roles | Simulated through an `X-Role` header chosen in the UI. This is **not** a security mechanism. |
| Timestamps | Stored in UTC; `reported_at` is device time. |
| Invalid input | Validated on client and server; server errors list every field problem. |
| Data safety | Local data is never removed until the server confirms receipt; history is append-only. |

---

## Conflict handling if post-submission editing were added

Not needed in the current scope because submitted reports are read-only for field workers. If editing were allowed later:
- Add an integer `version` to each report, incremented on every change and returned in every response.
- Edits send the version they were based on; the server applies them only if it matches (compare-on-write), otherwise returns `409` with the current server version.
- The client would keep the local edit in a **conflict** state and show both versions side by side, letting the user keep theirs (re-applied on top of the new version), accept the server's, or merge per field.
- Silent last-write-wins would be avoided because it loses data.

---

## Testing priorities

Priorities follow risk: data loss and duplicates first, then business rules, then presentation.

1. **Sync safety:** same report sent twice yields one record; server saves but the response is lost and the retry succeeds without a duplicate; network errors keep reports pending with data intact; reports persist after a simulated reload.
2. **Workflow rules:** every valid transition passes and every invalid one is refused and logged; role and stale-status checks.
3. **Validation:** bad input is rejected with field-level messages, and a 422 makes a report Failed without automatic retry.
4. **History:** events are recorded for each action and are not duplicated by retries.

UI rendering is verified through the manual checklist rather than heavy UI tests, to keep the suite small and meaningful.

---

## Manual QA checklist

**Offline creation**
- [ ] With DevTools set to Offline, create a report as Field Worker; it appears in the list marked *not synchronized / Pending*
- [ ] Refresh the page while offline; the report is still there
- [ ] Close and reopen the tab; the report is still there

**Synchronization**
- [ ] Go back online; the report syncs automatically and changes to *Synchronized*
- [ ] Create several offline reports, reconnect, and confirm each appears exactly once on the server
- [ ] Stop the backend, submit a report, and confirm it stays Pending; restart the backend and confirm it syncs
- [ ] Stop the backend *during* a sync and restart it; confirm no duplicate and no lost report
- [ ] Press **Sync now** repeatedly; confirm no duplicates
- [ ] Submit a report that the server rejects (for example, edit the stored data to be invalid); confirm it shows *Failed* with a readable reason

**Validation**
- [ ] Empty description, too-short description, missing location, and invalid coordinates are each refused with a clear message
- [ ] Reported date in the future is refused

**Workflow (Coordinator)**
- [ ] Walk one report through Submitted → Assigned → In Progress → Resolved
- [ ] Reject a report; a reason is required
- [ ] Confirm Resolved and Rejected reports offer no further transitions
- [ ] Attempt an invalid transition (for example via the API docs page); confirm a 409 and a history entry
- [ ] Coordinator actions are disabled with an explanation while offline

**Viewing and history**
- [ ] List shows category, priority, status, location, and sync state, and filters work
- [ ] Detail view shows all fields and a time-ordered history with creation, sync, status changes, and failures
- [ ] Status, priority, and sync state are distinguishable without relying on colour alone

**Setup**
- [ ] Fresh clone: follow this README, run seed, run both test suites, all pass

---

## Known limitations

- Roles are simulated; there is no authentication or authorisation. Anyone can call the API as a coordinator.
- No attachments or photos, no push notifications, no deployment configuration.
- SQLite and no migrations framework; suitable for the exercise, not for production scale.
- Offline support covers field-worker creation and viewing; coordinators need connectivity.
- Similar-report detection across devices is not implemented.
- The app shell loads offline only after one online visit and only in the production build (`npm run demo`), not `npm run dev`.
- Multiple devices sharing one worker identity are not modelled.
- Clock differences between a device and the server can affect `reported_at` plausibility checks (a small tolerance is applied).
- Browser connectivity signals are unreliable, so the app relies on real request outcomes.

---

## Time spent and future improvements

**Approximate time spent:** about 7 hours 20 minutes total (about 6.5 hours active working time, excluding two break sessions of ~20 min and ~25 min):
- Requirements analysis & design (Phases 0–2): ~1.5 hours
- Backend implementation & testing (Phase 3): ~1.5 hours
- Frontend implementation & testing (Phase 4): ~40 minutes
- Manual QA, offline debugging & CORS fix (Phase 5): ~1 hour 20 minutes
- Code audit, bug fixes, hardening & documentation (Phase 6): ~1 hour 25 minutes

**With more time:**
- Real authentication and per-role authorisation
- Post-submission editing with version-based conflict resolution (see above)
- Similar-report detection for different workers
- End-to-end browser tests (Playwright) for the offline scenarios
- Full offline sync queue for coordinator role
- Migrations (Alembic) and a production database
- Photo attachments and device GPS capture
- Pagination and search

---

## AI and development-tool disclosure

> Fill this in from your own AI-usage log. Be specific and truthful; reviewers evaluate honesty and understanding, not the absence of AI.

**Tools used:** Claude (free), Antigravity CLI (`agy`) powered by Gemini

**What I used them for**
- Requirements analysis, drafting the SRS and design document: Used Claude to analyze the assignment prompt, formulate clarification questions, draft the formal SRS (v1.0 and v1.1), and create the system design document based on the requirements.
- Code generation with a terminal agent: Used Antigravity CLI (`agy`) as an interactive coding assistant. For each component (workflow state machine, database models, idempotent sync service, API endpoints, Dexie local store, headless sync engine, React UI components, and PWA configuration), I explained what I wanted to Claude, which evaluated my logic, suggested improvements/fixes, and prepared structured prompts. I then fed those prompts into `agy` to generate code and tests.
- Test ideas and code review: Used Claude to evaluate implementation logic and identify gaps (e.g. invalid status transitions permitted in the UI, race-condition tests that never executed the catch block, weak test assertions, and inability for field workers to resume saved drafts). Then used `agy` to implement the fixes and write comprehensive test cases.

**What I accepted, changed, and rejected**
- Accepted: The pure workflow state machine architecture (`backend/app/workflow.py`), the idempotent upsert logic with unique-constraint fallback handling, the headless sync engine structure with single-flight execution and exponential backoff, and Dexie IndexedDB schemas.
- Changed: Refined prompts from Claude to strictly enforce boundary assertions instead of generic truthiness; modified the test suite to keep it modular and maintainable; updated draft management to allow workers to edit and update saved drafts prior to submission.
- Rejected: Rejected coordinator "Reopen" action proposed in early UI drafts (since Resolved and Rejected are terminal states per SRS); rejected any soft-delete or multi-device sync logic as out of scope; rejected complex mock IndexedDB setups in favor of clean `fake-indexeddb` tests.

**How I verified generated code**
- Read every diff before committing; ran the automated tests (`pytest` for backend, `vitest` for frontend); walked through the manual QA checklist in both online and offline network states; tested lost-response and idempotent retry scenarios; verified production build (`npm run build`) and preview (`npm run demo`).

I understand and take responsibility for all submitted code.
