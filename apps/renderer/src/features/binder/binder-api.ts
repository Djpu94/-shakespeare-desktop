import { IpcCallError } from "../../lib/ipc-result.js";

const SAFE_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Los datos del Binder no son válidos.",
  NOT_FOUND:
    "El elemento ya no está disponible. Vuelve a abrir el proyecto para actualizar la vista.",
  INVALID_OPERATION: "Esa operación no es válida para este elemento.",
  CONFLICT: "Otro cambio entró en conflicto. Vuelve a intentarlo.",
  INTERNAL_ERROR:
    "No se pudo guardar el cambio. La vista del Binder no se ha modificado.",
};

export function describeBinderError(error: unknown): string {
  if (error instanceof IpcCallError) {
    return SAFE_MESSAGES[error.code] ?? "No se pudo completar la operación.";
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "binder.unexpected_error",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return "No se pudo completar la operación. La vista del Binder no se ha modificado.";
}
