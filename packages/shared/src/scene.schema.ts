import { z } from "zod";

export const CreateSceneSchema = z.object({
  title: z.string().trim().min(1).max(200),
  synopsis: z.string().max(2_000).optional(),
});

export type CreateSceneInput = z.infer<typeof CreateSceneSchema>;
