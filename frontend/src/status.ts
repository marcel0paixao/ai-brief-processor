import type { BriefStatus } from './api'

const statusLabels: Record<BriefStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  COMPLETED: 'Concluída',
  FAILED: 'Falhou',
}

export function getStatusLabel(status: BriefStatus): string {
  return statusLabels[status]
}
