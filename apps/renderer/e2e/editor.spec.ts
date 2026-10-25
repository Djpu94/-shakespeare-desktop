import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type {
  BinderNode,
  BinderNodeKind,
  Project,
  ProjectMode,
} from "@shakespeare/shared";
import {
  failNextContentSave,
  getContentSaveWrites,
  getPersistedBinderNode,
  installShakespeareMock,
  setContentSaveDelay,
} from "./support/shakespeare-mock.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const FOLDER_ID = "22222222-2222-4222-8222-222222222222";
const TIMESTAMP = "2026-10-25T00:00:00.000Z";

interface SeedNode {
  readonly id: string;
  readonly title: string;
  readonly kind: BinderNodeKind;
  readonly parentId: string | null;
  readonly position: number;
  readonly content: string | null;
}

function sceneId(index: number): string {
  return `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`;
}

function richText(text: string): string {
  const lines = text === "" ? [""] : text.split("\n");
  return JSON.stringify({
    version: 1,
    blocks: lines.map((line) => ({
      type: "paragraph",
      content:
        line.length === 0 ? [] : [{ type: "text", text: line, marks: [] }],
    })),
  });
}

function scene(
  index: number,
  title: string,
  position: number,
  content: string,
  parentId: string | null = null,
): SeedNode {
  return {
    id: sceneId(index),
    title,
    kind: "scene",
    parentId,
    position,
    content: richText(content),
  };
}

function createSeed(
  name: string,
  nodeSeeds: readonly SeedNode[],
  mode: ProjectMode = "simple",
): { projects: Project[]; nodes: BinderNode[] } {
  const project: Project = {
    id: PROJECT_ID,
    name,
    mode,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  return {
    projects: [project],
    nodes: nodeSeeds.map((node) => ({
      id: node.id,
      projectId: PROJECT_ID,
      parentId: node.parentId,
      kind: node.kind,
      title: node.title,
      position: node.position,
      content: node.content,
      metadata: {},
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    })),
  };
}

async function openSeededProject(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: `Abrir ${name}` }).click();
  await expect(page.getByRole("heading", { name: "Binder" })).toBeVisible();
}

function treeItem(page: Page, title: string) {
  return page
    .getByRole("tree", { name: "Árbol del Binder" })
    .getByRole("treeitem", { name: new RegExp(title) });
}

async function selectTreeItem(page: Page, title: string): Promise<void> {
  await treeItem(page, title).getByText(title, { exact: true }).click();
}

function editorSurface(page: Page, title: string) {
  return page.getByRole("textbox", {
    name: `Contenido de ${title}`,
    exact: true,
  });
}

function scriveningsSurface(page: Page, title: string) {
  return page.getByRole("textbox", {
    name: `Contenido de ${title} (Scrivenings)`,
    exact: true,
  });
}

function saveStatus(page: Page) {
  return page.locator(".editor .editor-save-status");
}

async function waitForSaved(page: Page): Promise<void> {
  await expect(saveStatus(page)).toContainText("Guardado", {
    timeout: 5_000,
  });
}

test("autosaves 800 ms after the last edit and restores the content on reload", async ({
  page,
}) => {
  const seed = createSeed("Autoguardado", [scene(1, "Escena A", 0, "")]);
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Autoguardado");

  const surface = editorSurface(page, "Escena A");
  await expect(surface).toBeVisible();
  await surface.click();
  await page.keyboard.type("Hola mundo", { delay: 25 });

  await expect(saveStatus(page)).toContainText("Cambios sin guardar");
  expect(await getContentSaveWrites(page)).toHaveLength(0);

  await waitForSaved(page);
  const writes = (await getContentSaveWrites(page)).filter((write) => write.ok);
  expect(writes).toHaveLength(1);
  expect(writes[0]?.nodeId).toBe(sceneId(1));
  expect(writes[0]?.content).toContain("Hola mundo");

  await page.reload();
  await openSeededProject(page, "Autoguardado");
  await expect(editorSurface(page, "Escena A")).toContainText("Hola mundo");
});

