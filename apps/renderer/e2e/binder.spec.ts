import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { BinderNodeKind } from "@shakespeare/shared";
import {
  failNextBinderMove,
  installShakespeareMock,
} from "./support/shakespeare-mock.js";

async function createProject(
  page: Page,
  name: string,
  mode: "simple" | "fiction" = "simple",
): Promise<void> {
  await page.getByRole("button", { name: "Crear un proyecto" }).click();
  await page.getByLabel("Nombre del proyecto").fill(name);
  if (mode === "fiction") {
    await page.getByLabel("Modo de escritura").selectOption("fiction");
  }
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("heading", { name: "Binder" })).toBeVisible();
}

async function openProject(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Abrir ${name}` }).click();
  await expect(page.getByRole("heading", { name: "Binder" })).toBeVisible();
}

async function createNode(
  page: Page,
  title: string,
  kind: BinderNodeKind,
  parent: "root" | "selection",
): Promise<void> {
  await page.getByRole("button", { name: "Nuevo" }).click();
  await page.getByLabel("Título").fill(title);
  await page.getByLabel("Tipo").selectOption(kind);
  if (parent === "root") {
    await page.getByLabel("Dentro de").selectOption("");
  }
  await page.getByRole("button", { name: "Crear elemento" }).click();
  await expect(
    page.getByRole("treeitem", { name: new RegExp(title) }),
  ).toBeVisible();
}

function treeItem(page: Page, title: string) {
  return page
    .getByRole("tree", { name: "Árbol del Binder" })
    .getByRole("treeitem", { name: new RegExp(title) });
}

async function clickTreeItem(page: Page, title: string): Promise<void> {
  await treeItem(page, title).getByText(title, { exact: true }).click();
}

test("renders the hierarchy and supports keyboard navigation, collapse, and resizing", async ({
  page,
}) => {
  await installShakespeareMock(page);
  await page.goto("/");
  await createProject(page, "Binder accesible", "fiction");

  await createNode(page, "Parte uno", "folder", "root");
  await createNode(page, "Escena A", "scene", "selection");
  await createNode(page, "Escena B", "scene", "selection");
  await createNode(page, "Personaje X", "character", "root");

  const tree = page.getByRole("tree", { name: "Árbol del Binder" });
  const folder = treeItem(page, "Parte uno");
  const sceneA = treeItem(page, "Escena A");
  const sceneB = treeItem(page, "Escena B");
  const character = treeItem(page, "Personaje X");

  await expect(folder).toHaveAttribute("aria-level", "1");
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(folder).toHaveAccessibleName(/2 hijos directos/);
  await expect(sceneA).toHaveAttribute("aria-level", "2");
  await expect(sceneA).toHaveAttribute("aria-posinset", "1");
  await expect(sceneB).toHaveAttribute("aria-posinset", "2");
  await expect(sceneA).toHaveAttribute("data-kind", "scene");
  await expect(folder).toHaveAttribute("data-kind", "folder");
  await expect(character).toHaveAttribute("data-kind", "character");
  await expect(character).toHaveAttribute("aria-level", "1");
  await expect(character).toHaveAccessibleName(/Personaje: Personaje X/);

  await clickTreeItem(page, "Parte uno");
  await expect(folder).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Parte uno" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /Contenido de/ })).toHaveCount(
    0,
  );

  await page.keyboard.press("ArrowDown");
  await expect(sceneA).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sceneA).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("textbox", { name: "Contenido de Escena A" }),
  ).toBeVisible();

  await page.keyboard.press("Control+Shift+B");
  await expect(folder).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByRole("treeitem", { name: /Escena A/ })).toHaveCount(0);

  await page.keyboard.press("Control+Shift+B");
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(sceneA).toBeVisible();

  const separator = page.getByRole("separator", {
    name: "Ajustar el ancho del Binder",
  });
  await expect(separator).toHaveAttribute("aria-valuenow", "292");
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "324");
  await page.keyboard.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "220");
  await page.keyboard.press("End");
  await expect(separator).toHaveAttribute("aria-valuenow", "520");

  const handleBox = await separator.boundingBox();
  expect(handleBox).not.toBeNull();
  if (handleBox !== null) {
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 - 80,
      handleBox.y + handleBox.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();
  }
  const resizedWidth = Number(await separator.getAttribute("aria-valuenow"));
  expect(resizedWidth).toBeLessThan(520);
});

test("persists CRUD, reorder, drag and drop, and confirmed deletion across reloads", async ({
  page,
}) => {
  await installShakespeareMock(page);
  await page.goto("/");
  await createProject(page, "Binder persistente");

  await createNode(page, "Parte uno", "folder", "root");
  await createNode(page, "Escena A", "scene", "selection");
  await createNode(page, "Escena B", "scene", "selection");
  await createNode(page, "Parte dos", "folder", "root");

  const folderOne = treeItem(page, "Parte uno");
  const folderTwo = treeItem(page, "Parte dos");
  const sceneB = treeItem(page, "Escena B");

  await expect(folderTwo).toHaveAttribute("aria-posinset", "2");
  await clickTreeItem(page, "Parte dos");
  await page.keyboard.press("Alt+ArrowUp");
  await expect(folderTwo).toHaveAttribute("aria-posinset", "1");
  await expect(page.getByRole("status")).toContainText("se movió");

  await clickTreeItem(page, "Escena A");
  await page.keyboard.press("F2");
  const renameInput = page.getByRole("textbox", {
    name: "Nuevo título para Escena A",
  });
  await expect(renameInput).toBeVisible();
  await renameInput.fill("Escena A revisada");
  await renameInput.press("Enter");
  await expect(treeItem(page, "Escena A revisada")).toBeVisible();

  const sourceRow = sceneB.locator("[draggable='true']");
  const targetRow = folderTwo.locator("[draggable='true']");
  await sourceRow.dragTo(targetRow, { targetPosition: { x: 20, y: 20 } });
  await expect(folderTwo).toHaveAccessibleName(/1 hijo directo/);
  await expect(
    folderTwo.getByRole("treeitem", { name: /Escena B/ }),
  ).toBeVisible();
  await expect(
    folderOne.getByRole("treeitem", { name: /Escena B/ }),
  ).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tus proyectos" }),
  ).toBeVisible();
  await openProject(page, "Binder persistente");

  const reloadedTree = page.getByRole("tree", { name: "Árbol del Binder" });
  const reloadedFolderOne = treeItem(page, "Parte uno");
  const reloadedFolderTwo = treeItem(page, "Parte dos");
  await expect(reloadedFolderTwo).toHaveAttribute("aria-posinset", "1");
  await expect(reloadedFolderOne).toHaveAttribute("aria-posinset", "2");
  await expect(treeItem(page, "Escena A revisada")).toBeVisible();
  await expect(
    reloadedFolderTwo.getByRole("treeitem", { name: /Escena B/ }),
  ).toBeVisible();

  await clickTreeItem(page, "Parte uno");
  await page.keyboard.press("Delete");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "También se eliminará 1 elemento que está dentro.",
  );
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(reloadedFolderOne).toBeVisible();
  await expect(treeItem(page, "Escena A revisada")).toBeVisible();

  await clickTreeItem(page, "Parte uno");
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(
    reloadedTree.getByRole("treeitem", { name: /Parte uno/ }),
  ).toHaveCount(0);
  await expect(
    reloadedTree.getByRole("treeitem", { name: /Escena A revisada/ }),
  ).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Tus proyectos" }),
  ).toBeVisible();
  await openProject(page, "Binder persistente");
  const finalTree = page.getByRole("tree", { name: "Árbol del Binder" });
  await expect(
    finalTree.getByRole("treeitem", { name: /Parte uno/ }),
  ).toHaveCount(0);
  await expect(
    finalTree.getByRole("treeitem", { name: /Escena A revisada/ }),
  ).toHaveCount(0);
  await expect(
    finalTree.getByRole("treeitem", { name: /Parte dos/ }),
  ).toBeVisible();
});

test("keeps the visible tree unchanged when persistence fails", async ({
  page,
}) => {
  await installShakespeareMock(page);
  await page.goto("/");
  await createProject(page, "Binder rollback");

  await createNode(page, "Uno", "scene", "root");
  await createNode(page, "Dos", "scene", "root");

  const sceneTwo = treeItem(page, "Dos");
  await expect(sceneTwo).toHaveAttribute("aria-posinset", "2");
  await clickTreeItem(page, "Dos");
  await failNextBinderMove(page);
  await page.keyboard.press("Alt+ArrowUp");

  await expect(page.getByRole("alert")).toContainText(
    "Esa operación no es válida para este elemento.",
  );
  await expect(sceneTwo).toHaveAttribute("aria-posinset", "2");
  await expect(treeItem(page, "Uno")).toHaveAttribute("aria-posinset", "1");

  await page.keyboard.press("Alt+ArrowUp");
  await expect(sceneTwo).toHaveAttribute("aria-posinset", "1");
  await expect(treeItem(page, "Uno")).toHaveAttribute("aria-posinset", "2");
});
