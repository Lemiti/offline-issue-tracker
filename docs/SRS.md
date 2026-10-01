# Software Requirements Specification
## Offline Field Issue Tracker

| | |
|---|---|
| **Version** | 1.1 |
| **Date** | October 1, 2026 |
| **Status** | Final for implementation |

> This document states **what** the system must do. How it is built (architecture, storage technology, protocols, data structures) is described separately in the README.

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the requirements for a small application that lets field workers report infrastructure problems (broken water points, damaged equipment, service interruptions, safety concerns, maintenance needs) even when connectivity is unreliable, and lets a coordinator review and update those reports.

### 1.2 Scope
The system lets field workers create and view reports without a network connection, ensures those reports are delivered to a central record once connectivity returns without loss or duplication, and lets coordinators manage each report through a defined status workflow with a complete history.

Out of scope: user authentication, push notifications, file or photo attachments, multi-language support, production deployment, device GPS access, reopening of closed reports, post-submission editing by field workers, and detection of similar reports submitted independently by different workers.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Report | A record of one infrastructure problem |
| Field Worker | A user who observes and reports problems |
| Coordinator | A user who reviews reports and manages their status |
| Offline | The device cannot reach the central record |
| Synchronization | Delivering locally saved reports to the central record |
| Sync state | One of **Pending**, **Synchronized**, **Failed** |
| Status | The workflow stage of a report: Draft, Submitted, Assigned, In Progress, Resolved, Rejected |
| History | The time-ordered log of events that happened to a report |

---

## 2. Overall Description

### 2.1 Users
- **Field Worker:** works in locations with poor connectivity; needs simple, fast reporting.
- **Coordinator:** works with reliable connectivity; needs a clear view of all reports and their state.

Roles are **simulated**: the user selects a role in the application. No login is required.

### 2.2 Operating environment
Current versions of Chrome, Firefox, and Safari, on desktop and mobile screens.

### 2.3 Constraints
- The application must remain usable with no connectivity.
- Authentication is not required.

### 2.4 Assumptions and decisions
The brief leaves several points open. The following decisions apply throughout this document.

| ID | Topic | Assumption |
|---|---|---|
| A-1 | Drafts | A Draft is private to its author and not visible to coordinators. A report becomes visible to coordinators once it is Submitted and synchronized. |
| A-2 | Duplicates | A retried delivery of the same locally created report must never create a second record, including when a delivery succeeded but the confirmation was lost and the report is sent again (mandatory). Detecting similar reports submitted independently by different workers is optional and out of scope. |
| A-3 | Conflicts | Because field workers cannot edit a report after it is submitted (A-4), local and server edit conflicts cannot arise in the required scope. How such conflicts would be detected and resolved if post-submission editing were added is explained in the README. |
| A-4 | Editing | A field worker may edit a report only while it is a local Draft. Once Submitted, it is read-only for the field worker. Coordinators change status only and do not edit report content. No re-review workflow exists. |
| A-5 | Resolved | Resolved is a terminal state. Reopening is not supported. |
| A-6 | Rejected | Rejected is a terminal state. A new report must be filed instead. |
| A-7 | Coordinator offline | Coordinator actions (status changes) require connectivity. Offline creation, persistence, retry, and synchronization are required for field workers only. |
| A-8 | Time | The reported date/time is the time the problem was recorded on the field worker's device. |
| A-9 | Deletion | Reports cannot be deleted. Mistaken reports are Rejected. |

---

## 3. Functional Requirements

### 3.1 Report creation (CRT)

| ID | Requirement |
|---|---|
| FR-CRT-1 | The system shall allow a field worker to create a report containing: category, description, location, priority, status, and date/time reported. |
| FR-CRT-2 | The category shall be one of: Water point, Equipment damage, Service interruption, Safety concern, Maintenance. |
| FR-CRT-3 | The priority shall be one of: Low, Medium, High, Critical. |
| FR-CRT-4 | The location shall be entered as validated free text and may additionally include coordinates (latitude and longitude) entered manually. |
| FR-CRT-5 | Coordinates shall be optional and device GPS access shall not be required; a report shall always be creatable with free-text location alone. |
| FR-CRT-6 | The system shall record the date/time reported automatically and shall allow the field worker to adjust it. |
| FR-CRT-7 | A new report shall start in Draft, and the field worker shall be able to submit it. |
| FR-CRT-8 | The system shall allow an optional reporter name. |

