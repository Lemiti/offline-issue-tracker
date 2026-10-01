from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas import ReportPutRequest


def get_valid_payload() -> dict:
    return {
        "category": "Water point",
        "description": "Water pump handle is completely broken",
        "location_text": "Central square pump #2",
        "latitude": 10.0,
        "longitude": 20.0,
        "priority": "High",
        "status": "Submitted",
        "reported_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
    }


@pytest.mark.parametrize(
    "field, val",
    [
        ("category", "Equipment damage"),
        ("category", "Maintenance"),
        ("priority", "Low"),
        ("priority", "Critical"),
        ("description", "1234567890"),  # 10 chars boundary
        ("description", "x" * 1000),    # 1000 chars boundary
        ("location_text", "A"),         # min length
        ("location_text", "L" * 200),   # 200 chars boundary
        ("latitude", -90.0),            # min latitude
        ("latitude", 90.0),             # max latitude
        ("longitude", -180.0),          # min longitude
        ("longitude", 180.0),           # max longitude
        ("status", "Submitted"),
    ],
)
def test_valid_field_boundaries(field: str, val: str | float):
    payload = get_valid_payload()
    payload[field] = val
    req = ReportPutRequest(**payload)
    assert getattr(req, field) == val


def test_valid_coordinates_both_none():
    payload = get_valid_payload()
    payload["latitude"] = None
    payload["longitude"] = None
    req = ReportPutRequest(**payload)
    assert req.latitude is None and req.longitude is None


def test_valid_reported_at_within_five_minutes_tolerance():
    payload = get_valid_payload()
    payload["reported_at"] = (datetime.now(timezone.utc) + timedelta(minutes=3)).isoformat()
    assert ReportPutRequest(**payload)


@pytest.mark.parametrize(
    "field, bad_val, err_field",
    [
        ("category", "InvalidCategory", "category"),
        ("priority", "SuperUrgent", "priority"),
        ("description", "123456789", "description"),   # 9 chars (below 10)
        ("description", "x" * 1001, "description"),    # 1001 chars (above 1000)
        ("description", "          ", "description"),   # whitespace only
        ("location_text", "", "location_text"),         # empty
        ("location_text", "   ", "location_text"),      # whitespace only
        ("location_text", "L" * 201, "location_text"),  # 201 chars (above 200)
        ("latitude", -90.1, "latitude"),
        ("latitude", 90.1, "latitude"),
        ("longitude", -180.1, "longitude"),
        ("longitude", 180.1, "longitude"),
        ("status", "Draft", "status"),
        ("status", "Resolved", "status"),
    ],
)
def test_invalid_field_rules(field: str, bad_val: str | float, err_field: str):
    payload = get_valid_payload()
    payload[field] = bad_val
    with pytest.raises(ValidationError) as exc:
        ReportPutRequest(**payload)
    assert any(e["loc"][-1] == err_field for e in exc.value.errors())


@pytest.mark.parametrize(
    "lat, lon, err_field",
    [
        (12.0, None, "longitude"),
        (None, 34.0, "latitude"),
    ],
)
def test_invalid_coordinates_pair_mismatch(lat: float | None, lon: float | None, err_field: str):
    payload = get_valid_payload()
    payload["latitude"] = lat
    payload["longitude"] = lon
    with pytest.raises(ValidationError) as exc:
        ReportPutRequest(**payload)
    assert any(e["loc"][-1] == err_field for e in exc.value.errors())


def test_invalid_reported_at_future_exceeds_tolerance():
    payload = get_valid_payload()
    payload["reported_at"] = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    with pytest.raises(ValidationError) as exc:
        ReportPutRequest(**payload)
    assert any(e["loc"][-1] == "reported_at" for e in exc.value.errors())


@app.put("/_test_reports_validation/{report_id}")
def _dummy_put_route(report_id: str, report: ReportPutRequest):
    return {"id": report_id}


def test_global_422_handler_reports_all_errors_together():
    client = TestClient(app)
    bad_payload = {
        "category": "WrongCategory",
        "description": "Short",
        "location_text": "",
        "latitude": 999.0,
        "longitude": 999.0,
        "priority": "BadPriority",
        "status": "Draft",
        "reported_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }
    res = client.put("/_test_reports_validation/test-1", json=bad_payload)
    assert res.status_code == 422

    body = res.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert "Validation failed" in body["message"]

    fields = body["fields"]
    for expected_field in [
        "category",
        "description",
        "location_text",
        "latitude",
        "longitude",
        "priority",
        "status",
        "reported_at",
    ]:
        assert expected_field in fields