test("debounces rapid edits and avoids duplicate writes from manual saves", async ({
  page,
}) => {
  const seed = createSeed("Debounce", [scene(1, "Escena A", 0, "")]);
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Debounce");

  const surface = editorSurface(page, "Escena A");
  await surface.click();
  await surface.pressSequentially("abcdefghij", { delay: 20 });
  expect(await getContentSaveWrites(page)).toHaveLength(0);

  await expect
    .poll(
      async () =>
        (await getContentSaveWrites(page)).filter((write) => write.ok).length,
    )
    .toBe(1);
  await waitForSaved(page);
  expect(
    (await getContentSaveWrites(page)).filter((write) => write.ok),
  ).toHaveLength(1);

  await page.keyboard.press("Control+s");
  await waitForSaved(page);
  expect(
    (await getContentSaveWrites(page)).filter((write) => write.ok),
  ).toHaveLength(1);

  await page.keyboard.type("!");
  await page.keyboard.press("Control+s");
  await expect
    .poll(
      async () =>
        (await getContentSaveWrites(page)).filter((write) => write.ok).length,
    )
    .toBe(2);
  await waitForSaved(page);
  const writes = (await getContentSaveWrites(page)).filter((write) => write.ok);
  expect(writes).toHaveLength(2);
  expect(writes[1]?.content).toContain("abcdefghij!");

  await page.keyboard.press("Control+s");
  await page.waitForTimeout(250);
  expect(
    (await getContentSaveWrites(page)).filter((write) => write.ok),
  ).toHaveLength(2);
});

test("waits for an in-flight save before switching scenes and never mixes content", async ({
  page,
}) => {
  const seed = createSeed("Cambio de escena", [
    scene(1, "Escena A", 0, ""),
    scene(2, "Escena B", 1, ""),
  ]);
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Cambio de escena");
  await setContentSaveDelay(page, 500);

  const surfaceA = editorSurface(page, "Escena A");
  await surfaceA.click();
  await page.keyboard.type("Contenido A", { delay: 20 });
  await expect(saveStatus(page)).toContainText("Guardando…", {
    timeout: 5_000,
  });

  await selectTreeItem(page, "Escena B");
  const surfaceB = editorSurface(page, "Escena B");
  await expect(surfaceB).toBeVisible({ timeout: 5_000 });

  const persistedA = await getPersistedBinderNode(page, sceneId(1));
  const persistedB = await getPersistedBinderNode(page, sceneId(2));
  expect(persistedA?.content).toContain("Contenido A");
  expect(persistedB?.content).not.toContain("Contenido A");

  await surfaceB.click();
  await page.keyboard.type("Contenido B", { delay: 20 });
  await expect
    .poll(
      async () =>
        (await getContentSaveWrites(page)).filter((write) => write.ok).length,
    )
    .toBe(2);
  await waitForSaved(page);

  const writes = (await getContentSaveWrites(page)).filter((write) => write.ok);
  expect(writes.map((write) => write.nodeId)).toEqual([sceneId(1), sceneId(2)]);
  expect(writes[0]?.content).toContain("Contenido A");
  expect(writes[0]?.content).not.toContain("Contenido B");
  expect(writes[1]?.content).toContain("Contenido B");
  expect(writes[1]?.content).not.toContain("Contenido A");

  await page.reload();
  await openSeededProject(page, "Cambio de escena");
  await expect(editorSurface(page, "Escena A")).toContainText("Contenido A");
  await selectTreeItem(page, "Escena B");
  await expect(editorSurface(page, "Escena B")).toContainText("Contenido B");
});

