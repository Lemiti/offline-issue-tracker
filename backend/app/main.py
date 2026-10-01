"""FastAPI application entrypoint and global exception handlers.

Implements the shared error shape and global validation exception handlers
as specified in DESIGN.md section 5, 7.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app.schemas import (
    ErrorResponse,
    ReportPutRequest,
    ReportResponse,
    format_validation_error_fields,
)
from app.service import IdContentMismatchException, sync_report


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
