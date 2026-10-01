"""Tests for idempotent report synchronization (PUT /reports/{id}).

Covers:
- docs/DESIGN.md section 3.1, 5, 6.3
- SRS FR-SYN-5, FR-HIS-1 to FR-HIS-5
"""

from datetime import datetime, timezone
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models import Base, Report, ReportEvent
from app.schemas import ReportPutRequest
import app.service as service
from app.service import sync_report


@pytest.fixture
def test_db():
    """Isolated in-memory SQLite database for testing transactions."""
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
    """TestClient wired with the isolated test database session."""
    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def make_payload(report_id: str = "11111111-1111-1111-1111-111111111111") -> dict:
    return {
        "id": report_id,
        "category": "Water point",
        "description": "The main borehole pump handle has snapped off.",
        "location_text": "Village square well #1",
        "latitude": 4.1234,
        "longitude": 15.5678,
        "priority": "High",
        "status": "Submitted",
        "reporter_name": "John Doe",
        "reported_at": datetime.now(timezone.utc).isoformat(),
        "client_events": [
            {
                "id": "e1111111-1111-1111-1111-111111111111",
                "type": "created",
                "actor_role": "field_worker",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "details": {"action": "draft_created"},
            },
            {
                "id": "e2222222-2222-2222-2222-222222222222",
                "type": "submitted",
                "actor_role": "field_worker",
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "details": {"action": "submitted_offline"},
            },
        ],
    }