test("keeps the draft and surfaces a retry action when persistence fails", async ({
  page,
}) => {
  const seed = createSeed("Fallo de guardado", [scene(1, "Escena A", 0, "")]);
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Fallo de guardado");
  await failNextContentSave(page);

  const surface = editorSurface(page, "Escena A");
  await surface.click();
  await page.keyboard.type("Texto frágil", { delay: 20 });

  await expect(saveStatus(page)).toContainText("Error al guardar", {
    timeout: 5_000,
  });
  await expect(page.getByRole("alert")).toContainText(
    "No se pudo guardar el documento.",
  );
  await expect(surface).toContainText("Texto frágil");

  const failedWrites = await getContentSaveWrites(page);
  expect(failedWrites).toHaveLength(1);
  expect(failedWrites[0]?.ok).toBe(false);

  await page.getByRole("button", { name: "Reintentar" }).click();
  await waitForSaved(page);

  const successfulWrites = (await getContentSaveWrites(page)).filter(
    (write) => write.ok,
  );
  expect(successfulWrites).toHaveLength(1);
  expect(successfulWrites[0]?.content).toContain("Texto frágil");

  await page.reload();
  await openSeededProject(page, "Fallo de guardado");
  await expect(editorSurface(page, "Escena A")).toContainText("Texto frágil");
});

test("flushes pending content synchronously before the window can close", async ({
  page,
}) => {
  const seed = createSeed("Cierre seguro", [scene(1, "Escena A", 0, "")]);
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Cierre seguro");

  const surface = editorSurface(page, "Escena A");
  await surface.click();
  await page.keyboard.type("Cierre seguro");
  await expect(saveStatus(page)).toContainText("Cambios sin guardar");

  const closePrevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(closePrevented).toBe(false);

  const persisted = await getPersistedBinderNode(page, sceneId(1));
  expect(persisted?.content).toContain("Cierre seguro");
});

test("restores the caret position when returning to a document", async ({
  page,
}) => {
  const seed = createSeed("Cursor", [
    scene(1, "Escena A", 0, "Hola mundo"),
    scene(2, "Escena B", 1, "Otra escena"),
  ]);
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Cursor");

  const surfaceA = editorSurface(page, "Escena A");
  await expect(surfaceA).toContainText("Hola mundo");
  await surfaceA.focus();
  await page.keyboard.press("End");
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("ArrowLeft");
  }

  await selectTreeItem(page, "Escena B");
  await expect(editorSurface(page, "Escena B")).toContainText("Otra escena");
  await selectTreeItem(page, "Escena A");

  const surfaceAAgain = editorSurface(page, "Escena A");
  await expect(surfaceAAgain).toContainText("Hola mundo");
  await surfaceAAgain.focus();
  await page.keyboard.type("X");

  await expect(surfaceAAgain).toContainText("Hola Xmundo");
  await expect
    .poll(
      async () =>
        (await getPersistedBinderNode(page, sceneId(1)))?.content ?? "",
    )
    .toContain("Hola Xmundo");
  await waitForSaved(page);
});

