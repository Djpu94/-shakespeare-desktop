import { expect, test } from "@playwright/test";

test("shows the writing workspace landing page", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "shakespeare", {
      value: {
        listProjects: async () => ({ ok: true, value: [] }),
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Shakespeare" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear un proyecto" }),
  ).toBeVisible();
});
