import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { BinderNode, Project, ProjectMode } from "@shakespeare/shared";

type WorkspaceSection = "writing" | "characters" | "places" | "plot";
type DialogState =
  { kind: "mode-change"; mode: ProjectMode } | { kind: "assistant" };

const MODE_LABELS: Record<ProjectMode, string> = {
  fiction: "Ficción",
  simple: "Simple",
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ha ocurrido un error inesperado.";
}

function unwrapResult<T>(
  result:
    | { ok: true; value: T }
    | { ok: false; error: { code: string; message: string } },
): T {
  if (!result.ok) {
    throw new Error(`${result.error.message} (${result.error.code})`);
  }
  return result.value;
}

function getInitialNode(nodes: BinderNode[]): BinderNode | undefined {
  return nodes.find(
    (node) => node.kind === "scene" || node.kind === "document",
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
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeKind, setNodeKind] = useState<"scene" | "document">("scene");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsMode, setSettingsMode] = useState<ProjectMode>("simple");
  const [section, setSection] = useState<WorkspaceSection>("writing");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const writingNodes = nodes.filter(
    (node) =>
      node.kind === "folder" ||
      node.kind === "scene" ||
      node.kind === "document",
  );

  useEffect(() => {
    let active = true;
    window.shakespeare
      .listProjects()
      .then((result) => {
        if (active) {
          setProjects(unwrapResult(result));
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
      const created = unwrapResult(
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

  async function openProject(selectedProject: Project) {
    setErrorMessage(null);
    setLoading(true);
    try {
      const [loadedProject, loadedNodes] = await Promise.all([
        window.shakespeare.getProject(selectedProject.id),
        window.shakespeare.listBinderNodes(selectedProject.id),
      ]);
      const persistedProject = unwrapResult(loadedProject);
      if (persistedProject === null) {
        throw new Error("No se encontró el proyecto seleccionado.");
      }
      const projectNodes = unwrapResult(loadedNodes);
      const initialNode = getInitialNode(projectNodes);
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

  async function createNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (project === null) {
      return;
    }
    setErrorMessage(null);
    setSaving(true);
    try {
      const created = unwrapResult(
        await window.shakespeare.createBinderNode({
          projectId: project.id,
          parentId: null,
          kind: nodeKind,
          title: nodeTitle,
          content: "",
          metadata: {},
        }),
      );
      setNodes((current) => [...current, created]);
      setSelectedNodeId(created.id);
      setDraftContent("");
      setNodeTitle("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedNode === undefined) {
      return;
    }
    setErrorMessage(null);
    setSaving(true);
    try {
      const updated = unwrapResult(
        await window.shakespeare.updateBinderNode({
          nodeId: selectedNode.id,
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
      const updated = unwrapResult(
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
    setSettingsOpen(false);
    setErrorMessage(null);
  }

  function selectNode(node: BinderNode) {
    setSelectedNodeId(node.id);
    setDraftContent(node.content ?? "");
    setSection("writing");
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

          <div className="workspace-layout">
            <aside className="sidebar">
              <nav className="section-nav" aria-label="Secciones del proyecto">
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
                        section === item.id ? "nav-item is-active" : "nav-item"
                      }
                      key={item.id}
                      type="button"
                      onClick={() => setSection(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
              </nav>

              {section === "writing" && (
                <>
                  <h2>Manuscrito</h2>
                  {writingNodes.length > 0 ? (
                    <ul className="binder-list" aria-label="Nodos del proyecto">
                      {writingNodes.map((node) => (
                        <li key={node.id}>
                          {node.kind === "folder" ? (
                            <span className="binder-folder">{node.title}</span>
                          ) : (
                            <button
                              aria-current={
                                selectedNodeId === node.id ? "page" : undefined
                              }
                              className={
                                selectedNodeId === node.id
                                  ? "binder-item is-active"
                                  : "binder-item"
                              }
                              type="button"
                              onClick={() => selectNode(node)}
                            >
                              {node.title}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sidebar-empty">Aún no hay escenas.</p>
                  )}
                  <form className="add-node-form" onSubmit={createNode}>
                    <label>
                      Título
                      <input
                        maxLength={200}
                        required
                        value={nodeTitle}
                        onChange={(event) => setNodeTitle(event.target.value)}
                      />
                    </label>
                    <label>
                      Tipo
                      <select
                        value={nodeKind}
                        onChange={(event) => {
                          if (
                            event.target.value === "scene" ||
                            event.target.value === "document"
                          ) {
                            setNodeKind(event.target.value);
                          }
                        }}
                      >
                        <option value="scene">Escena</option>
                        <option value="document">Documento</option>
                      </select>
                    </label>
                    <button
                      className="secondary-button"
                      disabled={saving}
                      type="submit"
                    >
                      Añadir al manuscrito
                    </button>
                  </form>
                </>
              )}
            </aside>

            <div className="editor-area">
              {section === "writing" ? (
                selectedNode ? (
                  <form className="editor" onSubmit={saveContent}>
                    <label className="editor-title" htmlFor="node-content">
                      {selectedNode.title}
                    </label>
                    <textarea
                      id="node-content"
                      aria-label={`Contenido de ${selectedNode.title}`}
                      placeholder="Empieza a escribir aquí…"
                      value={draftContent}
                      onChange={(event) => setDraftContent(event.target.value)}
                    />
                    <div className="editor-footer">
                      <span>
                        {selectedNode.kind === "scene" ? "Escena" : "Documento"}
                      </span>
                      <button
                        className="primary-button"
                        disabled={
                          saving ||
                          draftContent === (selectedNode.content ?? "")
                        }
                        type="submit"
                      >
                        {saving ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="empty-editor">
                    <h2>Tu manuscrito empieza aquí</h2>
                    <p>
                      Añade una escena o un documento para comenzar a escribir.
                    </p>
                  </div>
                )
              ) : (
                <section className="coming-soon" aria-live="polite">
                  <p className="eyebrow">Organización de ficción</p>
                  <h2>
                    {fictionSections.find((item) => item.id === section)?.label}
                  </h2>
                  <p>
                    Esta sección estará disponible próximamente. Tu manuscrito y
                    su contenido siguen intactos.
                  </p>
                </section>
              )}
            </div>
          </div>
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
