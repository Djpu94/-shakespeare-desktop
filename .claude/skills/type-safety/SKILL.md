---
name: type-safety
description: >
  Tipado estricto de TypeScript y validación en runtime con Zod.
  Úsalo al definir contratos, schemas o tipos en cualquier capa.
---

# Tipado y validación estricta

## TypeScript

Mantén las opciones estrictas existentes en el proyecto. Si se configura un `tsconfig`,
considera las siguientes opciones, comprobando primero que sean compatibles con el build:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
  },
}
```

- `strict` activa comprobaciones estrictas, incluido el tratamiento de `null` y `undefined`.
- `noUncheckedIndexedAccess` obliga a contemplar índices fuera de rango.
- `exactOptionalPropertyTypes` distingue propiedades omitidas de propiedades con valor
  `undefined`.
- No cambies configuración global de TypeScript como parte de una tarea ajena a ella.

## Tipos seguros

- Evita `any`. Si el tipo es desconocido, usa `unknown` y estrecha con guards o schemas.
- Usa conversiones `as` solo en límites justificados y valida inmediatamente el valor.
- Evita `Function`, `object` y `{}` como tipos cuando exista un contrato más preciso.
- No uses `@ts-ignore` ni `@ts-expect-error` sin una justificación necesaria y localizada.

## Zod como contrato de runtime

Cuando el proyecto use Zod, define el schema como fuente de verdad y deriva el tipo:

```typescript
import { z } from "zod";

export const CreateSceneSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  synopsis: z.string().max(2000).optional(),
});

export type CreateSceneInput = z.infer<typeof CreateSceneSchema>;
```

Ubica los schemas según la arquitectura existente, preferentemente en `packages/shared`
si forman parte de un contrato compartido. No mantengas tipos duplicados manualmente.

## Límites del sistema

- Valida payloads IPC antes de pasarlos a servicios.
- Valida entradas de rutas HTTP mediante los schemas configurados para Fastify.
- Valida respuestas de APIs externas antes de confiar en su forma.
- Devuelve errores de validación explícitos y seguros; no sustituyas valores inválidos por
  defaults silenciosos.

## Inferencia

Usa `satisfies` cuando quieras validar la forma de un valor sin perder su inferencia:

```typescript
const DEFAULT_BACKUP_CONFIG = {
  intervalMinutes: 30,
  maxSnapshots: 10,
} satisfies BackupConfig;
```
