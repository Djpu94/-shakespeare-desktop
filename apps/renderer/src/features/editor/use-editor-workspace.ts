import { useEffect, useRef, useState } from "react";
import type { BinderNode, RichTextDocument } from "@shakespeare/shared";
import {
  RichTextContentError,
  parseRichTextContent,
  serializeRichTextContent,
} from "@shakespeare/shared";
import { unwrapIpcResult } from "../../lib/ipc-result.js";
import {
  AutosaveController,
  AutosaveStateError,
  type AutosaveState,
} from "./autosave-controller.js";
import { EditorCursorStore, type EditorCursor } from "./cursor-position.js";
import type { EditorApi } from "./editor-api.js";
import { describeEditorError } from "./editor-api.js";

export interface EditorWorkspaceOptions {
  api: EditorApi;
  onNodeUpdated(node: BinderNode): void;
}

export interface EditorWorkspace {
  readonly activeNodeId: string | null;
  readonly document: RichTextDocument | null;
  readonly autosave: AutosaveState;
  readonly contentError: string | null;
  open(node: BinderNode | null): Promise<boolean>;
  close(): Promise<boolean>;
  discard(): void;
  update(document: RichTextDocument): void;
  saveNow(): Promise<boolean>;
  retry(): Promise<boolean>;
  flushForClose(): boolean;
  hasPendingChanges(): boolean;
  getCursor(nodeId: string): EditorCursor | null;
  setCursor(nodeId: string, cursor: EditorCursor): void;
  reportContentError(message: string): void;
  clearContentError(): void;
}

async function flushUntilStable(
  controller: AutosaveController,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await controller.flush())) {
      return false;
    }
    if (!controller.hasPendingChanges()) {
      return true;
    }
  }
  return !controller.hasPendingChanges();
}

