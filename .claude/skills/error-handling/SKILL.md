---
name: error-handling
description: >
  Convenciones para errores de negocio esperados y errores de programación.
  Úsalo al crear casos de uso, repositorios, adaptadores o rutas.
---

# Manejo de errores

## Errores de negocio esperados: `Result<T, E>`

Usa `Result` cuando el fallo forme parte del flujo normal y el llamador pueda recuperarse
o comunicarlo al usuario. Ejemplos:

- Validación de dominio, como un título vacío o un rango de palabras inválido.
- Regla de negocio incumplida, como una escena duplicada.
- Fallo recuperable de una API externa, como rate limit o timeout.
- Entidad inexistente o conflicto de persistencia que la aplicación pueda resolver.

```typescript
export type SceneErrorCode = "TITLE_REQUIRED" | "DUPLICATE_TITLE" | "NOT_FOUND";

export class SceneError extends Error {
  constructor(
    public readonly code: SceneErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SceneError";
  }
}
```

Devuelve los errores esperados mediante el tipo `Result` existente en el proyecto.
No inventes una nueva implementación si ya hay una utilidad común.

## Errores de programación y estados irrecuperables

Usa excepciones para bugs, invariantes rotas o fallos que no puedan convertirse en un
resultado recuperable. Ejemplos: una configuración obligatoria ausente al iniciar o un
estado imposible según los tipos. Conserva contexto suficiente para diagnosticar el fallo.

## Reglas

- No uses `try/catch` genéricos que devuelvan `undefined` o silencien el error.
- No conviertas errores de negocio en excepciones si el contrato usa `Result`.
- No uses `Result` para ocultar bugs de programación.
- No expongas mensajes internos, rutas locales, tokens ni detalles sensibles al renderer.
- En los límites de UI/API, traduce el error a una respuesta segura y útil sin perder su
  código o contexto de diagnóstico en los logs.
- Captura una excepción solo cuando puedas recuperarte, enriquecerla o traducirla; si no,
  propágala.
