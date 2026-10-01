import { Status } from './types';

export interface TransitionRule {
  to: Status;
  label: string;
  requiresReason: boolean;
}

// The server (backend/app/workflow.py) is authoritative and this table
// only controls which buttons are shown.
export const VALID_TRANSITIONS: Partial<Record<Status, TransitionRule[]>> = {
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

/**
 * Returns available coordinator transition rules for a given report status.
 * Resolved and Rejected are terminal and offer no actions.
 * Draft is local-only and offers no coordinator actions.
 */
export function getAvailableTransitions(status: Status | string): TransitionRule[] {
  return VALID_TRANSITIONS[status as Status] || [];
}
