import type { ShakespeareApi } from "@shakespeare/shared";
import { IpcCallError } from "../../lib/ipc-result.js";

export type EditorApi = Pick<
  ShakespeareApi,
  "updateBinderNode" | "flushBinderContent"
>;

const SAFE_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR:
    "El contenido no tiene un formato válido y no se guardó. Tu texto sigue en el editor.",
  NOT_FOUND:
    "Este documento ya no está disponible. Vuelve a abrir el proyecto para actualizar la vista.",
  INVALID_OPERATION:
    "El documento no admite este cambio. Tu texto sigue en el editor.",
  CONFLICT:
    "Otro cambio entró en conflicto. Revisa el documento antes de volver a guardar.",
  INTERNAL_ERROR:
    "No se pudo guardar el documento. Tu texto sigue en el editor.",
};

export function describeEditorError(error: unknown): string {
  if (error instanceof IpcCallError) {
    return (
      SAFE_MESSAGES[error.code] ??
      "No se pudo guardar el documento. Tu texto sigue en el editor."
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "editor.unexpected_error",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return "No se pudo guardar el documento. Tu texto sigue en el editor.";
}
