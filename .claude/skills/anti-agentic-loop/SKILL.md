---
name: anti-agentic-loop
description: >
  Evita iteraciones improductivas durante cambios de código, pruebas y depuración.
  Úsalo cuando una tarea requiera varios ciclos de edición y validación.
---

# Prevención de bucles agénticos

## Define un contrato observable

Antes de editar, anota criterios de aceptación que puedan verificarse: pruebas concretas,
comandos con código de salida cero o respuestas esperadas de endpoints.

- Válido: «Pasan los tests de `SceneService` y `pnpm typecheck` termina sin errores».
- Insuficiente: «El código queda limpio».

Los criterios que requieren juicio humano son puertas de revisión, no condiciones para
seguir iterando automáticamente.

## Límites

- Máximo de tres ciclos de edición y comprobación para el mismo problema.
- Define un presupuesto razonable de tiempo y esfuerzo por tarea.
- Al llegar a un límite, detente y presenta el estado al usuario.

## Señales para detenerse antes

Detente y escala cuando:

- El mismo check falla dos veces seguidas con el mismo mensaje.
- Una acción produce exactamente el mismo resultado que el intento anterior.
- Se reescribe repetidamente el mismo archivo sin un cambio sustantivo.
- Un check que antes pasaba empieza a fallar por la corrección.

## Durante la depuración

- No repitas una acción que ya produjo el mismo fallo.
- No amplíes el alcance para arreglar problemas no relacionados.
- No desactives tests ni reglas del linter para hacer pasar un check.
- No introduzcas `@ts-ignore`, `any` ni `eslint-disable` como atajo.

## Entrega al usuario si no converge

Incluye:

1. Los criterios de aceptación originales.
2. Las acciones intentadas y sus resultados.
3. El mensaje exacto del último error.
4. La hipótesis más probable de por qué no converge.
5. El siguiente paso recomendado, sin afirmar que la tarea está completa.
