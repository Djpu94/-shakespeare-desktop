# Prompts de desarrollo en orden de dependencias

Usa estos prompts **uno por uno**, en orden. Cada uno está pensado para una tarea/PR
separada. No avances si no se cumplen sus criterios de aceptación. Así las features
consumen contratos ya establecidos en vez de inventar modelos, rutas o persistencia
independientes.

El orden conserva los doce requisitos funcionales originales; primero crea la base que
estos necesitan. En particular, modos se define antes de la estructura del Binder, el
Inspector se divide para que Snapshots no sea una dependencia circular, y las vistas
alternativas se construyen sobre el mismo árbol y metadatos.

## Reglas comunes

Incluye estas reglas al ejecutar **cada** prompt:

```text
Trabaja en el repositorio existente y comprueba su estado antes de editar. Sigue
AGENTS.md, las skills aplicables y los patrones reales del código; no supongas que los
ejemplos de arquitectura, rutas o scripts ya existen.

Implementa solamente el alcance de este prompt. Reutiliza los contratos y utilidades
existentes; no dupliques modelos, almacenamiento, estado ni lógica de negocio. No añadas
dependencias si puedes resolverlo con lo ya instalado. Si una nueva dependencia es
necesaria, justifica su uso, elige una versión compatible y actualiza el lockfile.

Antes de editar, resume los archivos/capas que vas a tocar y los criterios observables.
Valida entradas en los límites, conserva los errores explícitos y no ocultes fallos. Añade
tests para los caminos felices y los errores relevantes. Al finalizar ejecuta al menos
`corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` y las pruebas
específicas de esta feature. Si falla un check, corrige la causa; no lo desactives.

No empieces otra feature ni hagas refactors no relacionados. Entrega resumen de cambios,
decisiones de integración, archivos afectados y resultados exactos de los checks. Si falta
una decisión de producto que bloquee un requisito, pregunta antes de inventar su
comportamiento.
```

## Mapa de dependencias

| Orden | Prompt                                      | Requisitos previos                      |
| ----- | ------------------------------------------- | --------------------------------------- |
| 0     | Auditoría de base y contratos               | Scaffold actual                         |
| 1     | Dominio, persistencia y límites de Electron | Prompt 0                                |
| 2     | Proyectos y modos Ficción/Simple            | Prompt 1                                |
| 3     | Binder                                      | Prompts 1–2                             |
| 4     | Editor y autoguardado                       | Prompts 1–3                             |
| 5     | Inspector: metadatos y notas                | Prompts 1–4                             |
| 6     | Snapshots                                   | Prompts 1, 4–5                          |
| 7     | Corkboard                                   | Prompts 2–5                             |
| 8     | Outliner                                    | Prompts 2–5                             |
| 9     | Búsqueda global                             | Prompts 1, 3–5                          |
| 10    | Modo Focus                                  | Prompts 2, 4–5                          |
| 11    | Asistente de novela                         | Prompts 2–5, 7                          |
| 12    | Compilación y exportación                   | Prompts 1, 3–5                          |
| 13    | Backup Google Drive / OneDrive              | Prompts 1–2 y archivos de investigación |

Los prompts 7 y 8 pueden desarrollarse en ramas independientes una vez terminadas sus
dependencias; integrar y validar ambos antes de continuar. La exportación no necesita
esperar a búsqueda, Focus o asistente. El backup va al final porque la restauración
reemplaza datos y depende de un modelo de proyecto y persistencia estable.

---

## Prompt 0 — Auditar la base y fijar contratos

```text
Audita el scaffold actual de Shakespeare antes de implementar features. Revisa
AGENTS.md, package.json, workspaces, Electron main/preload, renderer, server, shared,
domain, infra, scripts y tests.

Entrega una breve propuesta y después implementa solo los ajustes imprescindibles para
dejar una base coherente:
- Identifica el único límite de comunicación que utilizará el renderer con el proceso
  privilegiado. Usa `window.shakespeare`, expuesto por preload mediante IPC tipado de
  Electron; no llames rutas HTTP locales desde el renderer ni mantengas dos caminos para
  las mismas operaciones. Define canales, schemas Zod y tipos en `packages/shared`;
  valida argumentos y respuestas en main antes de cruzar IPC. Mantén preload libre de
  dependencias runtime para respetar el sandbox de Electron.
- Define el contrato de errores con códigos estables y mensajes seguros, valida entradas
    en los límites y ubica las migraciones SQLite en `packages/infra/src/migrations/`.
    Las migraciones son versionadas, transaccionales e idempotentes; ejecútalas antes de
    construir repositorios, que no deben crear ni modificar el esquema.
- Comprueba los scripts de desarrollo, build, lint, typecheck y test del workspace.
- Documenta las convenciones necesarias para que los siguientes prompts las respeten.

No implementes funcionalidades visibles ni instales dependencias de features futuras.
Aceptación: instalación congelada, lint, typecheck, unit tests y build pasan; una prueba
pequeña verifica el contrato/health check elegido. Reporta cualquier limitación restante.
```

