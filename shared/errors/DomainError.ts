export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'INVARIANT_VIOLATION'
  | 'UNKNOWN';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly fields?: Record<string, string>;

  constructor(code: DomainErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    if (fields) this.fields = fields;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, fields?: Record<string, string>) {
    super('CONFLICT', message, fields);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, fields?: Record<string, string>) {
    super('VALIDATION', message, fields);
    this.name = 'ValidationError';
  }
}

export class InvariantViolationError extends DomainError {
  constructor(message: string) {
    super('INVARIANT_VIOLATION', message);
    this.name = 'InvariantViolationError';
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
