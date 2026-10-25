# AGENTS.md

## Proyecto

Aplicación de escritorio para escritores, inspirada en Scrivener y Manuskript.
Prioriza un espacio de trabajo claro, navegación intuitiva y copias de seguridad
automáticas en Google Drive y OneDrive.

## Stack

- Electron 38+ · React 19 · Vite · Tailwind CSS v4
- Fastify v5 en el proceso main · better-sqlite3 con WAL
- TanStack Query · Zustand · Zod · Vitest · Playwright
- Monorepo pnpm: `apps/desktop`, `apps/renderer` y `packages/{shared,domain,infra,server}`

## Comandos

- `pnpm dev` — iniciar la aplicación
- `pnpm build` — compilar los workspaces
- `pnpm test` — ejecutar Vitest (unitarios)
- `pnpm test:integration` — ejecutar pruebas de integración
- `pnpm test:e2e` — ejecutar Playwright
- `pnpm lint` — ejecutar ESLint
- `pnpm format:check` — verificar formato con Prettier
- `pnpm typecheck` — comprobar tipos en todos los workspaces
- `pnpm audit` — auditar dependencias

## Estructura

- `apps/desktop` — proceso main de Electron y preload
- `apps/renderer` — interfaz React; consume IPC tipado
- `packages/domain` — entidades y casos de uso puros
- `packages/infra` — SQLite, Google Drive, OneDrive y sistema de archivos
- `packages/server` — rutas Fastify y servicios de aplicación
- `packages/shared` — schemas Zod, tipos y utilidades puras

Los paquetes se administran con pnpm workspaces. Consulta `.github/DEVOPS.md`
para el flujo de ramas, CI, QA y publicación.

## Reglas globales

- No importes `fs`, `better-sqlite3` ni tokens OAuth en `apps/renderer`.
- Mantén el acceso a DB, red y secretos fuera del renderer.
- El único límite renderer → proceso privilegiado es `window.shakespeare`, publicado
  por preload y respaldado por IPC de Electron. Define canales, schemas Zod y tipos
  compartidos en `packages/shared`; valida argumentos y respuestas en main antes de
  cruzar IPC. Preload solo expone métodos explícitos; mantenlo sin dependencias runtime
  para respetar el sandbox de Electron. No expongas rutas HTTP locales al renderer para
  duplicar operaciones IPC.
- Los fallos de validación y de negocio deben conservar códigos estables y mensajes
  seguros según `ApplicationErrorSchema`; los errores inesperados deben propagarse, no
  convertirse en valores de éxito. No ocultes excepciones con defaults ni `catch`
  genéricos.
- Los contratos de Project y BinderNode viven en `packages/shared` con Zod como fuente
  de tipos. Usa UUID para IDs, timestamps ISO-8601 UTC, metadata como objeto JSON y
  contenido como texto nullable. Solo carpetas admiten hijos; el orden de hermanos es
  contiguo desde cero y `move` debe actualizarlo en una transacción.
- Las migraciones SQLite versionadas viven en `packages/infra/src/migrations/` y se
  ejecutan mediante `migrateDatabase` antes de usar repositorios. Cada migración debe
  ser transaccional e idempotente; los repositorios no crean ni modifican el esquema.
- `corepack pnpm test` ejecuta pruebas unitarias bajo `apps/**` y `packages/**`;
  `corepack pnpm test:integration` usa el selector `*.integration-test.*` /
  `*.integration-spec.*`, y `test:e2e` usa Playwright.
- Antes de modificar un paquete, consulta su `AGENTS.md` local y el skill relevante.

## Skills

- `.claude/skills/project-context/SKILL.md`
- `.claude/skills/anti-agentic-loop/SKILL.md`
- `.claude/skills/error-handling/SKILL.md`
- `.claude/skills/observability-logging/SKILL.md`
- `.claude/skills/naming-conventions/SKILL.md`
- `.claude/skills/testability/SKILL.md`
- `.claude/skills/type-safety/SKILL.md`