## Prompt 1 — Dominio, persistencia y límites de Electron

```text
Implementa la base de datos y los contratos compartidos que necesitarán las features:
Project, ProjectMode, BinderNode/Document, contenido de escena, metadatos y preferencias.
Adapta nombres y carpetas al diseño aprobado en el Prompt 0.

Define schemas Zod como fuente de validación en runtime y deriva tipos TypeScript de ellos.
Implementa migraciones SQLite versionadas y seguras; repositorios/puertos en domain y
adaptadores SQLite en infra. Expón operaciones mediante el límite tipado elegido en el
Prompt 0; valida datos antes de cruzarlo. Ningún acceso a DB o secreto desde renderer.
Ubica las migraciones en `packages/infra/src/migrations/` y ejecútalas antes de usar
repositorios; estos no deben crear tablas en sus constructores.

Incluye operaciones transaccionales mínimas para crear/leer/actualizar proyectos y nodos,
guardar contenido/metadatos y mover nodos con orden estable. Define IDs, timestamps,
índices, restricciones, borrado en cascada donde corresponda y errores tipados. No
construyas aún pantallas de features.

Aceptación: pruebas de migración desde DB vacía y DB previa, CRUD, orden/jerarquía,
rollback ante error y validación de payloads; migraciones repetidas no pierden datos.
Lint, typecheck, tests y build pasan.
```

## Prompt 2 — Proyectos y modos Ficción/Simple

```text
Implementa el ciclo de proyecto y el requisito «Modos de escritura — Ficción y Simple»
sobre los contratos existentes. Permite crear/abrir proyectos, elegir modo al crear y
cambiarlo luego desde ajustes con confirmación clara de que los datos se conservan.
Persiste el modo usando la capa de aplicación existente.

En modo Simple, deja disponibles las funciones comunes de escritura. En modo Ficción,
habilita las secciones adicionales de organización (personajes, lugares y trama) y el
punto de entrada del asistente, aunque sus features aún no estén implementadas. No crees
menús o controles que fallen al activarse.

Aceptación: ambos modos sobreviven al cerrar y reabrir; cambiar de modo conserva nodos,
escenas y contenido; los elementos visibles corresponden al modo; diálogo y controles
son accesibles por teclado. Añade tests de persistencia y cambio de modo.
```

## Prompt 3 — Binder

```text
Implementa «Binder — estructura jerárquica del proyecto» sobre Project y BinderNode;
el Binder es la vista de navegación del árbol compartido, no una segunda fuente de datos.

Incluye renderizado jerárquico, selección/expansión, creación, renombrado, borrado con
confirmación y conteo de descendientes, y reordenamiento/movimiento persistente. Al
seleccionar un documento notifica al shell/editor; seleccionar una carpeta no la trata
como documento. Diferencia visualmente carpeta, escena y tipos de investigación
soportados. Añade colapso por atajo, panel redimensionable y estados accesibles.

Usa drag-and-drop accesible y añade una dependencia solo si el árbol existente no resuelve
el caso. Actualiza el árbol de UI solo tras confirmación de persistencia o con rollback
explícito ante fallo.

Aceptación: pruebas de CRUD, movimientos válidos/inválidos, persistencia tras recarga,
confirmación de borrado y navegación; operación por teclado además de ratón.
```

## Prompt 4 — Editor y guardado automático

```text
Implementa «Editor — área principal y escenas» conectado a los documentos del Binder.
El contenido enriquecido tiene una representación serializable y versionable; usa el
contrato de contenido existente, no guardes HTML arbitrario sin validación.

Incluye edición básica (negrita, cursiva, subrayado, encabezados, listas, blockquote y
código), atajos, columna de lectura cómoda, barra opcional y zoom de texto por proyecto.
Autoguarda 800 ms después de la última edición, presenta estados guardando/guardado/error
y restaura la posición del cursor. Antes de cambiar de documento o cerrar, espera o
cancela de forma segura el guardado pendiente para no perder ni mezclar cambios.
Implementa Scrivenings solo si la API permite asociar cada segmento al documento original;
ediciones no pueden alterar el contenido de la escena vecina.

Aceptación: tests de debounce, cambio de escena durante guardado, fallos de persistencia,
restauración de cursor y límites de documentos en Scrivenings. Verifica accesibilidad de
atajos y que no se envíen escrituras duplicadas innecesarias.
```

