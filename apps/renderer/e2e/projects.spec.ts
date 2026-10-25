import { expect, test } from "@playwright/test";
import type { BinderNode, Project, ShakespeareApi } from "@shakespeare/shared";

test("creates projects, changes mode accessibly, and keeps manuscript content", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const projects: Project[] = [];
    const nodes: BinderNode[] = [];
    const now = "2026-10-24T00:00:00.000Z";
    const api: ShakespeareApi = {
      getAppHealth: async () => ({
        ok: true,
        value: { status: "ok", appVersion: "0.1.0" },
      }),
      createProject: async (input) => {
        const project: Project = {
          id: "7bd4e807-37e7-44ba-b9b8-7397e30c0001",
          name: input.name,
          mode: input.mode,
          createdAt: now,
          updatedAt: now,
        };
        projects.push(project);
        return { ok: true, value: project };
      },
      getProject: async (projectId) => ({
        ok: true,
        value: projects.find((project) => project.id === projectId) ?? null,
      }),
      listProjects: async () => ({ ok: true, value: [...projects] }),
      updateProject: async (input) => {
        const project = projects.find((item) => item.id === input.projectId);
        if (project === undefined) {
          return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Project was not found." },
          };
        }
        const updated: Project = {
          ...project,
          ...(input.mode === undefined ? {} : { mode: input.mode }),
          ...(input.name === undefined ? {} : { name: input.name }),
          updatedAt: now,
        };
        projects[projects.indexOf(project)] = updated;
        return { ok: true, value: updated };
      },
      deleteProject: async (projectId) => {
        const projectIndex = projects.findIndex(
          (project) => project.id === projectId,
        );
        if (projectIndex !== -1) {
          projects.splice(projectIndex, 1);
        }
        return { ok: true, value: undefined };
      },
      createBinderNode: async (input) => {
        const node: BinderNode = {
          id: crypto.randomUUID(),
          projectId: input.projectId,
          parentId: input.parentId,
          kind: input.kind,
          title: input.title,
          position: nodes.length,
          content: input.content,
          metadata: input.metadata,
          createdAt: now,
          updatedAt: now,
        };
        nodes.push(node);
        return { ok: true, value: node };
      },
      listBinderNodes: async (projectId) => ({
        ok: true,
        value: nodes.filter((node) => node.projectId === projectId),
      }),
      updateBinderNode: async (input) => {
        const node = nodes.find((item) => item.id === input.nodeId);
        if (node === undefined) {
          return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Binder node was not found." },
          };
        }
        const updated: BinderNode = {
          ...node,
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.content === undefined ? {} : { content: input.content }),
          ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
          updatedAt: now,
        };
        nodes[nodes.indexOf(node)] = updated;
        return { ok: true, value: updated };
      },
      deleteBinderNode: async () => ({ ok: true, value: undefined }),
      moveBinderNode: async (input) => {
        const node = nodes.find((item) => item.id === input.nodeId);
        if (node === undefined) {
          return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Binder node was not found." },
          };
        }
        return {
          ok: true,
          value: {
            ...node,
            parentId: input.parentId,
            position: input.position,
          },
        };
      },
    };

    Object.defineProperty(window, "shakespeare", { value: api });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Crear un proyecto" }).click();
  await page.getByLabel("Nombre del proyecto").fill("Mi novela");
  await page.getByRole("button", { name: "Crear proyecto" }).click();

  const sectionNavigation = page.getByRole("navigation", {
    name: "Secciones del proyecto",
  });
  await expect(
    sectionNavigation.getByRole("button", { name: "Escritura" }),
  ).toBeVisible();
  await expect(
    sectionNavigation.getByRole("button", { name: "Personajes" }),
  ).toHaveCount(0);

  await page.getByLabel("Título").fill("Primera escena");
  await page.getByRole("button", { name: "Añadir al manuscrito" }).click();
  const content = page.getByRole("textbox", {
    name: "Contenido de Primera escena",
  });
  await content.fill("Conservo este texto al cambiar de modo.");
  await page.getByRole("button", { name: "Guardar" }).click();

  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.getByLabel("Modo de escritura").selectOption("fiction");
  await page.getByRole("button", { name: "Cambiar modo" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Tus nodos, escenas y todo su contenido se conservarán.",
  );
  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Confirmar cambio" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(
    sectionNavigation.getByRole("button", { name: "Personajes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir asistente" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Personajes" }).click();
  await expect(page.getByRole("heading", { name: "Personajes" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir asistente" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Sus herramientas se incorporarán próximamente.",
  );
  await page.getByRole("button", { name: "Entendido" }).click();

  await page.getByLabel("Modo de escritura").selectOption("simple");
  await page.getByRole("button", { name: "Cambiar modo" }).click();
  await page.getByRole("button", { name: "Confirmar cambio" }).click();
  await expect(
    sectionNavigation.getByRole("button", { name: "Personajes" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Abrir asistente" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Todos los proyectos" }).click();
  await page.getByRole("button", { name: "Abrir Mi novela" }).click();
  await expect(
    page.getByRole("textbox", { name: "Contenido de Primera escena" }),
  ).toHaveValue("Conservo este texto al cambiar de modo.");
});
