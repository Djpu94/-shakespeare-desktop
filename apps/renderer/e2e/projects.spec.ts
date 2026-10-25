import { expect, test } from "@playwright/test";
import { installShakespeareMock } from "./support/shakespeare-mock.js";

test("creates projects, changes mode accessibly, and keeps manuscript content", async ({
  page,
}) => {
  await installShakespeareMock(page);

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

  await page.getByRole("button", { name: "Nuevo" }).click();
  await page.getByLabel("Título").fill("Primera escena");
  await page.getByLabel("Tipo").selectOption("scene");
  await page.getByRole("button", { name: "Crear elemento" }).click();

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
