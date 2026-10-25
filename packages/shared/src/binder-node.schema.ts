import { z } from "zod";
import { ProjectIdSchema } from "./project.schema.js";

export const BinderNodeIdSchema = z.uuid();
export const BinderNodeKindSchema = z.enum([
  "folder",
  "scene",
  "document",
  "character",
  "location",
  "research",
  "plot",
]);
export const NodeMetadataSchema = z.record(z.string(), z.json());

export const BinderNodeSchema = z
  .object({
    id: BinderNodeIdSchema,
    projectId: ProjectIdSchema,
    parentId: BinderNodeIdSchema.nullable(),
    kind: BinderNodeKindSchema,
    title: z.string().trim().min(1).max(200),
    position: z.number().int().nonnegative(),
    content: z.string().nullable(),
    metadata: NodeMetadataSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .refine((node) => node.kind !== "folder" || node.content === null);

export const CreateBinderNodeSchema = z
  .object({
    projectId: ProjectIdSchema,
    parentId: BinderNodeIdSchema.nullable(),
    kind: BinderNodeKindSchema,
    title: z.string().trim().min(1).max(200),
    content: z.string().nullable(),
    metadata: NodeMetadataSchema,
  })
  .strict()
  .refine((node) => node.kind !== "folder" || node.content === null);

export const UpdateBinderNodeSchema = z
  .object({
    nodeId: BinderNodeIdSchema,
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().nullable().optional(),
    metadata: NodeMetadataSchema.optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.title !== undefined ||
      input.content !== undefined ||
      input.metadata !== undefined,
  );

export const MoveBinderNodeSchema = z
  .object({
    nodeId: BinderNodeIdSchema,
    parentId: BinderNodeIdSchema.nullable(),
    position: z.number().int().nonnegative(),
  })
  .strict();

export type BinderNode = z.infer<typeof BinderNodeSchema>;
export type BinderNodeKind = z.infer<typeof BinderNodeKindSchema>;
export type CreateBinderNodeInput = z.infer<typeof CreateBinderNodeSchema>;
export type UpdateBinderNodeInput = z.infer<typeof UpdateBinderNodeSchema>;
export type MoveBinderNodeInput = z.infer<typeof MoveBinderNodeSchema>;
