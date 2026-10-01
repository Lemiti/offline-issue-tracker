"""Pure status workflow engine for the Offline Field Issue Tracker.

Implements SRS section 4.1 and DESIGN section 4.
Contains no I/O, database, or web framework dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class Status(str, Enum):
    """Report lifecycle workflow statuses."""

    DRAFT = "Draft"
    SUBMITTED = "Submitted"
    ASSIGNED = "Assigned"
    IN_PROGRESS = "In Progress"
    RESOLVED = "Resolved"
    REJECTED = "Rejected"


class Role(str, Enum):
    """User roles interacting with reports."""

    FIELD_WORKER = "field_worker"
    COORDINATOR = "coordinator"


class WorkflowErrorCode(str, Enum):
    """Error codes for rejected workflow transitions."""

    INVALID_TRANSITION = "INVALID_TRANSITION"
    FORBIDDEN_ROLE = "FORBIDDEN_ROLE"
    REASON_REQUIRED = "REASON_REQUIRED"


@dataclass(frozen=True)
class TransitionResult:
    """Structured result returned by workflow transition validation."""

    success: bool
    error_code: WorkflowErrorCode | None = None
    message: str | None = None

    @property
    def is_valid(self) -> bool:
        """Alias for success."""
        return self.success

    @property
    def allowed(self) -> bool:
        """Alias for success."""
        return self.success

    def __bool__(self) -> bool:
        return self.success


@dataclass(frozen=True)
class _TransitionRule:
    allowed_role: Role
    reason_required: bool


# Exact transition rules defined in SRS 4.1 and DESIGN 4
_TRANSITION_RULES: dict[tuple[Status, Status], _TransitionRule] = {
    (Status.DRAFT, Status.SUBMITTED): _TransitionRule(
        allowed_role=Role.FIELD_WORKER,
        reason_required=False,
    ),
    (Status.SUBMITTED, Status.ASSIGNED): _TransitionRule(
        allowed_role=Role.COORDINATOR,
        reason_required=False,
    ),
    (Status.SUBMITTED, Status.REJECTED): _TransitionRule(
        allowed_role=Role.COORDINATOR,
        reason_required=True,
    ),
    (Status.ASSIGNED, Status.IN_PROGRESS): _TransitionRule(
        allowed_role=Role.COORDINATOR,
        reason_required=False,
    ),
    (Status.ASSIGNED, Status.REJECTED): _TransitionRule(
        allowed_role=Role.COORDINATOR,
        reason_required=True,
    ),
    (Status.IN_PROGRESS, Status.RESOLVED): _TransitionRule(
        allowed_role=Role.COORDINATOR,
        reason_required=False,
    ),
}

# Terminal states from which no transition is permitted
TERMINAL_STATUSES: frozenset[Status] = frozenset({Status.RESOLVED, Status.REJECTED})


def _parse_status(value: Any) -> Status | None:
    if isinstance(value, Status):
        return value
    if isinstance(value, str):
        try:
            return Status(value)
        except ValueError:
            return None
    return None


def _parse_role(value: Any) -> Role | None:
    if isinstance(value, Role):
        return value
    if isinstance(value, str):
        try:
            return Role(value)
        except ValueError:
            return None
    return None


def validate_transition(
    current_status: Status | str,
    target_status: Status | str,
    role: Role | str,
    reason: str | None = None,
) -> TransitionResult:
    """Validate a requested status transition against the workflow rules.

    Args:
        current_status: The current status of the report.
        target_status: The desired next status.
        role: The role attempting the transition.
        reason: Optional or required explanation for the transition.

    Returns:
        TransitionResult indicating whether the transition is permitted,
        or an error code (INVALID_TRANSITION, FORBIDDEN_ROLE, REASON_REQUIRED)
        with an explanatory message.
    """
    curr = _parse_status(current_status)
    target = _parse_status(target_status)

    if curr is None or target is None:
        return TransitionResult(
            success=False,
            error_code=WorkflowErrorCode.INVALID_TRANSITION,
            message=f"Invalid status value: current='{current_status}', target='{target_status}'.",
        )

    # Check if the pair is a defined valid transition
    rule = _TRANSITION_RULES.get((curr, target))
    if rule is None:
        if curr in TERMINAL_STATUSES:
            return TransitionResult(
                success=False,
                error_code=WorkflowErrorCode.INVALID_TRANSITION,
                message=f"Status '{curr.value}' is terminal and cannot transition to any status.",
            )
        return TransitionResult(
            success=False,
            error_code=WorkflowErrorCode.INVALID_TRANSITION,
            message=f"Transition from '{curr.value}' to '{target.value}' is not permitted.",
        )

    # Check role authorization
    parsed_role = _parse_role(role)
    if parsed_role != rule.allowed_role:
        return TransitionResult(
            success=False,
            error_code=WorkflowErrorCode.FORBIDDEN_ROLE,
            message=(
                f"Role '{role}' is not permitted to perform transition "
                f"from '{curr.value}' to '{target.value}'. "
                f"Requires '{rule.allowed_role.value}'."
            ),
        )

    # Check reason requirement
    if rule.reason_required:
        if reason is None or not reason.strip():
            return TransitionResult(
                success=False,
                error_code=WorkflowErrorCode.REASON_REQUIRED,
                message=(
                    f"A non-empty reason is required to transition "
                    f"from '{curr.value}' to '{target.value}'."
                ),
            )

    return TransitionResult(success=True)
