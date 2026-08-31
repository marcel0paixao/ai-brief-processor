export class ProcessingError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly retryable: boolean,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = 'ProcessingError';
    }

    static readonly INVALID_JOB_DATA = new ProcessingError('INVALID_JOB_DATA', 'ID ausente ou inválido.', false);
    static readonly BRIEF_NOT_FOUND = new ProcessingError('BRIEF_NOT_FOUND', 'Brief não existe dentro do tenant.', false);
    static readonly LLM_AUTH_ERROR = new ProcessingError('LLM_AUTH_ERROR', 'Chave inválida ou sem permissão.', false);
    static readonly LLM_REQUEST_INVALID = new ProcessingError('LLM_REQUEST_INVALID', 'Modelo ou schema incompatível.', false);
    static readonly LLM_TIMEOUT = new ProcessingError('LLM_TIMEOUT', 'Provider ultrapassou o limite.', true);
    static readonly LLM_RATE_LIMITED = new ProcessingError('LLM_RATE_LIMITED', 'Muitas requisições no mesmo intervalo de tempo.', true);
    static readonly LLM_UNAVAILABLE = new ProcessingError('LLM_UNAVAILABLE', 'Rede, HTTP 5xx ou indisponibilidade.', true);
    static readonly LLM_INVALID_RESPONSE = new ProcessingError('LLM_INVALID_RESPONSE', 'JSON ausente ou fora do schema.', true);
    static readonly WORKER_INTERNAL_ERROR = new ProcessingError('WORKER_INTERNAL_ERROR', 'Erro inesperado.', true);
}