export interface EditorPreferences {
  readonly zoom: number;
  readonly toolbarVisible: boolean;
}

export interface EditorPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EDITOR_ZOOM_MIN = 80;
export const EDITOR_ZOOM_MAX = 200;
export const EDITOR_ZOOM_STEP = 10;
export const EDITOR_PREFERENCES_STORAGE_KEY =
  "shakespeare.editor.preferences.v1";

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  zoom: 100,
  toolbarVisible: true,
};

export function clampEditorZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return DEFAULT_EDITOR_PREFERENCES.zoom;
  }
  const stepped = Math.round(zoom / EDITOR_ZOOM_STEP) * EDITOR_ZOOM_STEP;
  return Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, stepped));
}

type StoredPreferences = Record<string, Partial<EditorPreferences>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPreferences(value: unknown): EditorPreferences {
  if (!isRecord(value)) {
    return DEFAULT_EDITOR_PREFERENCES;
  }

  const zoom =
    typeof value.zoom === "number"
      ? clampEditorZoom(value.zoom)
      : DEFAULT_EDITOR_PREFERENCES.zoom;
  const toolbarVisible =
    typeof value.toolbarVisible === "boolean"
      ? value.toolbarVisible
      : DEFAULT_EDITOR_PREFERENCES.toolbarVisible;

  return { zoom, toolbarVisible };
}

/**
 * Per-project editor preferences (text zoom and optional formatting bar).
 * These are interface preferences, not manuscript data, so they live in the
 * renderer's local storage and never touch the project database.
 */
export class EditorPreferenceStore {
  constructor(
    private readonly storage: EditorPreferencesStorage,
    private readonly storageKey = EDITOR_PREFERENCES_STORAGE_KEY,
  ) {}

  getPreferences(projectId: string): EditorPreferences {
    const all = this.readAll();
    return readPreferences(all[projectId]);
  }

  updatePreferences(
    projectId: string,
    patch: Partial<EditorPreferences>,
  ): EditorPreferences {
    const all = this.readAll();
    const current = readPreferences(all[projectId]);
    const next = readPreferences({
      zoom: patch.zoom ?? current.zoom,
      toolbarVisible: patch.toolbarVisible ?? current.toolbarVisible,
    });

    all[projectId] = next;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(all));
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "editor.preferences_storage_failed",
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      );
    }

    return next;
  }

  private readAll(): StoredPreferences {
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.storageKey);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "editor.preferences_read_failed",
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      return {};
    }

    if (raw === null) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? (parsed as StoredPreferences) : {};
    } catch {
      return {};
    }
  }
}
