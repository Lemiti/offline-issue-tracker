"""Demonstration and sample data seeder.

Implements SRS section 3.8 (FR-DEM-1).
Covers every category, priority, and status with realistic history events.
Uses deterministic UUIDs for idempotency (running multiple times will not duplicate).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.models import Report, ReportEvent
from app.schemas import Category, Priority
from app.workflow import Role, Status

BASE_TIME = datetime(2026, 9, 25, 8, 0, 0, tzinfo=timezone.utc)

SEED_REPORTS: list[dict[str, Any]] = [
    {
        "id": "10000000-0000-0000-0000-000000000001",
        "category": Category.WATER_POINT.value,
        "description": "Submersible pump motor failed at borehole #3. Approximately 450 households currently without potable water.",
        "location_text": "Sector 4 North, adjacent to community market",
        "latitude": -1.286389,
        "longitude": 36.817223,
        "priority": Priority.CRITICAL.value,
        "status": Status.IN_PROGRESS.value,
        "reporter_name": "Amina Mwangi",
        "reported_at": (BASE_TIME + timedelta(hours=1)).isoformat(),
        "received_at": (BASE_TIME + timedelta(hours=1, minutes=2)).isoformat(),
        "updated_at": (BASE_TIME + timedelta(hours=5)).isoformat(),
        "events": [
            {
                "id": "20000000-0000-0000-0000-000000000001",
                "type": "created",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=1)).isoformat(),
                "details": {"action": "draft_created"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000002",
                "type": "submitted",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=1, minutes=1)).isoformat(),
                "details": {"action": "submitted"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000003",
                "type": "synchronized",
                "actor_role": "system",
                "occurred_at": (BASE_TIME + timedelta(hours=1, minutes=2)).isoformat(),
                "details": {"message": "Report synchronized with central record"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000004",
                "type": "status_changed",
                "actor_role": Role.COORDINATOR.value,
                "occurred_at": (BASE_TIME + timedelta(hours=2)).isoformat(),
                "details": {"from": "Submitted", "to": "Assigned", "reason": "Assigned to Water Rapid Response Team"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000005",
                "type": "status_changed",
                "actor_role": Role.COORDINATOR.value,
                "occurred_at": (BASE_TIME + timedelta(hours=5)).isoformat(),
                "details": {"from": "Assigned", "to": "In Progress", "reason": "Technicians on site with replacement motor"},
            },
        ],
    },
    {
        "id": "10000000-0000-0000-0000-000000000002",
        "category": Category.EQUIPMENT_DAMAGE.value,
        "description": "Solar power inverter enclosure cracked by heavy tree branch. Internal wiring exposed to rainfall.",
        "location_text": "Sub-county Health Dispensary Solar Array",
        "latitude": -1.292066,
        "longitude": 36.821946,
        "priority": Priority.HIGH.value,
        "status": Status.ASSIGNED.value,
        "reporter_name": "David Ochieng",
        "reported_at": (BASE_TIME + timedelta(hours=2)).isoformat(),
        "received_at": (BASE_TIME + timedelta(hours=2, minutes=5)).isoformat(),
        "updated_at": (BASE_TIME + timedelta(hours=4)).isoformat(),
        "events": [
            {
                "id": "20000000-0000-0000-0000-000000000006",
                "type": "created",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=2)).isoformat(),
                "details": {"action": "draft_created"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000007",
                "type": "submitted",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=2, minutes=1)).isoformat(),
                "details": {"action": "submitted"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000008",
                "type": "synchronized",
                "actor_role": "system",
                "occurred_at": (BASE_TIME + timedelta(hours=2, minutes=5)).isoformat(),
                "details": {"message": "Report synchronized with central record"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000009",
                "type": "status_changed",
                "actor_role": Role.COORDINATOR.value,
                "occurred_at": (BASE_TIME + timedelta(hours=4)).isoformat(),
                "details": {"from": "Submitted", "to": "Assigned", "reason": "Assigned to Electrical Engineering Unit"},
            },
        ],
    },
    {
        "id": "10000000-0000-0000-0000-000000000003",
        "category": Category.SERVICE_INTERRUPTION.value,
        "description": "Secondary distribution main shut down due to flange leak. Pressure drop across southern village cluster.",
        "location_text": "Southern Feeder Pipeline, Valve Chamber 4",
        "latitude": -1.300123,
        "longitude": 36.789012,
        "priority": Priority.MEDIUM.value,
        "status": Status.RESOLVED.value,
        "reporter_name": "Grace Wanjiku",
        "reported_at": (BASE_TIME + timedelta(hours=3)).isoformat(),
        "received_at": (BASE_TIME + timedelta(hours=3, minutes=10)).isoformat(),
        "updated_at": (BASE_TIME + timedelta(hours=10)).isoformat(),
        "events": [
            {
                "id": "20000000-0000-0000-0000-000000000010",
                "type": "created",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=3)).isoformat(),
                "details": {"action": "draft_created"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000011",
                "type": "submitted",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=3, minutes=2)).isoformat(),
                "details": {"action": "submitted"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000012",
                "type": "synchronized",
                "actor_role": "system",
                "occurred_at": (BASE_TIME + timedelta(hours=3, minutes=10)).isoformat(),
                "details": {"message": "Report synchronized with central record"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000013",
                "type": "status_changed",
                "actor_role": Role.COORDINATOR.value,
                "occurred_at": (BASE_TIME + timedelta(hours=5)).isoformat(),
                "details": {"from": "Submitted", "to": "Assigned", "reason": "Assigned to Plumbing Crew 2"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000014",
                "type": "status_changed",
                "actor_role": Role.COORDINATOR.value,
                "occurred_at": (BASE_TIME + timedelta(hours=7)).isoformat(),
                "details": {"from": "Assigned", "to": "In Progress", "reason": "Excavation and gasket replacement in progress"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000015",
                "type": "status_changed",
                "actor_role": Role.COORDINATOR.value,
                "occurred_at": (BASE_TIME + timedelta(hours=10)).isoformat(),
                "details": {"from": "In Progress", "to": "Resolved", "reason": "Gasket replaced and line pressure tested successfully"},
            },
        ],
    },
    {
        "id": "10000000-0000-0000-0000-000000000004",
        "category": Category.SAFETY_CONCERN.value,
        "description": "Uncovered drainage culvert partially collapsed near primary school pedestrian crossing.",
        "location_text": "Olympic Primary School gate, Mau Mau Road",
        "latitude": -1.275432,
        "longitude": 36.804321,
        "priority": Priority.CRITICAL.value,
        "status": Status.SUBMITTED.value,
        "reporter_name": "Samuel Kiprop",
        "reported_at": (BASE_TIME + timedelta(hours=4)).isoformat(),
        "received_at": (BASE_TIME + timedelta(hours=4, minutes=1)).isoformat(),
        "updated_at": (BASE_TIME + timedelta(hours=4, minutes=1)).isoformat(),
        "events": [
            {
                "id": "20000000-0000-0000-0000-000000000016",
                "type": "created",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=4)).isoformat(),
                "details": {"action": "draft_created"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000017",
                "type": "submitted",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=4, minutes=1)).isoformat(),
                "details": {"action": "submitted"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000018",
                "type": "synchronized",
                "actor_role": "system",
                "occurred_at": (BASE_TIME + timedelta(hours=4, minutes=1)).isoformat(),
                "details": {"message": "Report synchronized with central record"},
            },
        ],
    },
    {
        "id": "10000000-0000-0000-0000-000000000005",
        "category": Category.MAINTENANCE.value,
        "description": "Routine request for park bench varnish and swing chain lubrication.",
        "location_text": "Township Public Recreation Field",
        "latitude": -1.288888,
        "longitude": 36.811111,
        "priority": Priority.LOW.value,
        "status": Status.REJECTED.value,
        "reporter_name": "Faith Chebet",
        "reported_at": (BASE_TIME + timedelta(hours=5)).isoformat(),
        "received_at": (BASE_TIME + timedelta(hours=5, minutes=3)).isoformat(),
        "updated_at": (BASE_TIME + timedelta(hours=6)).isoformat(),
        "events": [
            {
                "id": "20000000-0000-0000-0000-000000000019",
                "type": "created",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=5)).isoformat(),
                "details": {"action": "draft_created"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000020",
                "type": "submitted",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=5, minutes=1)).isoformat(),
                "details": {"action": "submitted"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000021",
                "type": "synchronized",
                "actor_role": "system",
                "occurred_at": (BASE_TIME + timedelta(hours=5, minutes=3)).isoformat(),
                "details": {"message": "Report synchronized with central record"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000022",
                "type": "status_changed",
                "actor_role": Role.COORDINATOR.value,
                "occurred_at": (BASE_TIME + timedelta(hours=6)).isoformat(),
                "details": {
                    "from": "Submitted",
                    "to": "Rejected",
                    "reason": "Not an essential utility issue; referred to municipal parks team.",
                },
            },
        ],
    },
    {
        "id": "10000000-0000-0000-0000-000000000006",
        "category": Category.MAINTENANCE.value,
        "description": "Perimeter security fence broken and gate lock rusted shut at water reservoir.",
        "location_text": "Highland Reservoir Perimeter, Gate 2",
        "latitude": None,
        "longitude": None,
        "priority": Priority.HIGH.value,
        "status": Status.ASSIGNED.value,
        "reporter_name": "Peter Kamau",
        "reported_at": (BASE_TIME + timedelta(hours=6)).isoformat(),
        "received_at": (BASE_TIME + timedelta(hours=6, minutes=4)).isoformat(),
        "updated_at": (BASE_TIME + timedelta(hours=8)).isoformat(),
        "events": [
            {
                "id": "20000000-0000-0000-0000-000000000023",
                "type": "created",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=6)).isoformat(),
                "details": {"action": "draft_created"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000024",
                "type": "submitted",
                "actor_role": Role.FIELD_WORKER.value,
                "occurred_at": (BASE_TIME + timedelta(hours=6, minutes=2)).isoformat(),
                "details": {"action": "submitted"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000025",
                "type": "synchronized",
                "actor_role": "system",
                "occurred_at": (BASE_TIME + timedelta(hours=6, minutes=4)).isoformat(),
                "details": {"message": "Report synchronized with central record"},
            },
            {
                "id": "20000000-0000-0000-0000-000000000026",
                "type": "status_changed",
                "actor_role": Role.COORDINATOR.value,
                "occurred_at": (BASE_TIME + timedelta(hours=8)).isoformat(),
                "details": {"from": "Submitted", "to": "Assigned", "reason": "Assigned to Security Maintenance Unit"},
            },
        ],
    },
]


def seed_data(db: Session) -> int:
    """Idempotently seed demonstration reports and audit events into database."""
    seeded_reports_count = 0

    for rep_data in SEED_REPORTS:
        report_id = rep_data["id"]
        existing = db.execute(select(Report).where(Report.id == report_id)).scalar_one_or_none()

        if existing is None:
            report = Report(
                id=report_id,
                category=rep_data["category"],
                description=rep_data["description"],
                location_text=rep_data["location_text"],
                latitude=rep_data["latitude"],
                longitude=rep_data["longitude"],
                priority=rep_data["priority"],
                status=rep_data["status"],
                reporter_name=rep_data["reporter_name"],
                reported_at=rep_data["reported_at"],
                received_at=rep_data["received_at"],
                updated_at=rep_data["updated_at"],
            )
            db.add(report)
            seeded_reports_count += 1

        for ev_data in rep_data.get("events", []):
            event_id = ev_data["id"]
            existing_event = db.execute(
                select(ReportEvent).where(ReportEvent.id == event_id)
            ).scalar_one_or_none()

            if existing_event is None:
                event = ReportEvent(
                    id=event_id,
                    report_id=report_id,
                    type=ev_data["type"],
                    actor_role=ev_data["actor_role"],
                    occurred_at=ev_data["occurred_at"],
                    recorded_at=ev_data["occurred_at"],
                    details=ev_data["details"],
                )
                db.add(event)

    db.commit()
    return seeded_reports_count


def main() -> None:
    """CLI entrypoint for python -m app.seed."""
    init_db()
    with SessionLocal() as db:
        count = seed_data(db)
        total = db.query(Report).count()
        print(f"Seed complete. Inserted {count} new reports. Total reports in DB: {total}.")


if __name__ == "__main__":
    main()
