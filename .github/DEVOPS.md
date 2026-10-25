# Flujo de CI/CD

## Ramas y revisiones

- `develop`: integración continua; recibe PR de `feature/*` y `fix/*`.
- `qa`: candidatos de validación; recibe PR desde `develop`.
- `main`: producción; recibe PR aprobados desde `qa`.
- `hotfix/*`: ramas urgentes basadas en `main`; requieren PR y revisión.
- `release/*`: preparación de una versión desde `develop`, integrada mediante PR a `qa`.

Configura protección de ramas en GitHub (no se puede activar desde los archivos del
repositorio): exige PR, aprobación, resolución de conversaciones y el job `Validate
workspace` antes de integrar en `develop`, `qa` y `main`. Impide pushes directos a esas
ramas y restringe quién puede publicar tags de versión.

## Workflows

- `ci.yml`: formato, lint, typecheck, unit/integration/E2E tests, auditoría y empaquetado
  en Linux, macOS y Windows para PR y push a ramas protegidas.
- `qa.yml`: genera instaladores de QA como artefactos descargables (retención de 30 días).
- `release.yml`: al enviar un tag `vX.Y.Z`, valida que coincida con la versión raíz,
  empaqueta y publica los artefactos en GitHub Releases.
- `nightly.yml`: ejecuta la auditoría de dependencias a diario.

Los instaladores se generan sin firma. La firma y notarización requieren certificados
válidos y secretos por sistema operativo; no configures valores ficticios. Para habilitar
la firma, agrega los secretos CSC y Apple apropiados y expónlos solo al job de release.

## Crear y publicar una versión

1. Actualiza `version` en el `package.json` raíz.
2. Fusiona el PR aprobado a `main`.
3. Crea y envía el tag que corresponde exactamente a esa versión, por ejemplo
   `git tag v0.1.0` y `git push origin v0.1.0`.
4. Revisa el workflow `Release` y los artefactos publicados.

Los workflows no hacen merge automático, bump de versión ni push usando tokens personales.
