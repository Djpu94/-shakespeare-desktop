import type { Scene } from "./scene.js";

export interface SceneRepository {
  findById(id: string): Scene | undefined;
  save(scene: Scene): void;
}
