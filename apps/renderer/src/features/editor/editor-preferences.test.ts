import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_PREFERENCES,
  EDITOR_PREFERENCES_STORAGE_KEY,
  EditorPreferenceStore,
  clampEditorZoom,
} from "./editor-preferences.js";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    read: (key: string) => values.get(key),
  };
}

describe("editor preferences", () => {
  it("uses comfortable defaults per project", () => {
    const store = new EditorPreferenceStore(createStorage());
    expect(store.getPreferences("project-a")).toEqual(
      DEFAULT_EDITOR_PREFERENCES,
    );
    expect(store.getPreferences("project-b")).toEqual(
      DEFAULT_EDITOR_PREFERENCES,
    );
  });

  it("persists zoom and toolbar visibility independently per project", () => {
    const storage = createStorage();
    const store = new EditorPreferenceStore(storage);

    store.updatePreferences("project-a", { zoom: 130 });
    store.updatePreferences("project-a", { toolbarVisible: false });
    store.updatePreferences("project-b", { zoom: 90 });

    expect(store.getPreferences("project-a")).toEqual({
      zoom: 130,
      toolbarVisible: false,
    });
    expect(store.getPreferences("project-b")).toEqual({
      zoom: 90,
      toolbarVisible: true,
    });

    const persisted = storage.read(EDITOR_PREFERENCES_STORAGE_KEY);
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted ?? "{}")).toMatchObject({
      "project-a": { zoom: 130, toolbarVisible: false },
      "project-b": { zoom: 90, toolbarVisible: true },
    });
  });

  it("clamps zoom to the supported range and steps", () => {
    const store = new EditorPreferenceStore(createStorage());

    expect(clampEditorZoom(10)).toBe(80);
    expect(clampEditorZoom(500)).toBe(200);
    expect(clampEditorZoom(104)).toBe(100);
    expect(clampEditorZoom(106)).toBe(110);
    expect(clampEditorZoom(Number.NaN)).toBe(100);
    expect(store.updatePreferences("p", { zoom: 230 }).zoom).toBe(200);
  });

  it("falls back to defaults for corrupt or malformed storage", () => {
    const corrupt = new EditorPreferenceStore(
      createStorage({ [EDITOR_PREFERENCES_STORAGE_KEY]: "not-json" }),
    );
    expect(corrupt.getPreferences("p")).toEqual(DEFAULT_EDITOR_PREFERENCES);

    const malformed = new EditorPreferenceStore(
      createStorage({
        [EDITOR_PREFERENCES_STORAGE_KEY]: JSON.stringify({
          p: { zoom: "huge", toolbarVisible: "yes" },
        }),
      }),
    );
    expect(malformed.getPreferences("p")).toEqual(DEFAULT_EDITOR_PREFERENCES);

    const partial = new EditorPreferenceStore(
      createStorage({
        [EDITOR_PREFERENCES_STORAGE_KEY]: JSON.stringify({
          p: { zoom: 150 },
        }),
      }),
    );
    expect(partial.getPreferences("p")).toEqual({
      zoom: 150,
      toolbarVisible: true,
    });
  });
});
