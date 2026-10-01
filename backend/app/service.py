"""Service layer handling idempotent report synchronization and history management.

Implements requirements from SRS FR-SYN-5, FR-HIS-1..5 and DESIGN sections 3.1, 5, 6.3.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Report, ReportEvent
from app.schemas import ReportPutRequest
from app.workflow import Status


class IdContentMismatchException(Exception):
    """Raised when PUT /reports/{id} is received for an existing ID with differing content."""

    def __init__(
        self,
        message: str = "A report with this ID already exists with different content.",
    ):
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