def test_first_delivery_returns_201_and_persists_records(client: TestClient, test_db: Session):
    report_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    payload = make_payload(report_id)

    res = client.put(f"/reports/{report_id}", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["id"] == report_id
    assert data["status"] == "Submitted"

    # Exactly one report row in database
    reports = test_db.execute(select(Report).where(Report.id == report_id)).scalars().all()
    assert len(reports) == 1

    # Exactly 3 events: 2 client events + 1 server 'synchronized' event
    events = (
        test_db.execute(select(ReportEvent).where(ReportEvent.report_id == report_id))
        .scalars()
        .all()
    )
    assert len(events) == 3
    event_types = {e.type for e in events}
    assert event_types == {"created", "submitted", "synchronized"}


def test_identical_retry_returns_200_and_does_not_duplicate_rows_or_events(
    client: TestClient, test_db: Session
):
    report_id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    payload = make_payload(report_id)

    # First delivery
    res1 = client.put(f"/reports/{report_id}", json=payload)
    assert res1.status_code == 201

    # Identical delivery retry (e.g. client lost connection before receiving 201)
    res2 = client.put(f"/reports/{report_id}", json=payload)
    assert res2.status_code == 200
    assert res2.json()["id"] == report_id

    # Database still has exactly one report and same number of events
    reports = test_db.execute(select(Report).where(Report.id == report_id)).scalars().all()
    assert len(reports) == 1

    events = (
        test_db.execute(select(ReportEvent).where(ReportEvent.report_id == report_id))
        .scalars()
        .all()
    )
    assert len(events) == 3


def test_existing_id_with_different_content_returns_409(client: TestClient, test_db: Session):
    report_id = "cccccccc-cccc-cccc-cccc-cccccccccccc"
    payload = make_payload(report_id)

    # First delivery succeeds
    res1 = client.put(f"/reports/{report_id}", json=payload)
    assert res1.status_code == 201

    # Attempt to send different description under same ID
    conflicting_payload = dict(payload)
    conflicting_payload["description"] = "Completely different issue description."

    res2 = client.put(f"/reports/{report_id}", json=conflicting_payload)
    assert res2.status_code == 409
    body = res2.json()
    assert body["code"] == "ID_CONTENT_MISMATCH"

    # Original content remains unchanged
    stored = test_db.execute(select(Report).where(Report.id == report_id)).scalar_one()
    assert stored.description == payload["description"]


def test_invalid_payload_returns_422_and_stores_nothing(client: TestClient, test_db: Session):
    report_id = "dddddddd-dddd-dddd-dddd-dddddddddddd"
    payload = make_payload(report_id)
    payload["description"] = "Short"  # Invalid (<10 chars)

    res = client.put(f"/reports/{report_id}", json=payload)
    assert res.status_code == 422
    assert res.json()["code"] == "VALIDATION_ERROR"

    # Nothing persisted
    stored = test_db.execute(select(Report).where(Report.id == report_id)).scalar_one_or_none()
    assert stored is None

    events = (
        test_db.execute(select(ReportEvent).where(ReportEvent.report_id == report_id))
        .scalars()
        .all()
    )
    assert len(events) == 0


def test_client_event_uuids_not_duplicated_on_retry(client: TestClient, test_db: Session):
    report_id = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
    payload = make_payload(report_id)
    event_ids = [e["id"] for e in payload["client_events"]]

    # Attempt 1
    res1 = client.put(f"/reports/{report_id}", json=payload)
    assert res1.status_code == 201

    # Attempt 2
    res2 = client.put(f"/reports/{report_id}", json=payload)
    assert res2.status_code == 200

    # Verify each event UUID exists exactly once in database
    for eid in event_ids:
        rows = test_db.execute(select(ReportEvent).where(ReportEvent.id == eid)).scalars().all()
        assert len(rows) == 1


def test_simulated_integrity_error_race_resolves_to_200(test_db: Session):
    report_id = "ffffffff-ffff-ffff-ffff-ffffffffffff"
    payload_dict = make_payload(report_id)
    req = ReportPutRequest(**payload_dict)

    # First delivery succeeds normally (inserts report and 2 client events + 1 sync event)
    code1, rep1 = sync_report(test_db, report_id, req)
    assert code1 == 201

    real_find_report = service._find_report

    class SideEffectList(list):
        """Side-effect list that returns None on the first call, then calls the real helper."""

        def __iter__(self):
            self._idx = 0
            return self

        def __next__(self):
            if self._idx < len(self):
                val = self[self._idx]
                self._idx += 1
                if callable(val):
                    return val(test_db, report_id)
                return val
            raise StopIteration

        def __call__(self, *args, **kwargs):
            if self:
                val = self.pop(0)
                if callable(val):
                    return val(*args, **kwargs)
                return val
            return real_find_report(*args, **kwargs)

    # Simulate race: report exists in database, but the FIRST call to the lookup helper returns None.
    # The subsequent insert attempt hits the real unique-constraint IntegrityError on flush,
    # triggering the rollback and recovery re-read branch in sync_report.
    side_effects = SideEffectList([None, real_find_report])
    with patch.object(service, "_find_report", side_effect=side_effects):
        code2, rep2 = sync_report(test_db, report_id, req)

    # 1. Assert sync_report returns status 200 and the stored report
    assert code2 == 200
    assert rep2.id == report_id
    assert rep2.description == payload_dict["description"]

    # 2. Assert exactly one report row exists in the database
    reports = test_db.execute(select(Report).where(Report.id == report_id)).scalars().all()
    assert len(reports) == 1
    assert reports[0].id == report_id

    # 3. Assert client events and server 'synchronized' event were not duplicated
    events = (
        test_db.execute(select(ReportEvent).where(ReportEvent.report_id == report_id))
        .scalars()
        .all()
    )
    assert len(events) == 3
    event_types = {e.type for e in events}
    assert event_types == {"created", "submitted", "synchronized"}

    sync_events = [e for e in events if e.type == "synchronized"]
    assert len(sync_events) == 1

    for ce in req.client_events:
        matching_events = [e for e in events if e.id == ce.id]
        assert len(matching_events) == 1

    # 4. Assert the database session is still usable afterwards
    stored_check = test_db.execute(select(Report).where(Report.id == report_id)).scalar_one_or_none()
    assert stored_check is not None
    test_db.commit()