test("exposes formatting shortcuts and persists per-project zoom and toolbar preferences", async ({
  page,
}) => {
  const seed = createSeed("Formato", [
    scene(1, "Escena A", 0, ""),
    scene(2, "Escena B", 1, ""),
    scene(3, "Escena C", 2, ""),
    scene(4, "Escena D", 3, ""),
    scene(5, "Escena E", 4, ""),
    scene(6, "Escena F", 5, ""),
  ]);
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Formato");

  const toolbar = page.getByRole("toolbar", {
    name: "Formato del texto",
  });
  await expect(toolbar).toBeVisible();
  const boldButton = page.getByRole("button", { name: "Negrita" });
  await expect(boldButton).toHaveAttribute("aria-keyshortcuts", "Control+B");
  const surfaceA = editorSurface(page, "Escena A");
  await expect(surfaceA).toHaveAttribute("aria-keyshortcuts", /Control\+B/);

  await surfaceA.click();
  await page.keyboard.type("texto");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+b");
  await expect(surfaceA.locator("strong, b")).toHaveCount(1);
  await expect(boldButton).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Control+i");
  await page.keyboard.press("Control+u");
  await expect(surfaceA.locator("em, i")).toHaveCount(1);
  await expect(surfaceA.locator("u")).toHaveCount(1);

  await selectTreeItem(page, "Escena B");
  const surfaceB = editorSurface(page, "Escena B");
  await surfaceB.click();
  await page.keyboard.type("Título");
  await page.keyboard.press("Control+Alt+2");
  await expect(surfaceB.locator("h2")).toContainText("Título");

  await selectTreeItem(page, "Escena C");
  const surfaceC = editorSurface(page, "Escena C");
  await surfaceC.click();
  await page.keyboard.type("Elemento");
  await page.keyboard.press("Control+Shift+8");
  await expect(surfaceC.locator("ul li")).toContainText("Elemento");

  await selectTreeItem(page, "Escena D");
  const surfaceD = editorSurface(page, "Escena D");
  await surfaceD.click();
  await page.keyboard.type("Cita");
  await page.keyboard.press("Control+Shift+9");
  await expect(surfaceD.locator("blockquote")).toContainText("Cita");

  await selectTreeItem(page, "Escena E");
  const surfaceE = editorSurface(page, "Escena E");
  await surfaceE.click();
  await page.keyboard.type("const x = 1;");
  await page.keyboard.press("Control+Shift+E");
  await expect(surfaceE.locator("pre")).toContainText("const x = 1;");
  await expect(saveStatus(page)).toContainText(
    /Cambios sin guardar|Guardando…/,
  );
  await waitForSaved(page);

  await selectTreeItem(page, "Escena F");
  const surfaceF = editorSurface(page, "Escena F");
  await surfaceF.click();
  await page.keyboard.type("inline");
  await page.keyboard.press("Control+a");
  await page.getByRole("button", { name: "Código en línea" }).click();
  await expect(surfaceF.locator("code")).toContainText("inline");
  await page.keyboard.press("Control+e");
  await expect(surfaceF.locator("code")).toHaveCount(0);
  await expect(saveStatus(page)).toContainText(
    /Cambios sin guardar|Guardando…/,
  );
  await waitForSaved(page);

  await page
    .getByRole("button", { name: "Aumentar el tamaño del texto" })
    .click();
  await expect(page.locator(".editor-zoom-value")).toHaveText("110%");
  await page.getByRole("button", { name: "Ocultar barra" }).click();
  await expect(toolbar).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mostrar barra" }),
  ).toBeVisible();

  await page.reload();
  await openSeededProject(page, "Formato");
  await expect(page.locator(".editor-zoom-value")).toHaveText("110%");
  await expect(toolbar).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar barra" }).click();
  await expect(toolbar).toBeVisible();
  await page.getByRole("button", { name: "Restablecer" }).click();
  await expect(page.locator(".editor-zoom-value")).toHaveText("100%");
});

