import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { BinderNode, Project, ProjectMode } from "@shakespeare/shared";
import {
  BinderPanel,
  ResizableSplitPane,
  countBinderDescendants,
  getBinderKindLabel,
  isDocumentKind,
} from "./features/binder/index.js";
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
  const [draftContent, setDraftContent] = useState("");
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

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const editorNode =
    selectedNode !== null && isDocumentKind(selectedNode.kind)
      ? selectedNode
      : null;
  const selectedFolderChildCount =
    selectedNode?.kind === "folder"
      ? nodes.filter((node) => node.parentId === selectedNode.id).length
      : 0;
  const selectedFolderDescendantCount =
    selectedNode?.kind === "folder"
      ? countBinderDescendants(nodes, selectedNode.id)
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
      setSelectedNodeId(null);
      setDraftContent("");
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
      setDraftContent("");
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
      setSelectedNodeId(initialNode?.id ?? null);
      setDraftContent(initialNode?.content ?? "");
      setSettingsMode(persistedProject.mode);
      setSettingsOpen(false);
      setSection("writing");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editorNode === null) {
      return;
    }
    setErrorMessage(null);
    setSaving(true);
    try {
      const updated = unwrapIpcResult(
        await window.shakespeare.updateBinderNode({
          nodeId: editorNode.id,
          content: draftContent,
        }),
      );
      setNodes((current) =>
        current.map((node) => (node.id === updated.id ? updated : node)),
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
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

  function returnToProjects() {
    setProject(null);
    setNodes([]);
    setSelectedNodeId(null);
    setDraftContent("");
    setSettingsOpen(false);
    setErrorMessage(null);
  }

  function handleBinderSelection(node: BinderNode | null) {
    setSelectedNodeId(node?.id ?? null);
    setDraftContent(
      node !== null && isDocumentKind(node.kind) ? (node.content ?? "") : "",
    );
    if (node !== null) {
      setSection("writing");
    }
  }

  function handleNodesChange(nextNodes: BinderNode[]) {
    setNodes(nextNodes);
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
              onClick={returnToProjects}
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
                    onClick={() => setSection("writing")}
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
                        onClick={() => setSection(item.id)}
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
                  onSelectionChange={handleBinderSelection}
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
                  editorNode !== null ? (
                    <form className="editor" onSubmit={saveContent}>
                      <div className="editor-heading">
                        <label className="editor-title" htmlFor="node-content">
                          {editorNode.title}
                        </label>
                        <span className="mode-badge">
                          {getBinderKindLabel(editorNode.kind)}
                        </span>
                      </div>
                      <textarea
                        id="node-content"
                        aria-label={`Contenido de ${editorNode.title}`}
                        placeholder="Empieza a escribir aquí…"
                        value={draftContent}
                        onChange={(event) =>
                          setDraftContent(event.target.value)
                        }
                      />
                      <div className="editor-footer">
                        <span>
                          {getBinderKindLabel(editorNode.kind)} ·{" "}
                          {draftContent.trim().length === 0
                            ? "Sin contenido"
                            : `${draftContent.trim().split(/\s+/).length} palabras`}
                        </span>
                        <button
                          className="primary-button"
                          disabled={
                            saving ||
                            draftContent === (editorNode.content ?? "")
                          }
                          type="submit"
                        >
                          {saving ? "Guardando…" : "Guardar"}
                        </button>
                      </div>
                    </form>
                  ) : selectedNode?.kind === "folder" ? (
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
                      </dl>
                    </section>
                  ) : (
                    <div className="empty-editor">
                      <h2>Tu manuscrito empieza aquí</h2>
                      <p>
                        Crea una carpeta, una escena o un documento desde el
                        Binder para comenzar a escribir.
                      </p>
                    </div>
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