### 3.2 Validation (VAL)

| ID | Requirement |
|---|---|
| FR-VAL-1 | Category, description, location, and priority are mandatory; a report missing any of them shall be refused with a message naming the missing field. |
| FR-VAL-2 | The description shall be between 10 and 1,000 characters, and the location text shall be at most 200 characters. |
| FR-VAL-3 | Latitude, when given, shall be between -90 and 90, and longitude between -180 and 180. Coordinates must be given as a pair. |
| FR-VAL-4 | The date/time reported shall not be in the future. |
| FR-VAL-5 | Validation shall apply both when the report is entered and when it is received by the central record. A report refused by the central record shall be shown as Failed with the reason. |
| FR-VAL-6 | Error messages shall state what is wrong and how to fix it, in plain language. |

### 3.3 Offline operation (OFF)

| ID | Requirement |
|---|---|
| FR-OFF-1 | A field worker shall be able to create, edit (where permitted by A-4), and view reports with no connectivity. |
| FR-OFF-2 | Reports saved offline shall still be present after the page is refreshed or the application is closed and reopened. |
| FR-OFF-3 | The system shall show whether the device is currently online or offline. |
| FR-OFF-4 | A report not yet delivered to the central record shall be clearly marked as **not synchronized** wherever it is displayed. |
| FR-OFF-5 | Coordinator actions that need the central record shall be unavailable while offline, with a message explaining why. |

### 3.4 Synchronization (SYN)

| ID | Requirement |
|---|---|
| FR-SYN-1 | Every report shall show one sync state: Pending, Synchronized, or Failed. |
| FR-SYN-2 | Pending reports shall be delivered automatically when connectivity returns. |
| FR-SYN-3 | The user shall be able to start synchronization manually at any time. |
| FR-SYN-4 | The system shall retry failed deliveries caused by connectivity problems, and the user shall be able to retry Failed reports manually. |
| FR-SYN-5 | Retrying a delivery, including after an interrupted attempt, shall never create more than one central record for the same report. |
| FR-SYN-6 | A report shall not be removed from the device or have its data discarded until the central record has confirmed receipt. |
| FR-SYN-7 | A Failed report shall display the reason for failure and shall keep all of its data. |
| FR-SYN-8 | If synchronization is interrupted (connection lost, application closed), the affected reports shall remain Pending and shall be resent later. |
| FR-SYN-9 | Once a report has been submitted, the system shall prevent the field worker from editing it, so that the local and central versions cannot diverge through field-worker edits (see A-3, A-4). |
| FR-SYN-10 | Only one synchronization run shall operate at a time, so that repeated triggers do not produce duplicate or interleaved deliveries. |
| FR-SYN-11 | *Optional:* the system may flag reports that appear to be similar to existing reports for coordinator review (see A-2). |

### 3.5 Status workflow (WFL)

| ID | Requirement |
|---|---|
| FR-WFL-1 | The system shall support the statuses Draft, Submitted, Assigned, In Progress, Resolved, and Rejected. |
| FR-WFL-2 | Status changes shall be allowed only as listed in section 4.1. |
| FR-WFL-3 | An invalid status change shall be refused, the status shall remain unchanged, a clear message shall be shown, and the attempt shall be recorded in history. |
| FR-WFL-4 | Rejecting a report shall require a reason. |
| FR-WFL-5 | The user interface shall offer only the status changes that are currently valid for the user's role. |
| FR-WFL-6 | Two coordinators changing the same report at the same time shall not corrupt it: one change shall succeed and the other shall be told the report has changed. |

### 3.6 Viewing reports (VEW)

| ID | Requirement |
|---|---|
| FR-VEW-1 | The system shall list reports showing at least category, priority, status, sync state, location, and date/time reported. |
| FR-VEW-2 | The list shall include both pending (local) and submitted (synchronized) reports. |
| FR-VEW-3 | The user shall be able to open a report to see all of its fields, its sync state, and its history. |
| FR-VEW-4 | The user shall be able to filter the list by status, priority, category, and sync state. |
| FR-VEW-5 | A field worker shall see their own reports. A coordinator shall see all Submitted and later reports. |
| FR-VEW-6 | Priority, status, and sync state shall be visually distinguishable. They shall not rely on colour alone. |

### 3.7 History (HIS)

