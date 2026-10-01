import { describe, expect, it } from 'vitest';
import { Status } from '../types';
import { getAvailableTransitions, VALID_TRANSITIONS, type TransitionRule } from '../workflow';

/**
 * Expected coordinator workflow transitions copied from SRS 4.1 (v1.1):
 * - Submitted -> Assigned (No reason), Rejected (Reason required)
 * - Assigned -> In Progress (No reason), Rejected (Reason required)
 * - In Progress -> Resolved (No reason)
 * - Resolved -> (No transitions / terminal)
 * - Rejected -> (No transitions / terminal)
 */
const EXPECTED_SRS_4_1_TRANSITIONS: Partial<Record<Status, TransitionRule[]>> = {
  [Status.SUBMITTED]: [
    { to: Status.ASSIGNED, label: 'Assign', requiresReason: false },
    { to: Status.REJECTED, label: 'Reject', requiresReason: true },
  ],
  [Status.ASSIGNED]: [
    { to: Status.IN_PROGRESS, label: 'Start Progress', requiresReason: false },
    { to: Status.REJECTED, label: 'Reject', requiresReason: true },
  ],
  [Status.IN_PROGRESS]: [
    { to: Status.RESOLVED, label: 'Resolve', requiresReason: false },
  ],
  [Status.RESOLVED]: [],
  [Status.REJECTED]: [],
};

describe('Coordinator Workflow Transitions (SRS 4.1, FR-WFL-5, DESIGN 4)', () => {
  // (a) Resolved and Rejected return no available transitions
  it('(a) Resolved and Rejected return no available transitions', () => {
    expect(getAvailableTransitions(Status.RESOLVED)).toEqual([]);
    expect(getAvailableTransitions(Status.REJECTED)).toEqual([]);
    expect(VALID_TRANSITIONS[Status.RESOLVED]).toEqual([]);
    expect(VALID_TRANSITIONS[Status.REJECTED]).toEqual([]);
  });

  // (b) Draft returns none
  it('(b) Draft returns no available transitions for coordinator', () => {
    expect(getAvailableTransitions(Status.DRAFT)).toEqual([]);
    expect(VALID_TRANSITIONS[Status.DRAFT]).toBeUndefined();
  });

  // (c) the table matches an expected constant copied from SRS 4.1
  // (Submitted -> Assigned, Rejected; Assigned -> In Progress, Rejected; In Progress -> Resolved)
  it('(c) the table matches an expected constant copied from SRS 4.1', () => {
    expect(VALID_TRANSITIONS).toEqual(EXPECTED_SRS_4_1_TRANSITIONS);
  });

  // (d) only the Rejected transitions require a reason
  it('(d) only the Rejected transitions require a reason', () => {
    for (const [fromStatus, rules] of Object.entries(VALID_TRANSITIONS)) {
      for (const rule of rules || []) {
        if (rule.to === Status.REJECTED) {
          expect(rule.requiresReason).toBe(true);
        } else {
          expect(rule.requiresReason).toBe(false);
        }
      }
    }

    // Explicit checks for individual transition rules
    const submittedTransitions = getAvailableTransitions(Status.SUBMITTED);
    const assignRule = submittedTransitions.find((r) => r.to === Status.ASSIGNED);
    const rejectFromSubmitted = submittedTransitions.find((r) => r.to === Status.REJECTED);
    expect(assignRule?.requiresReason).toBe(false);
    expect(rejectFromSubmitted?.requiresReason).toBe(true);

    const assignedTransitions = getAvailableTransitions(Status.ASSIGNED);
    const inProgressRule = assignedTransitions.find((r) => r.to === Status.IN_PROGRESS);
    const rejectFromAssigned = assignedTransitions.find((r) => r.to === Status.REJECTED);
    expect(inProgressRule?.requiresReason).toBe(false);
    expect(rejectFromAssigned?.requiresReason).toBe(true);

    const inProgressTransitions = getAvailableTransitions(Status.IN_PROGRESS);
    const resolveRule = inProgressTransitions.find((r) => r.to === Status.RESOLVED);
    expect(resolveRule?.requiresReason).toBe(false);
  });
});
