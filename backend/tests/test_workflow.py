import itertools
import pytest

from app.workflow import (
    Role,
    Status,
    TransitionResult,
    WorkflowErrorCode,
    validate_transition,
)

# All statuses defined in the system
ALL_STATUSES = list(Status)

# Valid transitions with required role and whether reason is required
VALID_TRANSITIONS = {
    (Status.DRAFT, Status.SUBMITTED): {
        "role": Role.FIELD_WORKER,
        "reason_required": False,
    },
    (Status.SUBMITTED, Status.ASSIGNED): {
        "role": Role.COORDINATOR,
        "reason_required": False,
    },
    (Status.SUBMITTED, Status.REJECTED): {
        "role": Role.COORDINATOR,
        "reason_required": True,
    },
    (Status.ASSIGNED, Status.IN_PROGRESS): {
        "role": Role.COORDINATOR,
        "reason_required": False,
    },
    (Status.ASSIGNED, Status.REJECTED): {
        "role": Role.COORDINATOR,
        "reason_required": True,
    },
    (Status.IN_PROGRESS, Status.RESOLVED): {
        "role": Role.COORDINATOR,
        "reason_required": False,
    },
}

ALL_STATUS_PAIRS = list(itertools.product(ALL_STATUSES, ALL_STATUSES))
INVALID_STATUS_PAIRS = [pair for pair in ALL_STATUS_PAIRS if pair not in VALID_TRANSITIONS]


class TestWorkflowValidTransitions:
    """Tests for all permitted transitions in the status workflow."""

    @pytest.mark.parametrize(
        "current_status, target_status, role, reason",
        [
            (Status.DRAFT, Status.SUBMITTED, Role.FIELD_WORKER, None),
            (Status.DRAFT, Status.SUBMITTED, Role.FIELD_WORKER, "Submitted for review"),
            (Status.SUBMITTED, Status.ASSIGNED, Role.COORDINATOR, None),
            (Status.SUBMITTED, Status.ASSIGNED, Role.COORDINATOR, "Assigned to team A"),
            (Status.SUBMITTED, Status.REJECTED, Role.COORDINATOR, "Duplicate report"),
            (Status.ASSIGNED, Status.IN_PROGRESS, Role.COORDINATOR, None),
            (Status.ASSIGNED, Status.IN_PROGRESS, Role.COORDINATOR, "Work started"),
            (Status.ASSIGNED, Status.REJECTED, Role.COORDINATOR, "Issue no longer exists"),
            (Status.IN_PROGRESS, Status.RESOLVED, Role.COORDINATOR, None),
            (Status.IN_PROGRESS, Status.RESOLVED, Role.COORDINATOR, "Fixed pump"),
        ],
    )
    def test_valid_transitions_succeed(
        self,
        current_status: Status,
        target_status: Status,
        role: Role,
        reason: str | None,
    ):
        result = validate_transition(
            current_status=current_status,
            target_status=target_status,
            role=role,
            reason=reason,
        )
        assert result.success is True
        assert bool(result) is True
        assert result.error_code is None
        assert result.message is None

    def test_valid_transitions_accept_string_arguments(self):
        result = validate_transition("Draft", "Submitted", "field_worker")
        assert result.success is True
        assert result.error_code is None

        result_reject = validate_transition(
            "Submitted", "Rejected", "coordinator", reason="Invalid submission"
        )
        assert result_reject.success is True
        assert result_reject.error_code is None


class TestWorkflowInvalidTransitionsMatrix:
    """Full matrix testing of status x status pairs (30 invalid pairs)."""

    def test_total_pairs_count(self):
        assert len(ALL_STATUS_PAIRS) == 36
        assert len(VALID_TRANSITIONS) == 6
        assert len(INVALID_STATUS_PAIRS) == 30

    @pytest.mark.parametrize("current_status, target_status", INVALID_STATUS_PAIRS)
    def test_invalid_status_pairs_refused_for_field_worker(
        self, current_status: Status, target_status: Status
    ):
        result = validate_transition(
            current_status=current_status,
            target_status=target_status,
            role=Role.FIELD_WORKER,
            reason="Some reason",
        )
        assert result.success is False
        assert bool(result) is False
        assert result.error_code == WorkflowErrorCode.INVALID_TRANSITION
        assert result.message is not None

    @pytest.mark.parametrize("current_status, target_status", INVALID_STATUS_PAIRS)
    def test_invalid_status_pairs_refused_for_coordinator(
        self, current_status: Status, target_status: Status
    ):
        result = validate_transition(
            current_status=current_status,
            target_status=target_status,
            role=Role.COORDINATOR,
            reason="Some reason",
        )
        assert result.success is False
        assert bool(result) is False
        assert result.error_code == WorkflowErrorCode.INVALID_TRANSITION
        assert result.message is not None


