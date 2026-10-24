import { z } from "zod";
import {
  BinderNodeSchema,
  type BinderNode,
  type CreateBinderNodeInput,
  type MoveBinderNodeInput,
  type UpdateBinderNodeInput,
} from "./binder-node.schema.js";
import {
  ProjectIdSchema,
  ProjectSchema,
  type CreateProjectInput,
  type Project,
  type UpdateProjectInput,
} from "./project.schema.js";

export const IPC_CHANNELS = {
  getAppHealth: "app:get-health",
  createProject: "project:create",
  getProject: "project:get",
  listProjects: "project:list",
  updateProject: "project:update",
  deleteProject: "project:delete",
  createBinderNode: "binder-node:create",
  listBinderNodes: "binder-node:list",
  updateBinderNode: "binder-node:update",
  deleteBinderNode: "binder-node:delete",
  moveBinderNode: "binder-node:move",
} as const;

export const AppHealthRequestSchema = z.object({}).strict();
export const EmptyRequestSchema = z.object({}).strict();

export const AppHealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    appVersion: z.string().min(1),
  })
  .strict();

export const ApplicationErrorSchema = z
  .object({
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .max(100),
    message: z.string().trim().min(1).max(500),
  })
  .strict();

export const IpcResultSchema = <T extends z.ZodType>(valueSchema: T) =>
  z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), value: valueSchema }).strict(),
    z.object({ ok: z.literal(false), error: ApplicationErrorSchema }).strict(),
  ]);

export type IpcResult<T> =
  { ok: true; value: T } | { ok: false; error: ApplicationError };

export const ProjectIdRequestSchema = z
  .object({ projectId: ProjectIdSchema })
  .strict();
export const BinderNodeIdRequestSchema = z
  .object({ nodeId: z.uuid() })
  .strict();
export const ProjectListSchema = z.array(ProjectSchema);
export const BinderNodeListSchema = z.array(BinderNodeSchema);
export const VoidResponseSchema = z.void();

export type AppHealthResponse = z.infer<typeof AppHealthResponseSchema>;
export type ApplicationError = z.infer<typeof ApplicationErrorSchema>;

export interface ShakespeareApi {
  getAppHealth(): Promise<IpcResult<AppHealthResponse>>;
  createProject(input: CreateProjectInput): Promise<IpcResult<Project>>;
  getProject(projectId: string): Promise<IpcResult<Project | null>>;
  listProjects(): Promise<IpcResult<Project[]>>;
  updateProject(input: UpdateProjectInput): Promise<IpcResult<Project>>;
  deleteProject(projectId: string): Promise<IpcResult<void>>;
  createBinderNode(
    input: CreateBinderNodeInput,
  ): Promise<IpcResult<BinderNode>>;
  listBinderNodes(projectId: string): Promise<IpcResult<BinderNode[]>>;
  updateBinderNode(
    input: UpdateBinderNodeInput,
  ): Promise<IpcResult<BinderNode>>;
  deleteBinderNode(nodeId: string): Promise<IpcResult<void>>;
  moveBinderNode(input: MoveBinderNodeInput): Promise<IpcResult<BinderNode>>;
}
