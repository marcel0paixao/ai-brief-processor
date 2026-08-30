import type { BriefStatus } from '../api'
import { getStatusLabel } from '../status'

export function StatusBadge({ status }: { status: BriefStatus }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span className="status-dot" aria-hidden="true" />
      {getStatusLabel(status)}
    </span>
  )
}