class TestWorkflowTerminalStates:
    """Tests that Resolved and Rejected are strictly terminal."""

    @pytest.mark.parametrize("target_status", ALL_STATUSES)
    @pytest.mark.parametrize("role", [Role.FIELD_WORKER, Role.COORDINATOR])
    def test_resolved_cannot_transition_to_any_status(
        self, target_status: Status, role: Role
    ):
        result = validate_transition(
            current_status=Status.RESOLVED,
            target_status=target_status,
            role=role,
            reason="Trying to reopen or change resolved",
        )
        assert result.success is False
        assert result.error_code == WorkflowErrorCode.INVALID_TRANSITION

    @pytest.mark.parametrize("target_status", ALL_STATUSES)
    @pytest.mark.parametrize("role", [Role.FIELD_WORKER, Role.COORDINATOR])
    def test_rejected_cannot_transition_to_any_status(
        self, target_status: Status, role: Role
    ):
        result = validate_transition(
            current_status=Status.REJECTED,
            target_status=target_status,
            role=role,
            reason="Trying to reopen or change rejected",
        )
        assert result.success is False
        assert result.error_code == WorkflowErrorCode.INVALID_TRANSITION


class TestWorkflowRolePermissions:
    """Tests role enforcement for all valid transition pairs."""

    def test_field_worker_cannot_perform_coordinator_transitions(self):
        coordinator_transitions = [
            (Status.SUBMITTED, Status.ASSIGNED, None),
            (Status.SUBMITTED, Status.REJECTED, "Valid reason"),
            (Status.ASSIGNED, Status.IN_PROGRESS, None),
            (Status.ASSIGNED, Status.REJECTED, "Valid reason"),
            (Status.IN_PROGRESS, Status.RESOLVED, None),
        ]
        for current_status, target_status, reason in coordinator_transitions:
            result = validate_transition(
                current_status=current_status,
                target_status=target_status,
                role=Role.FIELD_WORKER,
                reason=reason,
            )
            assert result.success is False
            assert result.error_code == WorkflowErrorCode.FORBIDDEN_ROLE
            assert result.message is not None

    def test_coordinator_cannot_perform_field_worker_transitions(self):
        result = validate_transition(
            current_status=Status.DRAFT,
            target_status=Status.SUBMITTED,
            role=Role.COORDINATOR,
            reason=None,
        )
        assert result.success is False
        assert result.error_code == WorkflowErrorCode.FORBIDDEN_ROLE
        assert result.message is not None

    def test_unknown_role_is_forbidden(self):
        result = validate_transition(
            current_status=Status.DRAFT,
            target_status=Status.SUBMITTED,
            role="anonymous_guest",  # type: ignore[arg-type]
        )
        assert result.success is False
        assert result.error_code == WorkflowErrorCode.FORBIDDEN_ROLE


class TestWorkflowReasonRequirement:
    """Tests rejection reason requirements."""

    @pytest.mark.parametrize(
        "current_status", [Status.SUBMITTED, Status.ASSIGNED]
    )
    @pytest.mark.parametrize(
        "bad_reason", [None, "", "   ", "\t\n"]
    )
    def test_rejection_requires_non_empty_reason(
        self, current_status: Status, bad_reason: str | None
    ):
        result = validate_transition(
            current_status=current_status,
            target_status=Status.REJECTED,
            role=Role.COORDINATOR,
            reason=bad_reason,
        )
        assert result.success is False
        assert result.error_code == WorkflowErrorCode.REASON_REQUIRED
        assert result.message is not None

    @pytest.mark.parametrize("current_status", [Status.SUBMITTED, Status.ASSIGNED])
    def test_rejection_succeeds_with_valid_reason(self, current_status: Status):
        result = validate_transition(
            current_status=current_status,
            target_status=Status.REJECTED,
            role=Role.COORDINATOR,
            reason="Legitimate rejection reason",
        )
        assert result.success is True
        assert result.error_code is None
