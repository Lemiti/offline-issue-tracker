"""FastAPI application entrypoint and global exception handlers.

Implements the shared error shape and global validation exception handlers
as specified in DESIGN.md section 5, 7.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.schemas import format_validation_error_fields

app = FastAPI(
    title="Offline Field Issue Tracker",
    description="Central record backend for offline-first field problem reporting.",
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
