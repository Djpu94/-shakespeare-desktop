import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { BinderNode, Project, ProjectMode } from "@shakespeare/shared";
import {
  BinderPanel,
  ResizableSplitPane,
  countBinderDescendants,
  isDocumentKind,
} from "./features/binder/index.js";
import {
  EditorPanel,
  EditorPreferenceStore,
  ScriveningsPane,
  collectScriveningsDocuments,
  useEditorPreferences,
  useEditorWorkspace,
  type ScriveningsHandle,
} from "./features/editor/index.js";
import { getErrorMessage, unwrapIpcResult } from "./lib/ipc-result.js";

type WorkspaceSection = "writing" | "characters" | "places" | "plot";
type DialogState =
  { kind: "mode-change"; mode: ProjectMode } | { kind: "assistant" };

const MODE_LABELS: Record<ProjectMode, string> = {
  fiction: "Ficción",
  simple: "Simple",
};

function getInitialDocument(nodes: BinderNode[]): BinderNode | undefined {
  return (
    nodes.find((node) => node.kind === "scene" || node.kind === "document") ??
    nodes.find((node) => isDocumentKind(node.kind))
  );
}

function isProjectMode(value: string): value is ProjectMode {
  return value === "fiction" || value === "simple";
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<BinderNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [scriveningsFolderId, setScriveningsFolderId] = useState<string | null>(
    null,
  );
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [newProjectMode, setNewProjectMode] = useState<ProjectMode>("simple");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMode, setSettingsMode] = useState<ProjectMode>("simple");
  const [section, setSection] = useState<WorkspaceSection>("writing");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scriveningsRef = useRef<ScriveningsHandle>(null);

  const preferenceStore = useMemo(
    () => new EditorPreferenceStore(window.localStorage),
    [],
  );
  const [editorPreferences, updateEditorPreferences] = useEditorPreferences(
    project?.id ?? null,
    preferenceStore,
  );

  const editor = useEditorWorkspace({
    api: window.shakespeare,
    onNodeUpdated: (updated) => {
      setNodes((current) =>
        current.map((node) => (node.id === updated.id ? updated : node)),
      );
    },
  });

  const editorRef = useRef(editor);
  editorRef.current = editor;
  const scriveningsFolderIdRef = useRef(scriveningsFolderId);
  scriveningsFolderIdRef.current = scriveningsFolderId;

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const editorNode =
    editor.activeNodeId === null
      ? null
      : (nodes.find((node) => node.id === editor.activeNodeId) ?? null);
  const selectedFolderChildCount =
    selectedNode?.kind === "folder"
      ? nodes.filter((node) => node.parentId === selectedNode.id).length
      : 0;
  const selectedFolderDescendantCount =
    selectedNode?.kind === "folder"
      ? countBinderDescendants(nodes, selectedNode.id)
      : 0;
  const selectedFolderDocumentCount =
    selectedNode?.kind === "folder"
      ? collectScriveningsDocuments(nodes, selectedNode.id).length
      : 0;

  useEffect(() => {
    let active = true;
    window.shakespeare
      .listProjects()
      .then((result) => {
        if (active) {
          setProjects(unwrapIpcResult(result));
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (
      selectedNodeId !== null &&
      !nodes.some((node) => node.id === selectedNodeId)
    ) {
      editorRef.current.discard();
      setSelectedNodeId(null);
      setScriveningsFolderId(null);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    const element = dialogRef.current;
    if (element === null) {
      return;
    }

    if (dialog !== null && !element.open) {
      element.showModal();
      element
        .querySelector<HTMLElement>("[data-dialog-initial-focus]")
        ?.focus();
    } else if (dialog === null && element.open) {
      element.close();
    }
  }, [dialog]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      const editorFlushed = editorRef.current.flushForClose();
      const scriveningsFlushed =
        scriveningsRef.current?.flushForClose() ?? true;
      if (!editorFlushed || !scriveningsFlushed) {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    function flushHiddenDocument(): void {
      if (document.visibilityState !== "hidden") {
        return;
      }
      void editorRef.current.saveNow();
      void scriveningsRef.current?.flush();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", flushHiddenDocument);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", flushHiddenDocument);
    };
  }, []);

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent): void {
      const isSave =
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "s";
      if (!isSave) {
        return;
      }
      event.preventDefault();
      if (scriveningsFolderIdRef.current !== null) {
        void scriveningsRef.current?.flush();
      } else {
        void editorRef.current.saveNow();
      }
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, []);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSaving(true);
    try {
      const created = unwrapIpcResult(
        await window.shakespeare.createProject({
          name: projectName,
          mode: newProjectMode,
        }),
      );
      setProjects((current) => [created, ...current]);
      setProject(created);
      setNodes([]);
      setSelectedNodeId(null);
      setScriveningsFolderId(null);
      setSettingsMode(created.mode);
      setSection("writing");
      setCreateProjectOpen(false);
      setProjectName("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function openProject(nextProject: Project) {
    setErrorMessage(null);
    setLoading(true);
    try {
      if (
        scriveningsFolderId !== null &&
        !(await (scriveningsRef.current?.flush() ?? Promise.resolve(true)))
      ) {
        return;
      }
      if (!(await editor.close())) {
        return;
      }

      const [loadedProject, loadedNodes] = await Promise.all([
        window.shakespeare.getProject(nextProject.id),
        window.shakespeare.listBinderNodes(nextProject.id),
      ]);
      const persistedProject = unwrapIpcResult(loadedProject);
      if (persistedProject === null) {
        throw new Error("No se encontró el proyecto seleccionado.");
      }
      const projectNodes = unwrapIpcResult(loadedNodes);
      const initialNode = getInitialDocument(projectNodes);
      setProject(persistedProject);
      setNodes(projectNodes);
      setSelectedNodeId(null);
      setScriveningsFolderId(null);
      setSettingsMode(persistedProject.mode);
      setSettingsOpen(false);
      setSection("writing");

      if (initialNode !== undefined) {
        const opened = await editor.open(initialNode);
        setSelectedNodeId(opened ? initialNode.id : null);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function returnToProjects() {
    setErrorMessage(null);
    if (
      scriveningsFolderId !== null &&
      !(await (scriveningsRef.current?.flush() ?? Promise.resolve(true)))
    ) {
      return;
    }
    if (!(await editor.close())) {
      return;
    }

    setProject(null);
    setNodes([]);
    setSelectedNodeId(null);
    setScriveningsFolderId(null);
    setSettingsOpen(false);
    setErrorMessage(null);
  }

  async function confirmModeChange() {
    if (project === null || dialog?.kind !== "mode-change") {
      return;
    }
    setErrorMessage(null);
    setSaving(true);
    try {
      const updated = unwrapIpcResult(
        await window.shakespeare.updateProject({
          projectId: project.id,
          mode: dialog.mode,
        }),
      );
      setProject(updated);
      setProjects((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSettingsMode(updated.mode);
      setSection("writing");
      setDialog(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleBinderSelection(node: BinderNode | null) {
    if (scriveningsFolderId !== null && node?.id !== scriveningsFolderId) {
      const flushed = await (scriveningsRef.current?.flush() ??
        Promise.resolve(true));
      if (!flushed) {
        return;
      }
      setScriveningsFolderId(null);
    }

    if (
      node !== null &&
      scriveningsFolderId === node.id &&
      node.kind === "folder"
    ) {
      setSelectedNodeId(node.id);
      setSection("writing");
      return;
    }

    const nextDocument =
      node !== null && isDocumentKind(node.kind) ? node : null;
    if (
      editor.activeNodeId !== null &&
      !nodes.some((candidate) => candidate.id === editor.activeNodeId)
    ) {
      editor.discard();
    }

    if (!(await editor.open(nextDocument))) {
      return;
    }

    setSelectedNodeId(node?.id ?? null);
    if (node !== null) {
      setSection("writing");
    }
  }

  function handleNodesChange(nextNodes: BinderNode[]) {
    setNodes(nextNodes);
  }

  function handleEditorNodeUpdated(updated: BinderNode) {
    setNodes((current) =>
      current.map((node) => (node.id === updated.id ? updated : node)),
    );
  }

  async function openScrivenings() {
    if (selectedNode?.kind !== "folder") {
      return;
    }
    if (!(await editor.close())) {
      return;
    }
    setScriveningsFolderId(selectedNode.id);
  }

  async function changeSection(nextSection: WorkspaceSection) {
    if (nextSection !== "writing" && scriveningsFolderId !== null) {
      const flushed = await (scriveningsRef.current?.flush() ??
        Promise.resolve(true));
      if (!flushed) {
        return;
      }
    }
    setSection(nextSection);
  }

  async function closeScrivenings() {
    const flushed = await (scriveningsRef.current?.flush() ??
      Promise.resolve(true));
    if (!flushed) {
      return;
    }
    setScriveningsFolderId(null);
  }

  const fictionSections: {
    id: Exclude<WorkspaceSection, "writing">;
    label: string;
  }[] = [
    { id: "characters", label: "Personajes" },
    { id: "places", label: "Lugares" },
    { id: "plot", label: "Trama" },
  ];

  return (
    <main
      className={
        project === null ? "app-shell" : "app-shell app-shell--workspace"
      }
    >
      <header className="app-header">
        <div>
          <p className="eyebrow">Tu espacio de escritura</p>
          <h1>Shakespeare</h1>
        </div>
        {project !== null && (
          <div className="header-project">
            <span>{project.name}</span>
            <span className="mode-badge">{MODE_LABELS[project.mode]}</span>
          </div>
        )}
      </header>

      {errorMessage !== null && (
        <p className="error-message" role="alert">
          {errorMessage}
        </p>
      )}

      {project === null ? (
        <section className="projects-home" aria-labelledby="projects-heading">
          <div className="section-heading">
            <div>
              <h2 id="projects-heading">Tus proyectos</h2>
              <p className="description">
                Crea un espacio para escribir o vuelve a uno de tus proyectos.
              </p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => setCreateProjectOpen((isOpen) => !isOpen)}
            >
              {createProjectOpen ? "Cancelar" : "Crear un proyecto"}
            </button>
          </div>

          {createProjectOpen && (
            <form className="project-form" onSubmit={createProject}>
              <label>
                Nombre del proyecto
                <input
                  autoFocus
                  maxLength={200}
                  required
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                />
              </label>
              <label>
                Modo de escritura
                <select
                  value={newProjectMode}
                  onChange={(event) => {
                    if (isProjectMode(event.target.value)) {
                      setNewProjectMode(event.target.value);
                    }
                  }}
                >
                  <option value="simple">Simple — escritura esencial</option>
                  <option value="fiction">
                    Ficción — escritura y organización de historias
                  </option>
                </select>
              </label>
              <button
                className="primary-button"
                disabled={saving}
                type="submit"
              >
                {saving ? "Creando…" : "Crear proyecto"}
              </button>
            </form>
          )}

          {loading ? (
            <p role="status">Cargando proyectos…</p>
          ) : projects.length > 0 ? (
            <ul className="project-list">
              {projects.map((item) => (
                <li className="project-card" key={item.id}>
                  <div>
                    <h3>{item.name}</h3>
                    <span className="mode-badge">{MODE_LABELS[item.mode]}</span>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={loading}
                    type="button"
                    onClick={() => void openProject(item)}
                  >
                    Abrir {item.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !createProjectOpen &&
            errorMessage === null && (
              <p className="empty-state">
                Todavía no tienes proyectos. Crea uno para empezar a escribir.
              </p>
            )
          )}
        </section>
      ) : (
        <section className="workspace" aria-label={`Proyecto ${project.name}`}>
          <div className="workspace-toolbar">
            <button
              className="text-button"
              type="button"
              onClick={() => void returnToProjects()}
            >
              ← Todos los proyectos
            </button>
            <div className="toolbar-actions">
              {project.mode === "fiction" && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setDialog({ kind: "assistant" })}
                >
                  Abrir asistente
                </button>
              )}
              <button
                className="secondary-button"
                type="button"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((isOpen) => !isOpen)}
              >
                Ajustes
              </button>
            </div>
          </div>

          {settingsOpen && (
            <section
              className="settings-panel"
              aria-labelledby="settings-heading"
            >
              <div>
                <h2 id="settings-heading">Ajustes del proyecto</h2>
                <p>Cambiar el modo conserva tus nodos, escenas y contenido.</p>
              </div>
              <label>
                Modo de escritura
                <select
                  value={settingsMode}
                  onChange={(event) =>
                    setSettingsMode(event.target.value as ProjectMode)
                  }
                >
                  <option value="simple">Simple</option>
                  <option value="fiction">Ficción</option>
                </select>
              </label>
              <button
                className="primary-button"
                disabled={saving || settingsMode === project.mode}
                type="button"
                onClick={() =>
                  setDialog({ kind: "mode-change", mode: settingsMode })
                }
              >
                Cambiar modo
              </button>
            </section>
          )}

          <ResizableSplitPane
            label="Ajustar el ancho del Binder"
            primary={
              <aside aria-label="Panel del proyecto" className="sidebar">
                <nav
                  className="section-nav"
                  aria-label="Secciones del proyecto"
                >
                  <button
                    aria-current={section === "writing" ? "page" : undefined}
                    className={
                      section === "writing" ? "nav-item is-active" : "nav-item"
                    }
                    type="button"
                    onClick={() => void changeSection("writing")}
                  >
                    Escritura
                  </button>
                  {project.mode === "fiction" &&
                    fictionSections.map((item) => (
                      <button
                        aria-current={section === item.id ? "page" : undefined}
                        className={
                          section === item.id
                            ? "nav-item is-active"
                            : "nav-item"
                        }
                        key={item.id}
                        type="button"
                        onClick={() => void changeSection(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                </nav>

                <BinderPanel
                  api={window.shakespeare}
                  key={project.id}
                  nodes={nodes}
                  onNodesChange={handleNodesChange}
                  onSelectionChange={(node) => {
                    void handleBinderSelection(node);
                  }}
                  projectId={project.id}
                  projectMode={project.mode}
                  selectedNodeId={selectedNodeId}
                />
              </aside>
            }
            primaryId="binder-panel"
            secondary={
              <div className="editor-area">
                {section === "writing" ? (
                  selectedNode?.kind === "folder" ? (
                    scriveningsFolderId === selectedNode.id ? (
                      <ScriveningsPane
                        api={window.shakespeare}
                        folder={selectedNode}
                        nodes={nodes}
                        onClose={() => void closeScrivenings()}
                        onNodeUpdated={handleEditorNodeUpdated}
                        ref={scriveningsRef}
                        zoom={editorPreferences.zoom}
                      />
                    ) : (
                      <section
                        aria-labelledby="folder-overview-title"
                        className="folder-overview"
                      >
                        <p className="eyebrow">Carpeta</p>
                        <h2 id="folder-overview-title">{selectedNode.title}</h2>
                        <p>
                          Esta carpeta organiza el Binder y no se edita como un
                          documento. Selecciona una escena, un documento o un
                          elemento de investigación para abrirlo en el editor.
                        </p>
                        <dl className="folder-stats">
                          <div>
                            <dt>Elementos directos</dt>
                            <dd>{selectedFolderChildCount}</dd>
                          </div>
                          <div>
                            <dt>Descendientes</dt>
                            <dd>{selectedFolderDescendantCount}</dd>
                          </div>
                          <div>
                            <dt>Documentos en Scrivenings</dt>
                            <dd>{selectedFolderDocumentCount}</dd>
                          </div>
                        </dl>
                        <div className="folder-overview-actions">
                          <button
                            className="primary-button"
                            disabled={selectedFolderDocumentCount === 0}
                            onClick={() => void openScrivenings()}
                            type="button"
                          >
                            Abrir Scrivenings
                          </button>
                          <p className="description">
                            Lee y edita juntos los documentos de esta carpeta.
                            Cada cambio se guarda en su documento original.
                          </p>
                        </div>
                      </section>
                    )
                  ) : editorNode !== null && editor.document !== null ? (
                    <EditorPanel
                      autosave={editor.autosave}
                      document={editor.document}
                      initialCursor={editor.getCursor(editorNode.id)}
                      key={editorNode.id}
                      node={editorNode}
                      onChange={editor.update}
                      onContentError={editor.reportContentError}
                      onCursorChange={(cursor) =>
                        editor.setCursor(editorNode.id, cursor)
                      }
                      onRetry={() => void editor.retry()}
                      onSaveNow={() => void editor.saveNow()}
                      onToggleToolbar={() =>
                        updateEditorPreferences({
                          toolbarVisible: !editorPreferences.toolbarVisible,
                        })
                      }
                      onZoomChange={(zoom) => updateEditorPreferences({ zoom })}
                      toolbarVisible={editorPreferences.toolbarVisible}
                      workspaceError={editor.contentError}
                      zoom={editorPreferences.zoom}
                    />
                  ) : (
                    <>
                      {editor.contentError !== null && (
                        <p className="error-message" role="alert">
                          {editor.contentError}
                        </p>
                      )}
                      <div className="empty-editor">
                        <h2>Tu manuscrito empieza aquí</h2>
                        <p>
                          Crea una carpeta, una escena o un documento desde el
                          Binder para comenzar a escribir.
                        </p>
                      </div>
                    </>
                  )
                ) : (
                  <section className="coming-soon" aria-live="polite">
                    <p className="eyebrow">Organización de ficción</p>
                    <h2>
                      {
                        fictionSections.find((item) => item.id === section)
                          ?.label
                      }
                    </h2>
                    <p>
                      Esta sección estará disponible próximamente. Tu manuscrito
                      y su contenido siguen intactos.
                    </p>
                  </section>
                )}
              </div>
            }
          />
        </section>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="confirmation-title"
        onCancel={(event) => {
          event.preventDefault();
          setDialog(null);
        }}
      >
        {dialog?.kind === "mode-change" ? (
          <div className="dialog-content">
            <h2 id="confirmation-title">¿Cambiar el modo de escritura?</h2>
            <p>
              El proyecto cambiará al modo {MODE_LABELS[dialog.mode]}. Tus
              nodos, escenas y todo su contenido se conservarán.
            </p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                data-dialog-initial-focus
                disabled={saving}
                type="button"
                onClick={() => setDialog(null)}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={saving}
                type="button"
                onClick={() => void confirmModeChange()}
              >
                {saving ? "Cambiando…" : "Confirmar cambio"}
              </button>
            </div>
          </div>
        ) : dialog?.kind === "assistant" ? (
          <div className="dialog-content">
            <h2 id="confirmation-title">Asistente de escritura</h2>
            <p>
              El punto de entrada del asistente está disponible en modo Ficción.
              Sus herramientas se incorporarán próximamente.
            </p>
            <div className="dialog-actions">
              <button
                className="primary-button"
                data-dialog-initial-focus
                type="button"
                onClick={() => setDialog(null)}
              >
                Entendido
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </main>
  );
}
