---
name: testability
description: >
  Diseño testeable mediante dependencias explícitas, puertos y adaptadores.
  Úsalo al crear servicios, casos de uso o adaptadores.
---

# Testeabilidad

## Dependencias explícitas

Las clases de dominio y aplicación reciben sus dependencias mediante interfaces o tipos
de puerto. No instancies adaptadores externos dentro de los casos de uso.

```typescript
export class BackupService {
  constructor(
    private readonly provider: BackupProvider,
    private readonly clock: Clock,
  ) {}
}
```

En tests, inyecta fakes que cumplan el mismo contrato.

## Puertos y adaptadores

- `domain` define puertos como `SceneRepository`, `BackupProvider` y `Clock`.
- `infra` implementa esos puertos con adaptadores concretos.
- Los tests de casos de uso usan repositorios en memoria, proveedores fake y relojes fijos.

## Qué probar por capa

| Capa         | Tipo de prueba    | Dependencias externas                                         |
| ------------ | ----------------- | ------------------------------------------------------------- |
| `domain`     | Unitaria pura     | Ninguna                                                       |
| Casos de uso | Unitaria          | Puertos sustituidos por fakes                                 |
| `infra`      | Integración       | SQLite temporal/en memoria; APIs simuladas cuando corresponda |
| `server`     | Integración       | Servicios reales y DB aislada                                 |
| `renderer`   | Componentes y E2E | IPC simulado en unitarias; Playwright para flujos completos   |

## Caminos de error

Para casos de uso que devuelven `Result`, comprueba el camino feliz y cada código de error
relevante que forme parte del contrato observable.

## Evita tests frágiles

- Prefiere inyección de dependencias a mockear módulos completos.
- No pruebes detalles privados ni llamadas internas que no formen parte del contrato.
- Aísla estado compartido y evita depender del orden de ejecución.
- Usa la herramienta de pruebas y los patrones ya establecidos en el repositorio.
