import { Category, Priority, Status, SyncState } from '../types';

interface BadgeProps {
  style?: React.CSSProperties;
}

export function PriorityBadge({ priority, style }: { priority: Priority | string } & BadgeProps) {
  let icon = '■';
  let prefix = '[P3]';
  let color = '#d48806';
  let bg = '#fffbe6';
  let border = '#ffe58f';

  switch (priority) {
    case Priority.CRITICAL:
      icon = '⚡';
      prefix = '[P1]';
      color = '#cf1322';
      bg = '#fff1f0';
      border = '#ffa39e';
      break;
    case Priority.HIGH:
      icon = '▲';
      prefix = '[P2]';
      color = '#d4380d';
      bg = '#fff2e8';
      border = '#ffbb96';
      break;
    case Priority.MEDIUM:
      icon = '■';
      prefix = '[P3]';
      color = '#d48806';
      bg = '#fffbe6';
      border = '#ffe58f';
      break;
    case Priority.LOW:
      icon = '▽';
      prefix = '[P4]';
      color = '#389e0d';
      bg = '#f6ffed';
      border = '#b7eb8f';
      break;
  }

  return (
    <span
      role="status"
      aria-label={`Priority: ${priority}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.15rem 0.45rem',
        borderRadius: '3px',
        fontSize: '0.8rem',
        fontWeight: '600',
        color,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        ...style,
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{prefix} {priority}</span>
    </span>
  );
}

export function StatusBadge({ status, style }: { status: Status | string } & BadgeProps) {
  let icon = '•';
  let color = '#595959';
  let bg = '#fafafa';
  let border = '#d9d9d9';

  switch (status) {
    case Status.DRAFT:
      icon = '📝';
      color = '#595959';
      bg = '#f5f5f5';
      border = '#d9d9d9';
      break;
    case Status.SUBMITTED:
      icon = '📤';
      color = '#0958d9';
      bg = '#e6f4ff';
      border = '#91caff';
      break;
    case Status.ASSIGNED:
      icon = '👤';
      color = '#722ed1';
      bg = '#f9f0ff';
      border = '#d3adf7';
      break;
    case Status.IN_PROGRESS:
      icon = '⚙️';
      color = '#1677ff';
      bg = '#e6f7ff';
      border = '#69b1ff';
      break;
    case Status.RESOLVED:
      icon = '✓';
      color = '#389e0d';
      bg = '#f6ffed';
      border = '#b7eb8f';
      break;
    case Status.REJECTED:
      icon = '✗';
      color = '#cf1322';
      bg = '#fff1f0';
      border = '#ffa39e';
      break;
  }

  return (
    <span
      role="status"
      aria-label={`Status: ${status}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.15rem 0.45rem',
        borderRadius: '3px',
        fontSize: '0.8rem',
        fontWeight: '600',
        color,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        ...style,
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{status}</span>
    </span>
  );
}

export function SyncStateBadge({
  syncState,
  lastError,
  style,
}: {
  syncState: SyncState | string;
  lastError?: string | null;
} & BadgeProps) {
  let icon = '⏳';
  let label = 'Not synchronized';
  let color = '#d46b08';
  let bg = '#fff7e6';
  let border = '#ffd591';

  switch (syncState) {
    case SyncState.PENDING:
      icon = '⏳';
      label = 'Not synchronized (Pending)';
      color = '#d46b08';
      bg = '#fff7e6';
      border = '#ffd591';
      break;
    case SyncState.SYNCHRONIZED:
      icon = '✓';
      label = 'Synchronized';
      color = '#389e0d';
      bg = '#f6ffed';
      border = '#b7eb8f';
      break;
    case SyncState.FAILED:
      icon = '⚠️';
      label = lastError ? `Sync Failed: ${lastError}` : 'Sync Failed';
      color = '#cf1322';
      bg = '#fff1f0';
      border = '#ffa39e';
      break;
  }

  return (
    <span
      role="status"
      aria-label={`Sync state: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.15rem 0.45rem',
        borderRadius: '3px',
        fontSize: '0.8rem',
        fontWeight: '600',
        color,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...style,
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

export function CategoryBadge({ category, style }: { category: Category | string } & BadgeProps) {
  return (
    <span
      style={{
        fontWeight: 'bold',
        fontSize: '0.95rem',
        color: '#1f1f1f',
        ...style,
      }}
    >
      📂 {category}
    </span>
  );
}
