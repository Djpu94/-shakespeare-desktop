---
name: naming-conventions
description: >
  Convenciones de nombres para archivos, clases, funciones, variables y constantes.
  Úsalo al crear archivos o renombrar símbolos.
---

# Convenciones de nomenclatura

| Elemento                              | Convención                    | Ejemplo                                 |
| ------------------------------------- | ----------------------------- | --------------------------------------- |
| Variables                             | `camelCase`                   | `userId`, `isActive`                    |
| Constantes de módulo                  | `UPPER_SNAKE_CASE`            | `MAX_RETRY_COUNT`                       |
| Funciones                             | `camelCase` con verbo         | `getUserById()`, `calculateWordCount()` |
| Clases                                | `PascalCase`                  | `SceneService`, `BackupScheduler`       |
| Interfaces y tipos                    | `PascalCase`, sin prefijo `I` | `SceneRepository`, `BackupProvider`     |
| Enums                                 | `PascalCase`                  | `SyncStatus`                            |
| Archivos de dominio e infraestructura | `kebab-case`                  | `scene-service.ts`                      |
| Componentes React                     | `PascalCase.tsx`              | `BinderPanel.tsx`                       |
| Tests                                 | `*.test.ts` junto al código   | `scene-service.test.ts`                 |

## Reglas adicionales

- Nombra funciones con verbos específicos (`get`, `create`, `validate`, `upload`,
  `calculate`). Evita verbos ambiguos como `do` o `process`.
- Para booleanos, usa prefijos como `is`, `has`, `should` o `can`.
- Reserva `UPPER_SNAKE_CASE` para constantes de módulo con significado estable; no para
  cada variable declarada con `const`.
- Evita abreviaturas crípticas en APIs públicas (`repository` en vez de `repo`, `sceneId`
  en vez de `sid`).
- Sigue primero las convenciones existentes en el directorio y evita renombrados no
  necesarios que puedan romper APIs.

```typescript
const MAX_SNAPSHOTS = 20;
const sceneRepository = new SqliteSceneRepository();

function calculateWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

class BackupScheduler {}
```
