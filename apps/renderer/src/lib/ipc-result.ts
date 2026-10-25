import type { IpcResult } from "@shakespeare/shared";

export class IpcCallError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IpcCallError";
  }
}

export function unwrapIpcResult<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new IpcCallError(result.error.code, result.error.message);
  }

  return result.value;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ha ocurrido un error inesperado.";
}
