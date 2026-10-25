import type {
  BinderNodeKind,
  ProjectMode,
  ShakespeareApi,
} from "@shakespeare/shared";

export type BinderApi = Pick<
  ShakespeareApi,
  | "createBinderNode"
  | "updateBinderNode"
  | "deleteBinderNode"
  | "moveBinderNode"
>;

export const BINDER_KIND_LABELS: Record<BinderNodeKind, string> = {
  folder: "Carpeta",
  scene: "Escena",
  document: "Documento",
  character: "Personaje",
  location: "Lugar",
  research: "Investigación",
  plot: "Trama",
};

export const MANUSCRIPT_KINDS = [
  "folder",
  "scene",
  "document",
] as const satisfies readonly BinderNodeKind[];

export const RESEARCH_KINDS = [
  "character",
  "location",
  "research",
  "plot",
] as const satisfies readonly BinderNodeKind[];

export const ALL_BINDER_KINDS = [
  ...MANUSCRIPT_KINDS,
  ...RESEARCH_KINDS,
] as const satisfies readonly BinderNodeKind[];

export function getBinderCreationKinds(
  mode: ProjectMode,
): readonly BinderNodeKind[] {
  return mode === "fiction" ? ALL_BINDER_KINDS : MANUSCRIPT_KINDS;
}

export function isDocumentKind(kind: BinderNodeKind): boolean {
  return kind !== "folder";
}

export function getBinderKindLabel(kind: BinderNodeKind): string {
  return BINDER_KIND_LABELS[kind];
}
