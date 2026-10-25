import { z } from "zod";

export const ProjectModeSchema = z.enum(["fiction", "simple"]);
export const ProjectIdSchema = z.uuid();

export const ProjectSchema = z
  .object({
    id: ProjectIdSchema,
    name: z.string().trim().min(1).max(200),
    mode: ProjectModeSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const CreateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mode: ProjectModeSchema,
  })
  .strict();

export const UpdateProjectSchema = z
  .object({
    projectId: ProjectIdSchema,
    name: z.string().trim().min(1).max(200).optional(),
    mode: ProjectModeSchema.optional(),
  })
  .strict()
  .refine((input) => input.name !== undefined || input.mode !== undefined);

export type ProjectMode = z.infer<typeof ProjectModeSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
