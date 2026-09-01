export type UserRole = 'ADMIN' | 'MEMBER'
export type BriefStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
export type BriefSortBy = 'createdAt' | 'updatedAt' | 'title'
export type SortOrder = 'asc' | 'desc'

export interface SessionTenant {
  id: string
  name: string
  slug: string
}

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  tenant: SessionTenant
}

export interface AuthResponse {
  accessToken: string
  user: SessionUser
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput extends LoginInput {
  name: string
  tenantName: string
}

export interface AnalyzedBriefResult {
  outcome: 'ANALYZED'
  summary: string
  mainObjective: string
  targetAudience: string[]
  communicationPillars: string[]
  suggestedActions: string[]
  risks: string[]
}

export interface InsufficientBriefResult {
  outcome: 'INSUFFICIENT_BRIEF'
  reason: string
  missingInformation: string[]
}

export type BriefAnalysisResult = AnalyzedBriefResult | InsufficientBriefResult

export interface BriefProcessingError {
  code: string
  message: string
  retryable: boolean
}

export interface BriefListItem {
  id: string
  title: string
  status: BriefStatus
  createdAt: string
  updatedAt: string
}

export interface BriefDetail extends BriefListItem {
  brief: string
  result?: BriefAnalysisResult
  error?: BriefProcessingError
  attemptCount: number
  processingStartedAt?: string
  completedAt?: string
}

export interface BriefListFilters {
  status?: BriefStatus
  search?: string
  dateFrom?: string
  dateTo?: string
  sortBy?: BriefSortBy
  sortOrder?: SortOrder
  page?: number
  limit?: number
}

export interface BriefListResponse {
  items: BriefListItem[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
    statusCounts: Record<BriefStatus, number>
  }
}

export interface CreateBriefInput {
  title: string
  brief: string
}

export interface UpdateBriefInput {
  title?: string
  brief?: string
}

interface CreateBriefResponse {
  id: string
  status: BriefStatus
}

export interface TenantUser {
  id: string
  name: string
  email: string
  role: UserRole
  isActive: boolean
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

export interface CreateUserInput {
  name: string
  email: string
  password: string
  role: UserRole
}

export interface UpdateUserInput {
  name?: string
  role?: UserRole
  isActive?: boolean
}

interface ErrorResponse {
  message?: string | string[]
  code?: string
  briefId?: string
}

interface ApiRequestOptions extends RequestInit {
  authenticated?: boolean
}

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
const API_BASE_URL = (configuredApiUrl || '/api').replace(/\/$/, '')
const ACCESS_TOKEN_KEY = 'ai-brief-processor.access-token'
export const UNAUTHORIZED_EVENT = 'ai-brief-processor:unauthorized'

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly briefId?: string

  constructor(message: string, status: number, payload?: ErrorResponse) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = payload?.code
    this.briefId = payload?.briefId
  }
}

export function getAccessToken(): string | null {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function saveAccessToken(token: string): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

export function clearAccessToken(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY)
}

function getErrorMessage(payload: ErrorResponse | undefined): string {
  const knownMessages: Record<string, string> = {
    EMAIL_ALREADY_REGISTERED: 'Este e-mail já está cadastrado.',
    INVALID_CREDENTIALS: 'E-mail ou senha inválidos.',
    SELF_LOCKOUT_NOT_ALLOWED: 'Você não pode desativar ou rebaixar a própria conta.',
    FORBIDDEN: 'Seu perfil não permite realizar esta operação.',
    UNAUTHORIZED: 'Sua sessão expirou. Entre novamente.',
  }

  if (payload?.code && knownMessages[payload.code]) return knownMessages[payload.code]
  if (Array.isArray(payload?.message)) return payload.message.join(' ')
  return payload?.message ?? 'Não foi possível concluir a solicitação.'
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  let response: Response
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 10_000)
  const { authenticated = true, ...requestOptions } = options
  const accessToken = authenticated ? getAccessToken() : null

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...requestOptions.headers,
      },
    })
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(
        'A API demorou mais do que o esperado para responder. Tente novamente em instantes.',
        0,
      )
    }

    throw new ApiError(
      'Não foi possível conectar à API. Confirme se o backend está em execução.',
      0,
    )
  } finally {
    window.clearTimeout(timeoutId)
  }

  const payload = response.status === 204
    ? undefined
    : ((await response.json().catch(() => undefined)) as T | ErrorResponse | undefined)

  if (!response.ok) {
    const errorPayload = payload as ErrorResponse | undefined

    if (response.status === 401 && authenticated) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }

    throw new ApiError(getErrorMessage(errorPayload), response.status, errorPayload)
  }

  return payload as T
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
    authenticated: false,
  })
}

export function register(input: RegisterInput): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
    authenticated: false,
  })
}

export function getCurrentUser(): Promise<SessionUser> {
  return request<SessionUser>('/auth/me')
}

export function listBriefs(filters: BriefListFilters = {}): Promise<BriefListResponse> {
  const params = new URLSearchParams()

  if (filters.status) params.set('status', filters.status)
  if (filters.search) params.set('search', filters.search)
  if (filters.dateFrom) params.set('dateFrom', `${filters.dateFrom}T00:00:00.000Z`)
  if (filters.dateTo) params.set('dateTo', `${filters.dateTo}T23:59:59.999Z`)
  if (filters.sortBy) params.set('sortBy', filters.sortBy)
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.limit) params.set('limit', String(filters.limit))

  const query = params.toString()
  return request<BriefListResponse>(`/briefs${query ? `?${query}` : ''}`)
}

export function getBrief(briefId: string): Promise<BriefDetail> {
  return request<BriefDetail>(`/briefs/${encodeURIComponent(briefId)}`)
}

export function createBrief(input: CreateBriefInput): Promise<CreateBriefResponse> {
  return request<CreateBriefResponse>('/briefs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function retryBrief(briefId: string): Promise<BriefDetail> {
  return request<BriefDetail>(`/briefs/${encodeURIComponent(briefId)}/retry`, {
    method: 'POST',
  })
}

export function updateBrief(
  briefId: string,
  input: UpdateBriefInput,
): Promise<BriefDetail> {
  return request<BriefDetail>(`/briefs/${encodeURIComponent(briefId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteBrief(briefId: string): Promise<void> {
  return request<void>(`/briefs/${encodeURIComponent(briefId)}`, {
    method: 'DELETE',
  })
}

export function listUsers(): Promise<TenantUser[]> {
  return request<TenantUser[]>('/users')
}

export function createUser(input: CreateUserInput): Promise<TenantUser> {
  return request<TenantUser>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateUser(userId: string, input: UpdateUserInput): Promise<TenantUser> {
  return request<TenantUser>(`/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}
