---
name: observability-logging
description: >
  Logging estructurado y trazabilidad con Pino/Fastify. Úsalo al añadir handlers,
  servicios o puntos de diagnóstico.
---

# Trazabilidad y logging

## Regla base

Usa el logger estructurado existente. Fastify incluye Pino: no añadas un segundo logger
ni uses `console.log` en código de producción.

## Handlers Fastify

Usa `request.log` para conservar la correlación con el identificador de la petición.
Registra datos mínimos y no sensibles:

```typescript
server.post("/scenes", async (request, reply) => {
  request.log.info({ projectId: request.body.projectId }, "Creando escena");

  const result = await createScene.execute(request.body);
  if (result.isErr()) {
    request.log.warn({ code: result.error.code }, "No se pudo crear la escena");
    return reply.code(400).send({ code: result.error.code });
  }

  request.log.info({ sceneId: result.value.id }, "Escena creada");
  return reply.code(201).send(result.value);
});
```

Adapta el ejemplo a los tipos y convenciones reales de la ruta y del `Result` del proyecto.

## Logging estructurado

Pasa un objeto con campos consultables y un mensaje breve. No concatenes valores variables.

```typescript
request.log.info({ sceneId, wordCount }, "Escena guardada");
```

## Secretos y datos personales

- Configura redacción centralizada para `authorization`, cookies, tokens y secretos.
- No registres contenido del manuscrito, credenciales ni datos personales salvo que sea
  imprescindible y esté aprobado.
- Nunca registres objetos `request` o `reply` completos; usa serializers mínimos.

## Niveles y errores

- Desarrollo: `debug` cuando sea útil y salida legible si el proyecto lo configura.
- Producción: nivel apropiado para operación y formato estructurado.
- Incluye el error serializado y su contexto al registrar fallos; conserva el stack cuando
  corresponda.
- Registra una operación con identificadores estables, no con el contenido sensible.
