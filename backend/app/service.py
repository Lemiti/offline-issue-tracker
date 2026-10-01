"""Service layer handling idempotent report synchronization and history management.

Implements requirements from SRS FR-SYN-5, FR-HIS-1..5, FR-WFL-1..6 and DESIGN sections 3.1, 4, 5, 6.3.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Report, ReportEvent
from app.schemas import ReportPutRequest, TransitionRequest
from app.workflow import Role, Status, WorkflowErrorCode, validate_transition


class IdContentMismatchException(Exception):
    """Raised when PUT /reports/{id} is received for an existing ID with differing content."""

    def __init__(
        self,
        message: str = "A report with this ID already exists with different content.",
    ):
        self.message = message
        super().__init__(self.message)


class ReportNotFoundException(Exception):
    """Raised when a requested report ID does not exist."""

    def __init__(self, message: str = "Report not found."):
        self.message = message
        super().__init__(self.message)


class ForbiddenRoleException(Exception):
    """Raised when a role is unauthorized for an action."""

    def __init__(self, message: str = "Role is not authorized for this operation."):
        self.message = message
        super().__init__(self.message)


class ReasonRequiredException(Exception):
    """Raised when a transition requires a reason that was not provided."""

    def __init__(self, message: str = "A non-empty reason is required for this transition."):
        self.message = message
        super().__init__(self.message)


class StaleStatusException(Exception):
    """Raised when the expected status does not match current database status."""

    def __init__(self, message: str = "Report status has changed."):
        self.message = message
        super().__init__(self.message)


class InvalidTransitionException(Exception):
    """Raised when a requested transition is not permitted by workflow rules."""

    def __init__(self, message: str = "Invalid status transition."):
        self.message = message
        super().__init__(self.message)


def _parse_to_utc_timestamp(val: str | datetime | None) -> float | None:
    if val is None:
        return None
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        dt = val

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def _has_identical_content(report: Report, payload: ReportPutRequest) -> bool:
    """Compare content fields between an existing report and a new delivery payload."""
    cat_val = payload.category.value if hasattr(payload.category, "value") else str(payload.category)
    prio_val = payload.priority.value if hasattr(payload.priority, "value") else str(payload.priority)
    status_val = Status.SUBMITTED.value

    if report.category != cat_val:
        return False
    if report.description != payload.description:
        return False
    if report.location_text != payload.location_text:
        return False
    if report.latitude != payload.latitude:
        return False
    if report.longitude != payload.longitude:
        return False
    if report.priority != prio_val:
        return False
    if report.status != status_val:
        return False
    if report.reporter_name != payload.reporter_name:
        return False

    t_report = _parse_to_utc_timestamp(report.reported_at)
    t_payload = _parse_to_utc_timestamp(payload.reported_at)
    if t_report is not None and t_payload is not None:
        # Allow sub-second precision differences if timestamps match within 1s
        if abs(t_report - t_payload) > 1.0:
            return False
    elif report.reported_at != str(payload.reported_at):
        return False

    return True


def sync_report(
    db: Session,
    report_id: str,
    payload: ReportPutRequest,
) -> tuple[int, Report]:
    """Idempotently process delivery of a submitted report with client events.

    Rules:
    1. Unknown id: insert report, client events (ignoring duplicates), add server
       synchronized event, commit, return (201, report).
    2. Existing id with identical content: make no changes, return (200, existing_report).
    3. Existing id with different content: raise IdContentMismatchException (HTTP 409).
    4. Concurrent duplicate insert: catch IntegrityError on commit, re-read and handle as case 2.
    """
    existing = db.execute(select(Report).where(Report.id == report_id)).scalar_one_or_none()

    if existing is not None:
        if _has_identical_content(existing, payload):
            return 200, existing
        raise IdContentMismatchException(
            f"Report '{report_id}' already exists with different content."
        )

    # Prepare new report record
    now_utc = datetime.now(timezone.utc).isoformat()
    reported_str = (
        payload.reported_at
        if isinstance(payload.reported_at, str)
        else payload.reported_at.isoformat()
    )
    cat_str = payload.category.value if hasattr(payload.category, "value") else str(payload.category)
    prio_str = payload.priority.value if hasattr(payload.priority, "value") else str(payload.priority)

    new_report = Report(
        id=report_id,
        category=cat_str,
        description=payload.description,
        location_text=payload.location_text,
        latitude=payload.latitude,
        longitude=payload.longitude,
        priority=prio_str,
        status=Status.SUBMITTED.value,
        reporter_name=payload.reporter_name,
        reported_at=reported_str,
        received_at=now_utc,
        updated_at=now_utc,
    )
    db.add(new_report)

    # Insert client events, ignoring existing event IDs (deduplication)
    for ce in payload.client_events:
        existing_ev = db.execute(
            select(ReportEvent).where(ReportEvent.id == ce.id)
        ).scalar_one_or_none()
        if existing_ev is None:
            occ_str = ce.occurred_at if isinstance(ce.occurred_at, str) else ce.occurred_at.isoformat()
            db.add(
                ReportEvent(
                    id=ce.id,
                    report_id=report_id,
                    type=ce.type,
                    actor_role=ce.actor_role,
                    occurred_at=occ_str,
                    recorded_at=now_utc,
                    details=ce.details,
                )
            )

    # Append server-generated synchronized event
    server_sync_event = ReportEvent(
        id=str(uuid.uuid4()),
        report_id=report_id,
        type="synchronized",
        actor_role="system",
        occurred_at=now_utc,
        recorded_at=now_utc,
        details={"message": "Report successfully synchronized with central record"},
    )
    db.add(server_sync_event)

    try:
        db.flush()
        db.commit()
        db.refresh(new_report)
        return 201, new_report
    except IntegrityError:
        db.rollback()
        # Concurrent collision recovery (case 4): re-read and handle idempotently
        recovered = db.execute(select(Report).where(Report.id == report_id)).scalar_one_or_none()
        if recovered is not None:
            if _has_identical_content(recovered, payload):
                return 200, recovered
            raise IdContentMismatchException(
                f"Report '{report_id}' already exists with different content."
            )
        raise


def transition_report(
    db: Session,
    report_id: str,
    payload: TransitionRequest,
    role: str | None,
) -> Report:
    """Execute a status transition within a single database transaction.

    Enforces:
    1. Unknown ID -> 404
    2. Missing or unauthorized role -> 403
    3. Stale expected_status -> 409 STALE_STATUS
    4. Workflow transition rules (via app/workflow.py):
       - Wrong role -> 403 FORBIDDEN_ROLE
       - Missing reason -> 422 REASON_REQUIRED
       - Invalid transition -> write 'transition_rejected' event, commit, return 409 INVALID_TRANSITION
       - Success -> update report status and updated_at, write 'status_changed' event, commit, return report
    """
    report = db.execute(select(Report).where(Report.id == report_id)).scalar_one_or_none()
    if report is None:
        raise ReportNotFoundException(f"Report '{report_id}' was not found.")

    if not role or role not in [r.value for r in Role]:
        raise ForbiddenRoleException(
            f"Role '{role}' is not valid. Must be 'field_worker' or 'coordinator'."
        )

    # Check stale status
    exp_status = (
        payload.expected_status.value
        if hasattr(payload.expected_status, "value")
        else str(payload.expected_status)
    )
    if report.status != exp_status:
        raise StaleStatusException(
            f"Report status has changed. Expected '{exp_status}', but current status is '{report.status}'."
        )

    target_status = (
        payload.to.value if hasattr(payload.to, "value") else str(payload.to)
    )

    result = validate_transition(
        current_status=report.status,
        target_status=target_status,
        role=role,
        reason=payload.reason,
    )

    now_utc = datetime.now(timezone.utc).isoformat()

    if not result.success:
        if result.error_code == WorkflowErrorCode.FORBIDDEN_ROLE:
            raise ForbiddenRoleException(
                result.message or f"Role '{role}' is forbidden from performing this transition."
            )
        if result.error_code == WorkflowErrorCode.REASON_REQUIRED:
            raise ReasonRequiredException(
                result.message or "A reason is required to reject this report."
            )
        if result.error_code == WorkflowErrorCode.INVALID_TRANSITION:
            # Leave report unchanged, but write a transition_rejected event and commit it (FR-WFL-3)
            rejected_event = ReportEvent(
                id=str(uuid.uuid4()),
                report_id=report_id,
                type="transition_rejected",
                actor_role=role,
                occurred_at=now_utc,
                recorded_at=now_utc,
                details={
                    "from": report.status,
                    "to": target_status,
                    "reason": payload.reason,
                    "role": role,
                    "error": result.message,
                },
            )
            db.add(rejected_event)
            db.commit()
            raise InvalidTransitionException(
                result.message
                or f"Transition from '{report.status}' to '{target_status}' is not permitted."
            )

    # On success: update status and updated_at, write status_changed event
    old_status = report.status
    report.status = target_status
    report.updated_at = now_utc

    event = ReportEvent(
        id=str(uuid.uuid4()),
        report_id=report_id,
        type="status_changed",
        actor_role=role,
        occurred_at=now_utc,
        recorded_at=now_utc,
        details={
            "from": old_status,
            "to": target_status,
            "reason": payload.reason,
            "role": role,
        },
    )
    db.add(event)
    db.commit()
    db.refresh(report)
    return report
