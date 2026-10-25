import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import type { BinderNode } from "@shakespeare/shared";
import type { EditorCursor } from "./cursor-position.js";
import { EditorCursorStore } from "./cursor-position.js";
import type { EditorApi } from "./editor-api.js";
import { getEditorShortcutHelp } from "./editor-commands.js";
import type { ScriveningsSegmentHandle } from "./ScriveningsSegmentEditor.js";
import { ScriveningsSegmentEditor } from "./ScriveningsSegmentEditor.js";
import { buildScriveningsPlan, type ScriveningsPlan } from "./scrivenings.js";

export interface ScriveningsHandle {
  flush(): Promise<boolean>;
  flushForClose(): boolean;
  hasPendingChanges(): boolean;
}

interface ScriveningsPaneProps {
  folder: BinderNode;
  nodes: BinderNode[];
  api: EditorApi;
  zoom: number;
  onNodeUpdated(node: BinderNode): void;
  onClose(): void;
}

function describePlanError(error: unknown): string {
  console.error(
    JSON.stringify({
      level: "error",
      event: "editor.scrivenings_plan_failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  return "No se pudo abrir Scrivenings porque uno de los documentos no tiene un contenido válido. El contenido guardado no se ha modificado.";
}

/**
 * Combined view over a folder's documents. Each segment is connected to its
 * original `BinderNode` through its own autosave controller; there is no shared
 * text buffer that could leak edits into a neighbouring scene.
 */
export const ScriveningsPane = forwardRef<
  ScriveningsHandle,
  ScriveningsPaneProps
>(function ScriveningsPane(
  { folder, nodes, api, zoom, onNodeUpdated, onClose },
  ref,
) {
  const handlesRef = useRef(new Map<string, ScriveningsSegmentHandle>());
  const cursorStoreRef = useRef<EditorCursorStore>(new EditorCursorStore());
  const shortcutsId = `scrivenings-shortcuts-${folder.id}`;

  const planResult = useMemo((): {
    plan: ScriveningsPlan | null;
    error: string | null;
  } => {
    try {
      return {
        plan: buildScriveningsPlan(nodes, folder.id),
        error: null,
      };
    } catch (error) {
      return { plan: null, error: describePlanError(error) };
    }
  }, [nodes, folder.id]);

  useImperativeHandle(
    ref,
    () => ({
      async flush(): Promise<boolean> {
        const handles = [...handlesRef.current.values()];
        const results = await Promise.all(
          handles.map((handle) => handle.flush()),
        );
        return results.every(Boolean);
      },
      flushForClose(): boolean {
        let succeeded = true;
        for (const handle of handlesRef.current.values()) {
          if (!handle.flushForClose()) {
            succeeded = false;
          }
        }
        return succeeded;
      },
      hasPendingChanges(): boolean {
        return [...handlesRef.current.values()].some((handle) =>
          handle.hasPendingChanges(),
        );
      },
    }),
    [],
  );

  function registerHandle(
    nodeId: string,
    handle: ScriveningsSegmentHandle | null,
  ): void {
    if (handle === null) {
      handlesRef.current.delete(nodeId);
    } else {
      handlesRef.current.set(nodeId, handle);
    }
  }

  function getCursor(nodeId: string): EditorCursor | null {
    return cursorStoreRef.current.get(nodeId);
  }

  const plan = planResult.plan;

  return (
    <section aria-labelledby="scrivenings-title" className="scrivenings">
      <div className="scrivenings-header">
        <div>
          <p className="eyebrow">Scrivenings</p>
          <h2 id="scrivenings-title">{folder.title}</h2>
          <p className="description">
            Los segmentos se editan por separado y cada cambio se guarda en su
            documento original del Binder.
          </p>
        </div>
        <button className="secondary-button" onClick={onClose} type="button">
          Cerrar Scrivenings
        </button>
      </div>

      <p className="editor-shortcuts" id={shortcutsId}>
        Atajos en cada segmento: {getEditorShortcutHelp()} · Ctrl+S guarda
        ahora.
      </p>

      {planResult.error !== null && (
        <div className="editor-error" role="alert">
          <p>{planResult.error}</p>
        </div>
      )}

      {plan !== null && (
        <>
          <p className="scrivenings-summary" role="status">
            {plan.segments.length === 1
              ? "1 documento"
              : `${plan.segments.length} documentos`}{" "}
            · {plan.characterCount} caracteres · límite de {plan.documentLimit}{" "}
            documentos
          </p>

          {plan.isTruncated && (
            <p className="scrivenings-notice">
              Se muestran {plan.segments.length} de {plan.totalDocuments}{" "}
              documentos. {plan.omittedDocuments}{" "}
              {plan.omittedDocuments === 1
                ? "documento quedó fuera"
                : "documentos quedaron fuera"}{" "}
              por los límites de {plan.documentLimit} documentos y{" "}
              {plan.characterLimit} caracteres.
            </p>
          )}

          {plan.segments.length === 0 ? (
            <p className="empty-state">
              Esta carpeta todavía no contiene documentos que puedan mostrarse
              juntos. Crea una escena o un documento para empezar.
            </p>
          ) : (
            <div className="scrivenings-segments">
              {plan.segments.map((segment, index) => (
                <ScriveningsSegmentEditor
                  api={api}
                  describedBy={shortcutsId}
                  index={index}
                  initialCursor={getCursor(segment.node.id)}
                  key={segment.node.id}
                  onCursorChange={(cursor) =>
                    cursorStoreRef.current.set(segment.node.id, cursor)
                  }
                  onNodeUpdated={onNodeUpdated}
                  registerHandle={registerHandle}
                  segment={segment}
                  zoom={zoom}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
});