## Prompt 5 — Inspector: metadatos y notas

```text
Implementa la base de «Inspector — panel lateral» para el documento seleccionado.
Incluye Sinopsis, Metadatos y Notas; la pestaña Snapshots se muestra deshabilitada u
oculta hasta completar el Prompt 6 y entonces se conecta a su servicio, sin datos fake.

Permite editar sinopsis, estado (borrador/revisión/final), etiqueta con color y notas.
Guarda cambios con debounce de 500 ms, valida mediante los schemas existentes y muestra
errores/estado de guardado. Usa el editor enriquecido existente para notas. Añade panel
redimensionable y overlay en ventanas estrechas; respeta selección y modo del proyecto.

Aceptación: edición, validación, persistencia por documento, cambio rápido de selección,
errores de guardado, teclado y layout estrecho tienen tests. Metadatos actualizados se
reflejan en todas las vistas mediante la fuente de datos compartida.
```

## Prompt 6 — Snapshots

```text
Implementa «Snapshots — historial de versiones» y conéctalo a la pestaña Snapshots del
Inspector. Crea snapshot manual con nombre y automático en guardado explícito/cierre de
escena, sin crear copias redundantes en cada autosave. Define el evento exacto de guardado
explícito y reutilízalo.

Persiste snapshots localmente en SQLite, los lista del más nuevo al más antiguo, deja
previsualizar en solo lectura y restaurar con confirmación. Antes de restaurar, guarda
snapshot de seguridad; limita a 50 por escena y elimina snapshots al eliminar escena.
Usa transacciones para que una restauración interrumpida no deje contenido inconsistente.

Aceptación: tests de creación manual/automática, límites/retención, previsualización sin
mutación, restauración y rollback, eliminación en cascada y sincronización con el editor.
```

## Prompt 7 — Corkboard

```text
Implementa «Corkboard — tablero de tarjetas» como vista de los hijos de la carpeta
seleccionada en el Binder. Cada tarjeta usa datos compartidos: título, extracto de
sinopsis y estado/etiqueta cuando existan. Permite editar título, crear una escena y
abrirla en Editor.

Reordenar tarjetas debe llamar la misma operación de movimiento usada por el Binder y
actualizar ambas vistas desde la caché/estado compartido. Rejilla responsiva de 2–6
columnas, tarjetas con proporción consistente y drag-and-drop accesible.

Aceptación: selección de carpeta, título, nueva tarjeta, doble clic para abrir y
reordenamiento persistente se prueban; tras recargar se mantiene el orden y no hay
desincronización con Binder.
```

## Prompt 8 — Outliner

```text
Implementa «Outliner — vista tabular» leyendo la misma jerarquía y metadatos del Binder
y del Inspector. Muestra título, sinopsis, estado, etiqueta y conteo de palabras;
filas jerárquicas expandibles, ordenación compatible con jerarquía, edición inline,
anchos de columna persistentes y selección/navegación al Editor.

Mover filas usa la operación de movimiento compartida del Binder; las ediciones inline
usan los mismos comandos de aplicación/validación del Inspector. No dupliques reglas de
orden, permisos ni persistencia en un store exclusivo del Outliner.

Aceptación: tests de jerarquía, ordenación, columnas, edición inválida, reordenamiento y
sincronización inmediata con Binder/Inspector; accesibilidad de tabla y teclado.
```

## Prompt 9 — Búsqueda global

```text
Implementa «Búsqueda global» para títulos, contenido, sinopsis y notas. Usa FTS5 de
SQLite, una tabla/índice con estrategia de sincronización transaccional con las escrituras
y borrados existentes, y el límite de aplicación elegido; renderer nunca consulta DB.

Abre un overlay con Ctrl/Cmd+K, consulta 300 ms tras la última tecla, devuelve hasta 50
resultados con tipo, título, extracto seguro y coincidencia resaltada. Enter abre el
resultado; enfoca la primera coincidencia si el tipo de contenido lo permite. Escape o
clic fuera cierra. Trata consultas vacías, caracteres especiales y errores sin interpolar
SQL ni renderizar contenido como HTML confiable.

Aceptación: pruebas de indexado/reindexado, altas/ediciones/borrados, límites, debounce,
resaltado seguro, navegación y consultas con caracteres especiales.
```

## Prompt 10 — Modo Focus

