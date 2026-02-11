export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function unwrapResult<T>(result: IPCResult<T>): T {
  if (!result.success) {
    throw new AppError(
      result.error?.code ?? 'UNKNOWN',
      result.error?.message ?? 'An unknown error occurred',
    );
  }
  return result.data as T;
}