function describeLoadError(error: unknown): string {
  if (error instanceof RichTextContentError) {
    return error.code === "CONTENT_TOO_LARGE"
      ? "El documento es demasiado grande para abrirlo en el editor. El contenido guardado no se ha modificado."
      : "El contenido guardado de este documento no tiene un formato válido y no se abrió para evitar sobrescribirlo.";
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "editor.document_open_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return "No se pudo abrir el documento. El contenido guardado no se ha modificado.";
}

function describeSerializationError(error: unknown): string {
  if (error instanceof RichTextContentError) {
    return error.code === "CONTENT_TOO_LARGE"
      ? "El texto supera el tamaño máximo que puede guardar el editor. Reduce su extensión antes de cambiar de documento o cerrar."
      : "El texto contiene una estructura que no se puede guardar. Reduce o revisa el contenido.";
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "editor.document_serialize_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return "No se pudo preparar el documento para guardarlo. El texto sigue en el editor.";
}

/**
 * Owns the active editor document and its autosave engine. All document
 * transitions are serialised: a new document is opened only after the previous
 * pending save resolves, so writes can never be mixed between scenes.
 */
export function useEditorWorkspace({
  api,
  onNodeUpdated,
}: EditorWorkspaceOptions): EditorWorkspace {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [document, setDocument] = useState<RichTextDocument | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const apiRef = useRef(api);
  apiRef.current = api;
  const onNodeUpdatedRef = useRef(onNodeUpdated);
  onNodeUpdatedRef.current = onNodeUpdated;

  const cursorStoreRef = useRef(new EditorCursorStore());
  const transitionChainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const unserializableChangesRef = useRef(false);
  const [autosave, setAutosave] = useState<AutosaveState>(() => ({
    documentId: null,
    status: "saved",
    errorMessage: null,
    hasPendingChanges: false,
  }));

  const controllerRef = useRef<AutosaveController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new AutosaveController({
      save: async ({ nodeId, content }) => {
        const updated = unwrapIpcResult(
          await apiRef.current.updateBinderNode({ nodeId, content }),
        );
        onNodeUpdatedRef.current(updated);
      },
      saveSync: ({ nodeId, content }) => {
        const updated = unwrapIpcResult(
          apiRef.current.flushBinderContent({ nodeId, content }),
        );
        onNodeUpdatedRef.current(updated);
      },
      debounceMs: 800,
      describeError: describeEditorError,
      onStateChange: setAutosave,
    });
  }

  useEffect(
    () => () => {
      controllerRef.current?.dispose();
    },
    [],
  );

  function enqueueTransition(
    operation: () => Promise<boolean>,
  ): Promise<boolean> {
    const run = transitionChainRef.current.then(operation, operation);
    transitionChainRef.current = run.then(
      () => true,
      () => false,
    );
    return run;
  }

  function openNode(node: BinderNode): Promise<boolean> {
    return enqueueTransition(async () => {
      const controller = controllerRef.current;
      if (controller === null) {
        return false;
      }
      if (unserializableChangesRef.current) {
        return false;
      }
      if (controller.getDocumentId() === node.id) {
        setContentError(null);
        return true;
      }

      let nextDocument: RichTextDocument;
      let serialized: string;
      try {
        nextDocument = parseRichTextContent(node.content);
        serialized = serializeRichTextContent(nextDocument);
      } catch (error) {
        setContentError(describeLoadError(error));
        return false;
      }

      const flushed = await flushUntilStable(controller);
      if (!flushed || unserializableChangesRef.current) {
        // The previous document keeps its error state; do not switch.
        return false;
      }

      try {
        controller.openDocument(node.id, serialized);
      } catch (error) {
        if (error instanceof AutosaveStateError) {
          return false;
        }
        throw error;
      }
      setActiveNodeId(node.id);
      setDocument(nextDocument);
      setContentError(null);
      return true;
    });
  }

  function closeDocument(): Promise<boolean> {
    return enqueueTransition(async () => {
      const controller = controllerRef.current;
      if (controller === null) {
        return true;
      }
      if (unserializableChangesRef.current) {
        return false;
      }
      const flushed = await flushUntilStable(controller);
      if (!flushed || unserializableChangesRef.current) {
        return false;
      }
      try {
        controller.close();
      } catch (error) {
        if (error instanceof AutosaveStateError) {
          return false;
        }
        throw error;
      }
      setActiveNodeId(null);
      setDocument(null);
      setContentError(null);
      return true;
    });
  }

  function discardDocument(): void {
    const controller = controllerRef.current;
    if (controller === null) {
      return;
    }
    unserializableChangesRef.current = false;
    controller.close({ discard: true });
    setActiveNodeId(null);
    setDocument(null);
    setContentError(null);
  }

  function updateDocument(nextDocument: RichTextDocument): void {
    const controller = controllerRef.current;
    if (controller === null) {
      return;
    }

    setDocument(nextDocument);
    try {
      const serialized = serializeRichTextContent(nextDocument);
      setContentError(null);
      unserializableChangesRef.current = false;
      controller.update(serialized);
    } catch (error) {
      unserializableChangesRef.current = true;
      setContentError(describeSerializationError(error));
    }
  }

  function reportContentError(message: string): void {
    unserializableChangesRef.current = true;
    setContentError(message);
  }

  async function flushDocument(): Promise<boolean> {
    const controller = controllerRef.current;
    if (controller === null) {
      return true;
    }
    return controller.flush();
  }

  return {
    activeNodeId,
    document,
    autosave,
    contentError,
    open: async (node) => (node === null ? closeDocument() : openNode(node)),
    close: closeDocument,
    discard: discardDocument,
    update: updateDocument,
    saveNow: flushDocument,
    retry: flushDocument,
    flushForClose: () =>
      !unserializableChangesRef.current &&
      (controllerRef.current?.flushForClose() ?? true),
    hasPendingChanges: () =>
      unserializableChangesRef.current ||
      (controllerRef.current?.hasPendingChanges() ?? false),
    getCursor: (nodeId) => cursorStoreRef.current.get(nodeId),
    setCursor: (nodeId, cursor) => cursorStoreRef.current.set(nodeId, cursor),
    reportContentError,
    clearContentError: () => setContentError(null),
  };
}
