"""Tests for POST /reports/{id}/transition.

Covers:
- docs/DESIGN.md section 4, 5
- SRS FR-WFL-1 to 6
"""

from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models import Base, Report, ReportEvent


@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(test_db: Session):
    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def create_report(client: TestClient, report_id: str) -> str:
    payload = {
        "id": report_id,
        "category": "Water point",
        "description": "Borehole well is dry and needs technician inspection.",
        "location_text": "Block C well #3",
        "priority": "High",
        "status": "Submitted",
        "reported_at": datetime.now(timezone.utc).isoformat(),
    }
    res = client.put(f"/reports/{report_id}", json=payload)
    assert res.status_code == 201
    return report_id


def test_full_valid_workflow_path(client: TestClient, test_db: Session):
    report_id = create_report(client, "11111111-1111-1111-1111-111111111111")

    # 1. Submitted -> Assigned
    res1 = client.post(
        f"/reports/{report_id}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Assigned", "expected_status": "Submitted", "reason": "Assigned to Team Alpha"},
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "Assigned"

    # 2. Assigned -> In Progress
    res2 = client.post(
        f"/reports/{report_id}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "In Progress", "expected_status": "Assigned"},
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "In Progress"

    # 3. In Progress -> Resolved
    res3 = client.post(
        f"/reports/{report_id}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Resolved", "expected_status": "In Progress", "reason": "Pipe replaced"},
    )
    assert res3.status_code == 200
    assert res3.json()["status"] == "Resolved"

    # Verify status in database
    report = test_db.execute(select(Report).where(Report.id == report_id)).scalar_one()
    assert report.status == "Resolved"

    # Verify 3 status_changed events were appended
    events = (
        test_db.execute(
            select(ReportEvent)
            .where(ReportEvent.report_id == report_id, ReportEvent.type == "status_changed")
            .order_by(ReportEvent.occurred_at)
        )
        .scalars()
        .all()
    )
    assert len(events) == 3
    assert events[0].details["from"] == "Submitted" and events[0].details["to"] == "Assigned"
    assert events[1].details["from"] == "Assigned" and events[1].details["to"] == "In Progress"
    assert events[2].details["from"] == "In Progress" and events[2].details["to"] == "Resolved"


def test_rejection_from_submitted_and_assigned(client: TestClient, test_db: Session):
    # From Submitted -> Rejected
    id1 = create_report(client, "22222222-2222-2222-2222-222222222222")
    res1 = client.post(
        f"/reports/{id1}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Rejected", "expected_status": "Submitted", "reason": "Duplicate submission"},
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "Rejected"

    # From Assigned -> Rejected
    id2 = create_report(client, "33333333-3333-3333-3333-333333333333")
    client.post(
        f"/reports/{id2}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Assigned", "expected_status": "Submitted"},
    )
    res2 = client.post(
        f"/reports/{id2}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Rejected", "expected_status": "Assigned", "reason": "Issue cannot be reproduced"},
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "Rejected"


def test_unknown_report_returns_404(client: TestClient):
    res = client.post(
        "/reports/unknown-uuid/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Assigned", "expected_status": "Submitted"},
    )
    assert res.status_code == 404
    assert res.json()["code"] == "REPORT_NOT_FOUND"


def test_wrong_or_missing_role_returns_403(client: TestClient):
    report_id = create_report(client, "44444444-4444-4444-4444-444444444444")

    # Missing X-Role header
    res1 = client.post(
        f"/reports/{report_id}/transition",
        json={"to": "Assigned", "expected_status": "Submitted"},
    )
    assert res1.status_code == 403
    assert res1.json()["code"] == "FORBIDDEN_ROLE"

    # Invalid role header
    res2 = client.post(
        f"/reports/{report_id}/transition",
        headers={"X-Role": "admin"},
        json={"to": "Assigned", "expected_status": "Submitted"},
    )
    assert res2.status_code == 403
    assert res2.json()["code"] == "FORBIDDEN_ROLE"

    # Field worker attempting coordinator transition
    res3 = client.post(
        f"/reports/{report_id}/transition",
        headers={"X-Role": "field_worker"},
        json={"to": "Assigned", "expected_status": "Submitted"},
    )
    assert res3.status_code == 403
    assert res3.json()["code"] == "FORBIDDEN_ROLE"