```text
Implementa «Modo Focus» como presentación del Editor, sin crear otro editor ni otro
almacenamiento. Añade entrada/salida por Ctrl/Cmd+Shift+F y Escape, oculta Binder,
Inspector y controles no esenciales, y centra una columna de 60–70 caracteres.

Persiste por proyecto las preferencias: fondo, foco de párrafo actual opcional y meta de
palabras por sesión. Muestra conteo/progreso minimalista. Si está activada la confirmación
al salir antes de completar meta, permite confirmar salida; no bloquees ni atrapes al
usuario contra su voluntad. Mantén el foco del teclado y los lectores de pantalla.

Aceptación: tests de atajos, estado persistente, meta/progreso, salida/cancelación,
transición y retorno al editor normal conservando cursor y contenido.
```

## Prompt 11 — Asistente de novela (Copo de Nieve)

```text
Implementa «Asistente de novela» disponible en modo Ficción. Guarda progreso por
proyecto con 8–10 pasos secuenciales, campos validados y navegación libre. Incluye
premisa, resumen, personajes, sinopsis y esquema de escenas; explica cada paso y permite
exportar sus respuestas como Markdown o insertarlas como notas sin sobrescribir nodos
existentes.

Al finalizar, muestra una vista previa de la estructura de carpetas/documentos a crear.
Solo confirma y persiste tras aceptación del usuario; la operación debe ser transaccional
y permitir cancelar sin dejar un árbol parcial. Reabrir el asistente conserva progreso.

Aceptación: tests de guardar/reanudar, cambiar de paso, validación, exportación y
confirmar/cancelar generación del Binder. El punto de entrada no aparece en modo Simple.
```

## Prompt 12 — Compilación y exportación

```text
Implementa «Compilación» sobre una instantánea coherente de la estructura y contenido
persistidos. Permite seleccionar nodos, formato (EPUB 3, PDF, DOCX, Markdown) y metadatos
de publicación; conserva orden jerárquico y mapea profundidad a encabezados.

Antes de cada formato, separa transformación del dominio y escritura de archivo. EPUB
debe incluir navegación/tabla de contenidos; PDF se genera desde Electron en el proceso
privilegiado con estilos de impresión; DOCX conserva capítulos y Markdown permite archivo
consolidado o uno por capítulo. Previsualización antes de exportar, diálogo nativo de
guardado, errores visibles y progreso en proyectos grandes. No bloquees el renderer.

Aceptación: pruebas de selección/orden, metadatos, contenido vacío y errores; genera un
artefacto de prueba por cada formato y valida su estructura. Ejecuta epubcheck si está
disponible en el entorno CI; no declares válido un EPUB sin comprobarlo.
```

## Prompt 13 — Copias de seguridad en Google Drive y OneDrive

```text
Implementa «Backup en la nube» como adaptadores de infraestructura detrás de un puerto
BackupProvider. Empieza por backup local empaquetado y validado; añade Google Drive
appDataFolder y OneDrive app folder solo mediante OAuth 2.0 con PKCE y navegador del
sistema. Nunca uses webview embebido, secretos del renderer, tokens en logs o valores
ficticios de configuración. Cifra tokens con Electron safeStorage.

Empaqueta una copia consistente de la DB (usa la API de backup SQLite, no copies a ciegas
un archivo en uso) y research si existe; incluye manifest con versión, timestamp y
SHA-256, valida antes de subir/restaurar. Backup manual y automático cada 15/30/60/120
minutos solo cuando hay cambios, máximo 10 artefactos por proveedor y hasta 3 reintentos
con backoff para errores recuperables.

La restauración exige confirmación, crea primero un backup local de seguridad, verifica
hash/versión y reemplaza datos de forma recuperable. Expón estado conectado/pendiente/error
y última ejecución; errores se explican sin exponer credenciales.

Aceptación: tests con proveedores fake para ZIP/manifiesto/hash, no-op sin cambios,
retención, reintentos, desconexión, restauración inválida y rollback. Prueba OAuth real
solo con configuración local autorizada; documenta los secretos/configuración que debe
añadir el operador, sin solicitar ni guardar credenciales en el repositorio.
```

---

## Criterio para avanzar entre prompts

Al terminar una feature:

1. Integra y revisa el cambio antes de empezar la siguiente feature dependiente.
2. Confirma que pasan `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm
test`, `corepack pnpm test:e2e` cuando afecte a UI y `corepack pnpm audit`.
3. Actualiza contratos/documentación si el cambio modificó una interfaz pública.
4. No comiences una dependiente si la anterior dejó deuda de migraciones, persistencia,
   errores o checks fallidos.

El orden evita acoplamientos ocultos; no significa que haya que implementar todas las
features antes de lanzar una primera versión. Cada prompt puede convertirse en un PR
pequeño con criterios de aceptación propios.
