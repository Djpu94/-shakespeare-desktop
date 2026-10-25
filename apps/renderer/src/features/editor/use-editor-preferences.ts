import { useCallback, useEffect, useState } from "react";
import type {
  EditorPreferences,
  EditorPreferenceStore,
} from "./editor-preferences.js";

export function useEditorPreferences(
  projectId: string | null,
  store: EditorPreferenceStore,
): [EditorPreferences, (patch: Partial<EditorPreferences>) => void] {
  const [preferences, setPreferences] = useState<EditorPreferences>(() =>
    store.getPreferences(projectId ?? ""),
  );

  useEffect(() => {
    setPreferences(store.getPreferences(projectId ?? ""));
  }, [projectId, store]);

  const updatePreferences = useCallback(
    (patch: Partial<EditorPreferences>) => {
      if (projectId === null) {
        return;
      }
      setPreferences(store.updatePreferences(projectId, patch));
    },
    [projectId, store],
  );

  return [preferences, updatePreferences];
}