def test_stale_status_returns_409(client: TestClient, test_db: Session):
    report_id = create_report(client, "55555555-5555-5555-5555-555555555555")

    # Current status is Submitted, but expected_status says Assigned (simulates concurrent update)
    res = client.post(
        f"/reports/{report_id}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "In Progress", "expected_status": "Assigned"},
    )
    assert res.status_code == 409
    assert res.json()["code"] == "STALE_STATUS"

    # Stored status remains unchanged
    stored = test_db.execute(select(Report).where(Report.id == report_id)).scalar_one()
    assert stored.status == "Submitted"


def test_rejection_without_reason_returns_422(client: TestClient, test_db: Session):
    report_id = create_report(client, "66666666-6666-6666-6666-666666666666")

    # None reason
    res1 = client.post(
        f"/reports/{report_id}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Rejected", "expected_status": "Submitted", "reason": None},
    )
    assert res1.status_code == 422
    assert res1.json()["code"] == "REASON_REQUIRED"

    # Whitespace only reason
    res2 = client.post(
        f"/reports/{report_id}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Rejected", "expected_status": "Submitted", "reason": "   "},
    )
    assert res2.status_code == 422
    assert res2.json()["code"] == "REASON_REQUIRED"

    # Report remains Submitted
    stored = test_db.execute(select(Report).where(Report.id == report_id)).scalar_one()
    assert stored.status == "Submitted"


def test_terminal_states_cannot_transition(client: TestClient):
    # Setup Resolved report
    id_resolved = create_report(client, "77777777-7777-7777-7777-777777777777")
    client.post(
        f"/reports/{id_resolved}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Assigned", "expected_status": "Submitted"},
    )
    client.post(
        f"/reports/{id_resolved}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "In Progress", "expected_status": "Assigned"},
    )
    client.post(
        f"/reports/{id_resolved}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Resolved", "expected_status": "In Progress"},
    )

    # Attempt to reopen or transition Resolved report
    res_resolved = client.post(
        f"/reports/{id_resolved}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "In Progress", "expected_status": "Resolved", "reason": "Reopen issue"},
    )
    assert res_resolved.status_code == 409
    assert res_resolved.json()["code"] == "INVALID_TRANSITION"

    # Setup Rejected report
    id_rejected = create_report(client, "88888888-8888-8888-8888-888888888888")
    client.post(
        f"/reports/{id_rejected}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Rejected", "expected_status": "Submitted", "reason": "Not reproducible"},
    )

    # Attempt to transition Rejected report
    res_rejected = client.post(
        f"/reports/{id_rejected}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Submitted", "expected_status": "Rejected"},
    )
    assert res_rejected.status_code == 409
    assert res_rejected.json()["code"] == "INVALID_TRANSITION"


def test_invalid_transition_writes_rejected_event_and_leaves_report_unchanged(
    client: TestClient, test_db: Session
):
    report_id = create_report(client, "99999999-9999-9999-9999-999999999999")

    # Attempt illegal skip from Submitted directly to Resolved
    res = client.post(
        f"/reports/{report_id}/transition",
        headers={"X-Role": "coordinator"},
        json={"to": "Resolved", "expected_status": "Submitted"},
    )
    assert res.status_code == 409
    assert res.json()["code"] == "INVALID_TRANSITION"

    # Report status MUST remain unchanged (Submitted)
    report = test_db.execute(select(Report).where(Report.id == report_id)).scalar_one()
    assert report.status == "Submitted"

    # But a 'transition_rejected' event MUST be recorded and committed (FR-WFL-3)
    rejected_event = test_db.execute(
        select(ReportEvent).where(
            ReportEvent.report_id == report_id, ReportEvent.type == "transition_rejected"
        )
    ).scalar_one_or_none()
    assert rejected_event is not None
    assert rejected_event.actor_role == "coordinator"
    assert rejected_event.details["from"] == "Submitted"
    assert rejected_event.details["to"] == "Resolved"
    assert "error" in rejected_event.details
