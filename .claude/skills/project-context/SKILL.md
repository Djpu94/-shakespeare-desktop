---
name: project-context
description: >
  Contexto arquitectónico de la aplicación de escritura con Electron, React, Fastify
  y SQLite. Úsalo para entender las capas del monorepo o decidir dónde crear y mover código.
---

# Contexto del proyecto

## Descripción funcional

Aplicación de escritorio para escritores con binder jerárquico, Corkboard, Outliner,
editor dividido, snapshots, compilación, modos de planificación y copias de seguridad
en la nube.

## Stack y responsabilidades

| Capa            | Paquete / aplicación | Responsabilidad                                                         |
| --------------- | -------------------- | ----------------------------------------------------------------------- |
| Shell           | `apps/desktop`       | Proceso main, preload, IPC tipado y `safeStorage`                       |
| UI              | `apps/renderer`      | React 19, Tailwind, Zustand y TanStack Query                            |
| Dominio         | `packages/domain`    | Entidades y casos de uso puros                                          |
| Infraestructura | `packages/infra`     | SQLite (`better-sqlite3`), Google Drive, OneDrive y sistema de archivos |
| API local       | `packages/server`    | Fastify v5, rutas, validación y servicios de aplicación                 |
| Contratos       | `packages/shared`    | Schemas Zod, tipos compartidos y utilidades sin efectos                 |

## Regla de dependencias

- `domain` no importa desde `infra`, `server` ni `renderer`.
- `infra` implementa los puertos definidos por `domain`.
- `server` orquesta `domain` e `infra` y expone handlers Fastify.
- `renderer` solo conoce `shared` y los métodos publicados por preload.
- Mantén secretos y acceso a recursos del sistema fuera del renderer.

## Dónde crear un archivo

- Entidad o regla de negocio: `packages/domain/src/<contexto>/`
- Adaptador externo (API, DB, sistema de archivos): `packages/infra/src/<proveedor>/`
- Ruta HTTP: `packages/server/src/routes/`
- Componente visual: `apps/renderer/src/features/<feature>/`
- Schema o tipo compartido: `packages/shared/src/`

Antes de elegir una ubicación, comprueba la estructura real y las convenciones locales;
no crees rutas nuevas basándote únicamente en este mapa si el repositorio ya evolucionó.
