"""Tests for report queries (GET /reports, GET /reports/{id}) and demonstration data seeder.

Covers:
- docs/DESIGN.md section 5
- SRS 3.6 (FR-VEW-1 to 5), 3.8 (FR-DEM-1)
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
from app.schemas import Category, Priority
from app.seed import SEED_REPORTS, seed_data
from app.workflow import Status


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


@pytest.fixture
def seeded_db(test_db: Session):
    """Fixture providing a database populated with sample seed data."""
    seed_data(test_db)
    return test_db


def test_seed_idempotency_and_completeness(test_db: Session):
    # First seed run
    count1 = seed_data(test_db)
    assert count1 == len(SEED_REPORTS)

    reports1 = test_db.execute(select(Report)).scalars().all()
    events1 = test_db.execute(select(ReportEvent)).scalars().all()
    assert len(reports1) == len(SEED_REPORTS)

    # Verify every category is represented in seed data
    categories = {r.category for r in reports1}
    for cat in Category:
        assert cat.value in categories

    # Verify every priority is represented in seed data
    priorities = {r.priority for r in reports1}
    for prio in Priority:
        assert prio.value in priorities

    # Verify every server status is represented in seed data
    statuses = {r.status for r in reports1}
    for st in [Status.SUBMITTED, Status.ASSIGNED, Status.IN_PROGRESS, Status.RESOLVED, Status.REJECTED]:
        assert st.value in statuses

    # Second seed run (must be completely idempotent)
    count2 = seed_data(test_db)
    assert count2 == 0

    reports2 = test_db.execute(select(Report)).scalars().all()
    events2 = test_db.execute(select(ReportEvent)).scalars().all()
    assert len(reports2) == len(reports1)
    assert len(events2) == len(events1)


def test_get_reports_newest_first_ordering(client: TestClient, seeded_db: Session):
    res = client.get("/reports")
    assert res.status_code == 200
    reports = res.json()
    assert len(reports) == len(SEED_REPORTS)

    # Verify newest first (descending reported_at)
    reported_dates = [datetime.fromisoformat(r["reported_at"]) for r in reports]
    for i in range(len(reported_dates) - 1):
        assert reported_dates[i] >= reported_dates[i + 1]


def test_get_reports_filter_by_status(client: TestClient, seeded_db: Session):
    res = client.get("/reports?status=Assigned")
    assert res.status_code == 200
    reports = res.json()
    assert len(reports) > 0
    assert all(r["status"] == "Assigned" for r in reports)


def test_get_reports_filter_by_priority(client: TestClient, seeded_db: Session):
    res = client.get("/reports?priority=Critical")
    assert res.status_code == 200
    reports = res.json()
    assert len(reports) > 0
    assert all(r["priority"] == "Critical" for r in reports)


def test_get_reports_filter_by_category(client: TestClient, seeded_db: Session):
    res = client.get("/reports?category=Water%20point")
    assert res.status_code == 200
    reports = res.json()
    assert len(reports) > 0
    assert all(r["category"] == "Water point" for r in reports)


def test_get_reports_filter_by_comma_separated_ids(client: TestClient, seeded_db: Session):
    target_ids = [
        "10000000-0000-0000-0000-000000000001",
        "10000000-0000-0000-0000-000000000003",
    ]
    ids_param = ",".join(target_ids)
    res = client.get(f"/reports?ids={ids_param}")
    assert res.status_code == 200
    reports = res.json()
    assert len(reports) == 2
    assert {r["id"] for r in reports} == set(target_ids)


def test_get_reports_combined_filters(client: TestClient, seeded_db: Session):
    res = client.get("/reports?category=Water%20point&priority=Critical&status=In%20Progress")
    assert res.status_code == 200
    reports = res.json()
    assert len(reports) == 1
    assert reports[0]["id"] == "10000000-0000-0000-0000-000000000001"


def test_get_report_detail_with_ordered_history(client: TestClient, seeded_db: Session):
    report_id = "10000000-0000-0000-0000-000000000001"
    res = client.get(f"/reports/{report_id}")
    assert res.status_code == 200
    data = res.json()

    assert data["id"] == report_id
    assert data["category"] == "Water point"
    assert data["status"] == "In Progress"

    events = data["events"]
    assert len(events) == 5

    # Verify events are in chronological order (occurred_at asc)
    occurred_times = [datetime.fromisoformat(e["occurred_at"]) for e in events]
    for i in range(len(occurred_times) - 1):
        assert occurred_times[i] <= occurred_times[i + 1]

    # Verify event types progression
    assert [e["type"] for e in events] == [
        "created",
        "submitted",
        "synchronized",
        "status_changed",
        "status_changed",
    ]


def test_get_report_detail_unknown_id_returns_404(client: TestClient):
    res = client.get("/reports/unknown-uuid-0000-0000")
    assert res.status_code == 404
    assert res.json()["code"] == "REPORT_NOT_FOUND"
