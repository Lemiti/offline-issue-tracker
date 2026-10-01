"""FastAPI application entrypoint and global exception handlers.

Implements the shared error shape, report query, and global validation exception handlers
as specified in DESIGN.md section 5, 7.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Header, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.models import Report, ReportEvent
from app.schemas import (
    ErrorResponse,
    ReportDetailResponse,
    ReportEventResponse,
    ReportPutRequest,
    ReportResponse,
    TransitionRequest,
    format_validation_error_fields,
)
from app.service import (
    ForbiddenRoleException,
    IdContentMismatchException,
    InvalidTransitionException,
    ReasonRequiredException,
    ReportNotFoundException,
    StaleStatusException,
    sync_report,
    transition_report,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context initializing database schema on application startup."""
    init_db()
    yield


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Offline Field Issue Tracker",
    description="Central record backend for offline-first field problem reporting.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Format FastAPI request validation errors into standard { code, message, fields } shape."""
    fields = format_validation_error_fields(exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "code": "VALIDATION_ERROR",
            "message": "Validation failed for one or more fields.",
            "fields": fields,
        },
    )


@app.exception_handler(ValidationError)
async def pydantic_validation_exception_handler(
    request: Request, exc: ValidationError
) -> JSONResponse:
    """Format Pydantic model validation errors into standard { code, message, fields } shape."""
    fields = format_validation_error_fields(exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "code": "VALIDATION_ERROR",
            "message": "Validation failed for one or more fields.",
            "fields": fields,
        },
    )


@app.exception_handler(IdContentMismatchException)
async def id_content_mismatch_exception_handler(
    request: Request, exc: IdContentMismatchException
) -> JSONResponse:
    """Handle 409 ID_CONTENT_MISMATCH when report ID exists with conflicting content."""
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "code": "ID_CONTENT_MISMATCH",
            "message": exc.message,
            "fields": {},
        },
    )


@app.exception_handler(ReportNotFoundException)
async def report_not_found_exception_handler(
    request: Request, exc: ReportNotFoundException
) -> JSONResponse:
    """Handle 404 REPORT_NOT_FOUND when requested report is missing."""
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={
            "code": "REPORT_NOT_FOUND",
            "message": exc.message,
            "fields": {},
        },
    )


@app.exception_handler(ForbiddenRoleException)
async def forbidden_role_exception_handler(
    request: Request, exc: ForbiddenRoleException
) -> JSONResponse:
    """Handle 403 FORBIDDEN_ROLE when role is unauthorized."""
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={
            "code": "FORBIDDEN_ROLE",
            "message": exc.message,
            "fields": {},
        },
    )


@app.exception_handler(ReasonRequiredException)
async def reason_required_exception_handler(
    request: Request, exc: ReasonRequiredException
) -> JSONResponse:
    """Handle 422 REASON_REQUIRED when rejection reason is missing."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "code": "REASON_REQUIRED",
            "message": exc.message,
            "fields": {"reason": exc.message},
        },
    )


@app.exception_handler(StaleStatusException)
async def stale_status_exception_handler(
    request: Request, exc: StaleStatusException
) -> JSONResponse:
    """Handle 409 STALE_STATUS for concurrent coordinator conflicts."""
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "code": "STALE_STATUS",
            "message": exc.message,
            "fields": {},
        },
    )


@app.exception_handler(InvalidTransitionException)
async def invalid_transition_exception_handler(
    request: Request, exc: InvalidTransitionException
) -> JSONResponse:
    """Handle 409 INVALID_TRANSITION when transition is illegal in workflow."""
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "code": "INVALID_TRANSITION",
            "message": exc.message,
            "fields": {},
        },
    )


@app.get(
    "/health",
    responses={200: {"description": "Server health status"}},
)
def health():
    """Connectivity health check endpoint (DESIGN section 5)."""
    return {"status": "ok"}


@app.get(
    "/reports",
    response_model=list[ReportResponse],
    responses={
        200: {"model": list[ReportResponse], "description": "List of reports matching filters"},
    },
)
def get_reports(
    status: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    ids: str | None = None,
    db: Session = Depends(get_db),
):
    """List reports with optional filters, ordered newest first (DESIGN section 5)."""
    query = select(Report)
    if status:
        query = query.where(Report.status == status)
    if priority:
        query = query.where(Report.priority == priority)
    if category:
        query = query.where(Report.category == category)
    if ids:
        id_list = [i.strip() for i in ids.split(",") if i.strip()]
        if id_list:
            query = query.where(Report.id.in_(id_list))
    query = query.order_by(Report.reported_at.desc())
    return db.execute(query).scalars().all()


@app.get(
    "/reports/{report_id}",
    response_model=ReportDetailResponse,
    responses={
        200: {"model": ReportDetailResponse, "description": "Report with ordered audit history"},
        404: {"model": ErrorResponse, "description": "Report not found"},
    },
)
def get_report_detail(
    report_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve a single report and its event history in time order (DESIGN section 5)."""
    report = db.execute(select(Report).where(Report.id == report_id)).scalar_one_or_none()
    if report is None:
        raise ReportNotFoundException(f"Report '{report_id}' was not found.")

    events = (
        db.execute(
            select(ReportEvent)
            .where(ReportEvent.report_id == report_id)
            .order_by(ReportEvent.occurred_at.asc())
        )
        .scalars()
        .all()
    )

    return ReportDetailResponse(
        id=report.id,
        category=report.category,
        description=report.description,
        location_text=report.location_text,
        latitude=report.latitude,
        longitude=report.longitude,
        priority=report.priority,
        status=report.status,
        reporter_name=report.reporter_name,
        reported_at=report.reported_at,
        received_at=report.received_at,
        updated_at=report.updated_at,
        events=[ReportEventResponse.model_validate(e) for e in events],
    )


@app.put(
    "/reports/{report_id}",
    response_model=ReportResponse,
    responses={
        201: {"model": ReportResponse, "description": "Report successfully created"},
        200: {"model": ReportResponse, "description": "Report already exists with identical content"},
        409: {"model": ErrorResponse, "description": "ID content mismatch"},
        422: {"model": ErrorResponse, "description": "Validation failed"},
    },
)
def put_report(
    report_id: str,
    payload: ReportPutRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Idempotent delivery of a submitted report with client events (DESIGN section 5)."""
    status_code, report = sync_report(db, report_id, payload)
    response.status_code = status_code
    return report


@app.post(
    "/reports/{report_id}/transition",
    response_model=ReportResponse,
    responses={
        200: {"model": ReportResponse, "description": "Status updated successfully"},
        403: {"model": ErrorResponse, "description": "Forbidden role"},
        404: {"model": ErrorResponse, "description": "Report not found"},
        409: {"model": ErrorResponse, "description": "Stale status or invalid transition"},
        422: {"model": ErrorResponse, "description": "Reason required or validation error"},
    },
)
def post_transition(
    report_id: str,
    payload: TransitionRequest,
    x_role: str | None = Header(default=None, alias="X-Role"),
    db: Session = Depends(get_db),
):
    """Execute status transition on an existing report (DESIGN section 4, 5)."""
    return transition_report(db, report_id, payload, x_role)
