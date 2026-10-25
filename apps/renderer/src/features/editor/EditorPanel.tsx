import { useRef, useState } from "react";
import type { BinderNode, RichTextDocument } from "@shakespeare/shared";
import { countRichTextWords } from "@shakespeare/shared";
import type { AutosaveState } from "./autosave-controller.js";
import type { EditorCommand } from "./editor-commands.js";
import { getEditorShortcutHelp } from "./editor-commands.js";
import { EDITOR_STATUS_LABELS } from "./editor-status.js";
import {
  EDITOR_ZOOM_MAX,
  EDITOR_ZOOM_MIN,
  EDITOR_ZOOM_STEP,
  clampEditorZoom,
} from "./editor-preferences.js";
import type { EditorCursor } from "./cursor-position.js";
import { getBinderKindLabel } from "../binder/binder-types.js";
import { EditorToolbar } from "./EditorToolbar.js";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor.js";
import type { EditorFormattingState } from "./rich-text-dom.js";
import {
  EMPTY_FORMATTING_STATE,
  areFormattingStatesEqual,
} from "./rich-text-dom.js";

interface EditorPanelProps {
  node: BinderNode;
  document: RichTextDocument;
  autosave: AutosaveState;
  workspaceError: string | null;
  zoom: number;
  toolbarVisible: boolean;
  initialCursor: EditorCursor | null;
  onChange(document: RichTextDocument): void;
  onCursorChange(cursor: EditorCursor): void;
  onSaveNow(): void;
  onRetry(): void;
  onToggleToolbar(): void;
  onZoomChange(zoom: number): void;
  onContentError(message: string): void;
}

export function EditorPanel({
  node,
  document,
  autosave,
  workspaceError,
  zoom,
  toolbarVisible,
  initialCursor,
  onChange,
  onCursorChange,
  onSaveNow,
  onRetry,
  onToggleToolbar,
  onZoomChange,
  onContentError,
}: EditorPanelProps) {
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [formatting, setFormatting] = useState<EditorFormattingState>(
    EMPTY_FORMATTING_STATE,
  );
  const [contentError, setContentError] = useState<string | null>(null);

  const surfaceId = `editor-surface-${node.id}`;
  const shortcutsId = `editor-shortcuts-${node.id}`;
  const wordCount = countRichTextWords(document);
  const errorMessage = contentError ?? workspaceError ?? autosave.errorMessage;

  function handleFormattingChange(next: EditorFormattingState): void {
    setFormatting((current) =>
      areFormattingStatesEqual(current, next) ? current : next,
    );
  }

  function handleCommand(command: EditorCommand): void {
    editorRef.current?.applyCommand(command);
  }

  function handleContentError(message: string): void {
    setContentError(message);
    onContentError(message);
  }

  function handleChange(nextDocument: RichTextDocument): void {
    setContentError(null);
    onChange(nextDocument);
  }

  return (
    <section
      aria-labelledby="editor-document-title"
      aria-busy={autosave.status === "saving"}
      className="editor"
    >
      <div className="editor-heading">
        <div>
          <p className="eyebrow">{getBinderKindLabel(node.kind)}</p>
          <h2 className="editor-title" id="editor-document-title">
            {node.title}
          </h2>
        </div>
        <span className="mode-badge">{getBinderKindLabel(node.kind)}</span>
      </div>

      <div className="editor-toolbar-row">
        <button
          aria-controls={surfaceId}
          aria-expanded={toolbarVisible}
          className="secondary-button editor-bar-toggle"
          onClick={onToggleToolbar}
          type="button"
        >
          {toolbarVisible ? "Ocultar barra" : "Mostrar barra"}
        </button>

        <div aria-label="Zoom del texto" className="editor-zoom" role="group">
          <button
            aria-label="Reducir el tamaño del texto"
            className="secondary-button editor-zoom-button"
            disabled={zoom <= EDITOR_ZOOM_MIN}
            onClick={() =>
              onZoomChange(clampEditorZoom(zoom - EDITOR_ZOOM_STEP))
            }
            type="button"
          >
            A−
          </button>
          <output aria-live="polite" className="editor-zoom-value">
            {zoom}%
          </output>
          <button
            aria-label="Aumentar el tamaño del texto"
            className="secondary-button editor-zoom-button"
            disabled={zoom >= EDITOR_ZOOM_MAX}
            onClick={() =>
              onZoomChange(clampEditorZoom(zoom + EDITOR_ZOOM_STEP))
            }
            type="button"
          >
            A+
          </button>
          <button
            className="text-button editor-zoom-reset"
            disabled={zoom === 100}
            onClick={() => onZoomChange(100)}
            type="button"
          >
            Restablecer
          </button>
        </div>

        <button
          aria-keyshortcuts="Control+S"
          className="primary-button editor-save-button"
          disabled={autosave.status === "saving" || !autosave.hasPendingChanges}
          onClick={onSaveNow}
          type="button"
        >
          Guardar ahora
        </button>
      </div>

      {toolbarVisible && (
        <EditorToolbar
          controlsId={surfaceId}
          formatting={formatting}
          onCommand={handleCommand}
        />
      )}

      <p className="editor-shortcuts" id={shortcutsId}>
        Atajos: {getEditorShortcutHelp()} · Ctrl+S guarda ahora.
      </p>

      <div className="editor-reading-column">
        <RichTextEditor
          describedBy={shortcutsId}
          documentId={node.id}
          initialCursor={initialCursor}
          initialDocument={document}
          key={node.id}
          onChange={handleChange}
          onContentError={handleContentError}
          onCursorChange={onCursorChange}
          onFormattingChange={handleFormattingChange}
          ref={editorRef}
          title={node.title}
          zoom={zoom}
        />
      </div>

      {errorMessage !== null && (
        <div className="editor-error" role="alert">
          <p>{errorMessage}</p>
          {autosave.status === "error" && (
            <button
              className="secondary-button"
              onClick={onRetry}
              type="button"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      <div className="editor-footer">
        <span>
          {getBinderKindLabel(node.kind)} ·{" "}
          {wordCount === 1 ? "1 palabra" : `${wordCount} palabras`}
        </span>
        <span
          aria-live="polite"
          className={`editor-save-status editor-save-status--${autosave.status}`}
          role="status"
        >
          {EDITOR_STATUS_LABELS[autosave.status]}
        </span>
      </div>
    </section>
  );
}
