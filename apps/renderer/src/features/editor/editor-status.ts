import type { AutosaveStatus } from "./autosave-controller.js";

export const EDITOR_STATUS_LABELS: Record<AutosaveStatus, string> = {
  saved: "Guardado",
  pending: "Cambios sin guardar",
  saving: "Guardando…",
  error: "Error al guardar",
};
