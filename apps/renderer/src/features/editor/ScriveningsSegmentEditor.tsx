import { useEffect, useRef, useState } from "react";
import type { BinderNode, RichTextDocument } from "@shakespeare/shared";
import {
  RichTextContentError,
  countRichTextWords,
  serializeRichTextContent,
} from "@shakespeare/shared";
import { unwrapIpcResult } from "../../lib/ipc-result.js";
import {
  AutosaveController,
  type AutosaveState,
} from "./autosave-controller.js";
import type { EditorCursor } from "./cursor-position.js";
import type { EditorApi } from "./editor-api.js";
import { describeEditorError } from "./editor-api.js";
import { EDITOR_STATUS_LABELS } from "./editor-status.js";
import { RichTextEditor } from "./RichTextEditor.js";
import type { ScriveningsSegment } from "./scrivenings.js";

export interface ScriveningsSegmentHandle {
  flush(): Promise<boolean>;
  flushForClose(): boolean;
  hasPendingChanges(): boolean;
}

interface ScriveningsSegmentEditorProps {
  segment: ScriveningsSegment;
  index: number;
  api: EditorApi;
  zoom: number;
  describedBy: string;
  initialCursor: EditorCursor | null;
  onCursorChange(cursor: EditorCursor): void;
  onNodeUpdated(node: BinderNode): void;
  registerHandle(nodeId: string, handle: ScriveningsSegmentHandle | null): void;
}

const INITIAL_STATE: AutosaveState = {
  documentId: null,
  status: "saved",
  errorMessage: null,
  hasPendingChanges: false,
};

function ignoreFormatting(): void {
  // Scrivenings relies on keyboard shortcuts; no toolbar state is displayed.
}

function describeContentError(error: unknown): string {
  if (error instanceof RichTextContentError) {
    return error.code === "CONTENT_TOO_LARGE"
      ? "Este documento supera el tamaño máximo del editor. Reduce su extensión."
      : "Este documento contiene una estructura que no se puede guardar.";
  }
  console.error(
    JSON.stringify({
      level: "error",
      event: "editor.scrivenings_parse_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return "No se pudo preparar este documento para editarlo.";
}

/**
 * One editable segment of a Scrivenings view. Its autosave controller is bound
 * to the original node id, so editing a segment can only write that scene.
 */
export function ScriveningsSegmentEditor({
  segment,
  index,
  api,
  zoom,
  describedBy,
  initialCursor,
  onCursorChange,
  onNodeUpdated,
  registerHandle,
}: ScriveningsSegmentEditorProps) {
  const [document, setDocument] = useState<RichTextDocument>(segment.document);
  const [autosave, setAutosave] = useState<AutosaveState>(INITIAL_STATE);
  const [contentError, setContentError] = useState<string | null>(null);
  const controllerRef = useRef<AutosaveController | null>(null);

  const apiRef = useRef(api);
  apiRef.current = api;
  const onNodeUpdatedRef = useRef(onNodeUpdated);
  onNodeUpdatedRef.current = onNodeUpdated;
  const registerHandleRef = useRef(registerHandle);
  registerHandleRef.current = registerHandle;

  const nodeId = segment.node.id;
  const title = segment.node.title;

  useEffect(() => {
    let initialSerialized: string;
    try {
      initialSerialized = serializeRichTextContent(segment.document);
    } catch (error) {
      setContentError(describeContentError(error));
      return;
    }

    const controller = new AutosaveController({
      save: async ({ nodeId: targetId, content }) => {
        const updated = unwrapIpcResult(
          await apiRef.current.updateBinderNode({
            nodeId: targetId,
            content,
          }),
        );
        onNodeUpdatedRef.current(updated);
      },
      saveSync: ({ nodeId: targetId, content }) => {
        const updated = unwrapIpcResult(
          apiRef.current.flushBinderContent({
            nodeId: targetId,
            content,
          }),
        );
        onNodeUpdatedRef.current(updated);
      },
      debounceMs: 800,
      describeError: describeEditorError,
      onStateChange: setAutosave,
    });

    controllerRef.current = controller;
    controller.openDocument(nodeId, initialSerialized);
    setAutosave(controller.getState());
    registerHandleRef.current(nodeId, {
      flush: () => controller.flush(),
      flushForClose: () => controller.flushForClose(),
      hasPendingChanges: () => controller.hasPendingChanges(),
    });

    return () => {
      registerHandleRef.current(nodeId, null);
      controllerRef.current = null;
      // Safety net for an unexpected unmount: let the pending write finish.
      void controller.flush().finally(() => controller.dispose());
    };
    // Each component instance is keyed by node id and owns one document.
  }, []);

  function handleChange(nextDocument: RichTextDocument): void {
    setDocument(nextDocument);
    try {
      const serialized = serializeRichTextContent(nextDocument);
      setContentError(null);
      controllerRef.current?.update(serialized);
    } catch (error) {
      setContentError(describeContentError(error));
    }
  }

  function handleRetry(): void {
    void controllerRef.current?.flush();
  }

  const wordCount = countRichTextWords(document);
  const errorMessage = contentError ?? autosave.errorMessage;

  return (
    <article
      aria-label={`Documento ${index + 1}: ${title}`}
      className="scrivenings-segment"
      data-node-id={nodeId}
    >
      <header className="scrivenings-segment-header">
        <div>
          <p className="eyebrow">Documento {index + 1}</p>
          <h3>{title}</h3>
        </div>
        <span
          aria-live="polite"
          className={`editor-save-status editor-save-status--${autosave.status}`}
          role="status"
        >
          {EDITOR_STATUS_LABELS[autosave.status]}
        </span>
      </header>

      <div className="editor-reading-column editor-reading-column--compact">
        <RichTextEditor
          ariaLabel={`Contenido de ${title} (Scrivenings)`}
          describedBy={describedBy}
          documentId={nodeId}
          initialCursor={initialCursor}
          initialDocument={document}
          onChange={handleChange}
          onContentError={setContentError}
          onCursorChange={onCursorChange}
          onFormattingChange={ignoreFormatting}
          title={title}
          zoom={zoom}
        />
      </div>

      <p className="scrivenings-segment-footer">
        {wordCount === 1 ? "1 palabra" : `${wordCount} palabras`}
      </p>

      {errorMessage !== null && (
        <div className="editor-error" role="alert">
          <p>{errorMessage}</p>
          {autosave.status === "error" && (
            <button
              className="secondary-button"
              onClick={handleRetry}
              type="button"
            >
              Reintentar
            </button>
          )}
        </div>
      )}
    </article>
  );
}
