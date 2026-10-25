import type { CreateSceneInput } from "@shakespeare/shared";

export interface Scene extends CreateSceneInput {
  id: string;
  createdAt: string;
}

export function createScene(
  input: CreateSceneInput,
  id: string,
  createdAt: string,
): Scene {
  return {
    ...input,
    id,
    createdAt,
  };
}