| ID | Requirement |
|---|---|
| FR-HIS-1 | The system shall record, for each report, the following events: creation, each synchronization attempt and its result, every status change, every refused status change, and every failure. |
| FR-HIS-2 | Each event shall record the time, the acting role, the event type, and relevant details (for a status change: previous status, new status, and reason if given). |
| FR-HIS-3 | History shall be shown in time order on the report detail view. |
| FR-HIS-4 | History entries shall not be editable or deletable by users. |
| FR-HIS-5 | History created while offline shall be retained and delivered with the report when synchronization succeeds. |

### 3.8 Demonstration data (DEM)

| ID | Requirement |
|---|---|
| FR-DEM-1 | The system shall provide demonstration data covering every category, priority, and status, so that reviewers can evaluate the application immediately. |

---

## 4. Business Rules

### 4.1 Status transitions

| From | To | Performed by | Reason required |
|---|---|---|---|
| Draft | Submitted | Field Worker | No |
| Submitted | Assigned | Coordinator | No |
| Submitted | Rejected | Coordinator | Yes |
| Assigned | In Progress | Coordinator | No |
| Assigned | Rejected | Coordinator | Yes |
| In Progress | Resolved | Coordinator | No |

All other transitions are invalid, including any transition out of Resolved or Rejected, skipping stages (for example Submitted to Resolved), and moving back to Draft.

### 4.2 Editing permissions

| Report status | Field Worker may edit content | Coordinator may edit content |
|---|---|---|
| Draft | Yes (author only) | Not visible (A-1) |
| Submitted, Assigned, In Progress, Resolved, Rejected | No (read-only) | No (status changes only) |

### 4.3 Data safety rules
- No report data shall be lost because of a refresh, a closed application, a lost connection, or a failed delivery.
- A failed or interrupted operation shall never leave a report in an undefined state.
- Reports are never deleted (A-9).

---

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | **Reliability:** The application shall remain usable when connectivity is absent, intermittent, or lost during an operation. |
| NFR-2 | **Data integrity:** Requirements FR-SYN-5, FR-SYN-6, and section 4.3 shall hold under repeated retries and interruptions. |
| NFR-3 | **Usability:** A field worker shall be able to create a report in under one minute with a small number of inputs. The layout shall work on small mobile screens. |
| NFR-4 | **Clarity:** The user shall always be able to tell whether a report is synchronized, and shall be told the reason when something fails. |
| NFR-5 | **Testability:** Each functional requirement shall be verifiable by an automated test or by an item in the manual QA checklist. |
| NFR-6 | **Compatibility:** The application shall work on the browsers listed in section 2.2. |
| NFR-7 | **Accessibility:** Text shall be legible, controls shall be usable by touch, and status shall not be conveyed by colour alone. |

---

## 6. Requirements Traceability

The Verification column is completed against the actual tests as they are written.

| Requirement group | Key requirements | Verification |
|---|---|---|
| Report creation and validation | FR-CRT-1 to 8, FR-VAL-1 to 6 | Automated tests (valid and invalid input); QA checklist |
| Offline operation | FR-OFF-1 to 5 | QA checklist (offline create, refresh, reopen); automated test of local persistence |
| Synchronization | FR-SYN-1 to 11 | Automated tests (success, retry, interruption, lost confirmation then retry with no duplicate, read-only after submit); QA checklist |
| Status workflow | FR-WFL-1 to 6, section 4.1 | Automated tests for every valid and invalid transition |
| Viewing | FR-VEW-1 to 6 | QA checklist |
| History | FR-HIS-1 to 5 | Automated tests (events created for each action); QA checklist |
| Demonstration data | FR-DEM-1 | QA checklist |

---

## 7. Clarifications Received

The instructor's clarification of the required scope is reflected throughout this document:

1. **Duplicates:** the mandatory rule concerns repeated delivery of the same locally created report, for example a delivery that succeeded but whose response was lost and is retried. Similar-report detection is optional (A-2).
2. **Conflicts and editing:** field workers may edit only local Drafts; submitted reports are read-only for them; no re-review workflow is required (A-3, A-4). The README explains how version conflicts would be handled if post-submission editing were added.
3. **Reopening:** Resolved and Rejected are terminal; reopening is not required (A-5, A-6).
4. **Coordinators:** may be online-only (A-7).
5. **Location:** validated free text is sufficient; coordinates are optional with a manual alternative; device GPS is not required (FR-CRT-4, FR-CRT-5).
6. **Priorities:** additional functionality is optional and must not take priority over correctness, testing, synchronization safety, and documentation.
