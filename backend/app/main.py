"""FastAPI application entrypoint and global exception handlers.

Implements the shared error shape and global validation exception handlers
as specified in DESIGN.md section 5, 7.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Header, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.schemas import (
    ErrorResponse,
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


app = FastAPI(
    title="Offline Field Issue Tracker",
    description="Central record backend for offline-first field problem reporting.",
    lifespan=lifespan,
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
