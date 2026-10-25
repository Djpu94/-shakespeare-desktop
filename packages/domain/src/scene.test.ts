import { describe, expect, it } from "vitest";
import { createScene } from "./scene.js";

describe("createScene", () => {
  it("creates a scene with its identity and timestamp", () => {
    expect(
      createScene({ title: "Opening" }, "scene-1", "2026-01-01T00:00:00.000Z"),
    ).toEqual({
      title: "Opening",
      id: "scene-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