test("Scrivenings saves each segment to its original scene without touching neighbours", async ({
  page,
}) => {
  const folder: SeedNode = {
    id: FOLDER_ID,
    title: "Parte uno",
    kind: "folder",
    parentId: null,
    position: 0,
    content: null,
  };
  const seed = createSeed("Scrivenings aislado", [
    folder,
    scene(1, "Escena A", 0, "Escena A original", FOLDER_ID),
    scene(2, "Escena B", 1, "Escena B original", FOLDER_ID),
  ]);
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Scrivenings aislado");

  await selectTreeItem(page, "Parte uno");
  await page.getByRole("button", { name: "Abrir Scrivenings" }).click();
  await expect(
    page.getByRole("button", { name: "Cerrar Scrivenings" }),
  ).toBeVisible();

  const segmentA = page.getByRole("article", {
    name: "Documento 1: Escena A",
  });
  const segmentB = page.getByRole("article", {
    name: "Documento 2: Escena B",
  });
  await expect(scriveningsSurface(page, "Escena A")).toBeVisible();
  await expect(scriveningsSurface(page, "Escena B")).toBeVisible();

  await scriveningsSurface(page, "Escena A").fill("Escena A editada");
  await expect
    .poll(
      async () =>
        (await getPersistedBinderNode(page, sceneId(1)))?.content ?? "",
    )
    .toContain("Escena A editada");
  await expect(segmentA.locator(".editor-save-status")).toContainText(
    "Guardado",
    { timeout: 5_000 },
  );

  const persistedA = await getPersistedBinderNode(page, sceneId(1));
  const persistedB = await getPersistedBinderNode(page, sceneId(2));
  expect(persistedA?.content).toContain("Escena A editada");
  expect(persistedB?.content).toContain("Escena B original");
  expect(persistedB?.content).not.toContain("Escena A editada");

  const writes = (await getContentSaveWrites(page)).filter((write) => write.ok);
  expect(writes).toHaveLength(1);
  expect(writes[0]?.nodeId).toBe(sceneId(1));

  await scriveningsSurface(page, "Escena B").fill("Escena B editada");
  await expect
    .poll(
      async () =>
        (await getPersistedBinderNode(page, sceneId(2)))?.content ?? "",
    )
    .toContain("Escena B editada");
  await expect(segmentB.locator(".editor-save-status")).toContainText(
    "Guardado",
    { timeout: 5_000 },
  );

  const finalA = await getPersistedBinderNode(page, sceneId(1));
  const finalB = await getPersistedBinderNode(page, sceneId(2));
  expect(finalA?.content).toContain("Escena A editada");
  expect(finalB?.content).toContain("Escena B editada");
  expect(finalB?.content).not.toContain("Escena A editada");
});

test("Scrivenings enforces the document limit and reports omitted scenes", async ({
  page,
}) => {
  const folder: SeedNode = {
    id: FOLDER_ID,
    title: "Parte larga",
    kind: "folder",
    parentId: null,
    position: 0,
    content: null,
  };
  const scenes = Array.from({ length: 22 }, (_, index) =>
    scene(
      index + 1,
      `Escena ${index + 1}`,
      index,
      `Texto ${index + 1}`,
      FOLDER_ID,
    ),
  );
  const seed = createSeed("Scrivenings límites", [folder, ...scenes]);
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Scrivenings límites");

  await selectTreeItem(page, "Parte larga");
  await page.getByRole("button", { name: "Abrir Scrivenings" }).click();
  await expect(page.locator(".scrivenings-notice")).toContainText(
    "Se muestran 20 de 22 documentos.",
  );
  await expect(
    page.getByRole("textbox", { name: /\(Scrivenings\)/ }),
  ).toHaveCount(20);
});

test("flushes Scrivenings before leaving the writing section", async ({
  page,
}) => {
  const folder: SeedNode = {
    id: FOLDER_ID,
    title: "Parte ficción",
    kind: "folder",
    parentId: null,
    position: 0,
    content: null,
  };
  const seed = createSeed(
    "Scrivenings sección",
    [
      folder,
      scene(1, "Escena A", 0, "Escena A original", FOLDER_ID),
      scene(2, "Escena B", 1, "Escena B original", FOLDER_ID),
    ],
    "fiction",
  );
  await installShakespeareMock(page, seed);
  await openSeededProject(page, "Scrivenings sección");

  await selectTreeItem(page, "Parte ficción");
  await page.getByRole("button", { name: "Abrir Scrivenings" }).click();
  await scriveningsSurface(page, "Escena A").fill("Escena A desde sección");

  await page.getByRole("button", { name: "Personajes" }).click();
  await expect(page.getByRole("heading", { name: "Personajes" })).toBeVisible();

  const persisted = await getPersistedBinderNode(page, sceneId(1));
  expect(persisted?.content).toContain("Escena A desde sección");

  await page.getByRole("button", { name: "Escritura" }).click();
  await expect(scriveningsSurface(page, "Escena A")).toContainText(
    "Escena A desde sección",
  );
});
