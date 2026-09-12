/** Stable error envelope shared by every OEM package. */
export class OEMError extends Error {
  readonly name = 'OEMError';
  constructor(
    readonly code: 'INVALID_INPUT' | 'RESOURCE_FAILED' | 'DESTROYED' | 'CALLBACK_FAILED',
    readonly operation: string,
    message: string,
    readonly path?: string,
    options?: ErrorOptions,
  ) {
    super(path ? `${path}: ${message}` : message, options);
  }
}

export function invalid(path: string, message: string): never {
  throw new OEMError('INVALID_INPUT', 'validate', message, path);
}

export function resourceError(operation: string, cause: unknown): OEMError {
  return cause instanceof OEMError ? cause : new OEMError('RESOURCE_FAILED', operation,
    cause instanceof Error ? cause.message : String(cause), undefined, { cause });
}
