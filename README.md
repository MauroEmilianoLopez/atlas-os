# Atlas OS

> Un **Knowledge Operating System AI-first**, local-first y markdown-first, diseñado para durar
> más de 10 años y ser operado por un humano y múltiples agentes de IA.

Este repositorio es el **P0**: el prototipo documental y estructural mínimo que implementa el
dominio (RFC-001.x) y su representación física (RFC-002). No es un vault productivo todavía — es
un esqueleto limpio para validar las decisiones de arquitectura con ejemplos reales.

---

## Qué es Atlas

Atlas no es una app de notas ni un "segundo cerebro". Es un **sistema operativo de conocimiento**:
un dominio de conocimiento con una representación física en texto plano, operado por procesos
(Tasks) que ejecutan trabajo sobre él bajo reglas (Policies), con humano y agentes como pares.

### Qué problema resuelve
Los sistemas de notas se pudren a escala. El conocimiento se acumula sin integrarse, la
organización manual colapsa pasadas ~1.000 notas, y los agentes de IA no pueden razonar sobre
conocimiento que no declara explícitamente sus relaciones. Atlas trata el conocimiento como un
**grafo de relaciones tipadas** sobre el que se razona, no como un montón de archivos que se
buscan por similitud.

### Qué NO es
- **No es Obsidian.** Obsidian es solo la primera interfaz humana. El dominio no depende de él.
- **No es un sistema PKM más.** Tiene un plano de ejecución (Tasks), no solo almacenamiento.
- **No es un producto.** Es una arquitectura + su representación física + (a futuro) su runtime.

---

## Las tres capas del proyecto (no confundirlas)

| Capa | Qué define | Dónde vive |
|---|---|---|
| **Dominio** | Qué entidades existen, cómo se relacionan, cómo viven, cómo se ejecutan | `docs/01..03` (RFC-001.x) |
| **Representación física** | Cómo el dominio se materializa en Markdown/YAML/Git | `docs/04` (RFC-002) + `schemas/` |
| **Implementación** | El Context Engine / MCP / agentes que operan sobre lo anterior | *futuro* (ver `docs/05`) |

El dominio es estable y durable. La representación es una concreción. La herramienta es
intercambiable. Esta separación (principio P8: Tool Independence) es lo que permite que Atlas
sobreviva 10 años aunque las herramientas cambien.

---

## Cómo se organiza el repo

```
atlas-os/
├── README.md                  # este archivo
├── docs/                      # los RFC de dominio y representación física
│   ├── 00-vision.md
│   ├── 01-rfc-001-domain-architecture.md
│   ├── 02-rfc-001-1-revised-domain-architecture.md
│   ├── 03-rfc-001-2-memory-activation.md
│   ├── 04-rfc-002-physical-representation.md
│   └── 05-implementation-notes.md
├── schemas/                   # contratos de frontmatter, relaciones, task log, policy
├── examples/                  # copias de referencia limpias (para copiar al crear KOs)
└── vault-prototype/           # el prototipo del vault
    ├── knowledge/             # capa 4 — destilado: concepts, insights, intents, prompts
    ├── work/                  # capa 2 — trabajo: initiatives, events, decisions, sources, artifacts
    ├── world/                 # capa 3 — mundo: actors, technologies
    ├── flow/                  # capa 1 — flujo: inbox.md, daily/
    ├── execution/             # plano de ejecución: agents, policies, tasks (log)
    ├── maps/                  # MOCs — nodos de gobernanza/navegación
    └── .atlas/                # generado por el sistema (index/, cache/) — ignorado por Git
```

**Las carpetas reflejan el TIPO/CAPA de cada objeto, nunca el TEMA.** El tema lo dan las
relaciones tipadas y los tags. Organizar por tema colapsa a escala; por eso no se hace.

---

## Cómo se crea un Knowledge Object (KO)

1. Decidí el **tipo** (concept, insight, initiative, event, decision, source, artifact, actor,
   technology, intent, prompt, agent, policy).
2. ¿Merece archivo propio? Sí si tiene identidad estable + lifecycle propio + es referenciado.
   Si no (una Signal), vive en `flow/inbox.md` hasta destilarse.
3. Copiá el ejemplo correspondiente de `examples/` o seguí `schemas/common-frontmatter.schema.md`.
4. Asigná un `id` nuevo (ULID con prefijo), poné `type`, `title`, `lifecycle: fleeting|living|archived`,
   `created`.
5. Agregá relaciones fuertes en YAML (ver abajo) solo si las hay. No inventes relaciones.
6. Escribí el cuerpo en Markdown legible.

---

## Cómo funcionan los IDs

- Cada KO tiene un `id` **inmutable** (ULID con prefijo legible: `ko_`, `agent_`, `task_`, `policy_`).
- **El `id` es la identidad. El filename NO.** Podés renombrar o mover un archivo libremente:
  las relaciones apuntan al `id`, no al path, así que nada se rompe.
- El filename es solo una clave humana legible (slug ASCII, kebab-case). Ver
  [ADR-001](vault-prototype/work/decisions/adr-001-use-ids-over-paths.md).

---

## Relaciones fuertes vs débiles

| | Fuertes (razonamiento) | Débiles (descubrimiento) |
|---|---|---|
| **Dónde** | Arrays YAML en el frontmatter | Wikilinks `[[...]]` en el cuerpo |
| **Tienen tipo** | Sí (`se_apoya_en`, `contradice`...) | No |
| **Fuente de verdad del grafo** | Sí | No (solo navegación) |
| **Apuntan por** | `target_id` (id inmutable) | nombre de nota |

Ejemplo de relación fuerte (ver `schemas/relation-format.schema.md`):

```yaml
se_apoya_en:
  - target_id: ko_01JZ000000000000000011
    label: "Context is not memory"
    deriva_de: [ko_01JZ000000000000000040]   # evidencia (obligatoria si la afirma un agente)
    escrito_por: agent_01JZ000000000000000001
```

**Verbos core (8):** `deriva_de`, `se_apoya_en`, `contradice`, `trata_sobre`, `decide_sobre`,
`avanza`, `escrito_por`, `respaldado_por`. Las extendidas, solo cuando hacen falta.

---

## Propiedades derivadas

`activation_score`, `is_connected`, `is_canonical`, `confidence_level`, etc. **no se escriben a
mano**. Son calculadas por el Context Engine (futuro). En P0 hay solo un placeholder:

```yaml
derived:
  managed_by: atlas-context-engine
  cached: false
```

La fuente de verdad de lo derivado será el índice externo en `.atlas/` (ignorado por Git,
regenerable), nunca el archivo.

---

## Git

- **`main`** — conocimiento canónico, protegido. Cambios humanos directos.
- **`agent/<nombre>`** — los agentes commitean propuestas aquí; el humano revisa vía merge.
  Esto materializa el flujo propose → validate → commit del dominio.
- **Commits parseables:** `<tipo>(<entidad>): <desc> [task:<id>] [agent:<nombre>]`.
- **No se versiona:** `.atlas/index/`, `.atlas/cache/`, embeddings (regenerables). Sí se versiona
  todo el Markdown (el conocimiento ES el repo) y el task log (append-only, diffs limpios).

---

## Qué falta construir después (post-P0)

Ver `docs/05-implementation-notes.md`. En resumen: generador de IDs + validador de frontmatter,
índice externo (id↔path + grafo tipado), Context Engine (traversal + presupuesto en tokens +
cascada de degradación), motor de activación, motor de Policy, runtime de Tasks con auditoría, y
el MCP server como interfaz de agentes. Nada de eso es un plugin de Obsidian: vive fuera, como
componente propio (RFC-001.1 §11, RFC-002 §13).

---

## P1 — Validator & Generator

El primer componente de código real vive en `tools/atlas-cli/` (Node.js + TypeScript). Convierte
las convenciones de RFC-002 en reglas verificables. Documentación completa en
[`docs/06-p1-validator-generator.md`](docs/06-p1-validator-generator.md).

```bash
npm run setup            # instala las dependencias del CLI
npm run atlas:validate   # valida todo vault-prototype/
npm run atlas:id -- --type concept       # genera un ID válido
npm run atlas:new -- --type concept --title "Backpressure"   # crea un KO mínimo
npm test                 # corre la suite de tests
```

Valida: YAML, unicidad de IDs, prefijos por tipo, tipos y lifecycle del dominio, relaciones por
`target_id` (incluidas referencias a Tasks en el log), wikilinks mal usados como relaciones
fuertes, y campos derivados escritos a mano. No es MCP server ni Context Engine — solo verifica
que Atlas respeta sus propias reglas.

## Windows: instalación y verificación

### Requisitos previos

- Node.js 22 LTS y npm incluidos en la instalación. Confirmalo con `node --version` y
  `npm --version`.
- Un clon limpio del repositorio. No necesitás instalar `tsx`, TypeScript ni Vitest de forma
  global.

Desde PowerShell, en la raíz del repositorio, instalá las dependencias con el lockfile anidado:

```powershell
npm run setup
```

Después ejecutá la verificación completa. Cada comando devuelve un error si falla, por lo que la
secuencia se puede usar igual en automatización:

```powershell
npm test
npm run typecheck
npm run atlas:validate
npm run atlas:index
npm run atlas:activation
npm run atlas:health
```

`atlas:index` genera archivos regenerables en `vault-prototype/.atlas/index/` y
`atlas:activation` actualiza `vault-prototype/.atlas/cache/`; ambos están ignorados por Git.
`atlas:health` ejecuta validación, índice y activación en ese orden.

### Diagnósticos habituales

- **Node.js o npm no están disponibles:** instalá Node.js 22 LTS, cerrá y abrí PowerShell, y
  volvé a comprobar las versiones.
- **no se instalaron las dependencias:** ejecutá `npm run setup` antes de correr tests, typecheck
  o comandos Atlas. No instales herramientas globales como sustituto.
- **El lockfile falla durante la instalación:** asegurate de estar en un clon limpio y ejecutá
  `npm run setup`; ese comando usa el `package-lock.json` de `tools/atlas-cli`. Si persiste,
  revisá la versión de npm incluida con Node.js 22 y el mensaje exacto de `npm ci`.

## P2 — Index Builder

El primer índice externo regenerable, primer ladrillo del futuro Context Engine. Documentación
completa en [`docs/07-p2-index-builder.md`](docs/07-p2-index-builder.md).

```bash
npm run atlas:index            # valida y genera .atlas/index/*.json
npm run atlas:index -- --clean # borra el índice anterior y reconstruye
```

Genera `objects.json`, `id-path.json`, `path-id.json`, `relations.json`, `graph.json` (con
`edges` y `reverse_edges` para traversal directo y reverso), `tasks.json` y `stats.json`. El
índice es **derivado y regenerable** (no se versiona): si se borra, se reconstruye con un comando.
El Markdown/YAML sigue siendo la única fuente de verdad.

## P3 — Context Engine v0

La primera versión del Context Engine: dado un nodo semilla, ensambla el subgrafo mínimo relevante
recorriendo el grafo fuerte por saltos, con presupuesto. Trabaja sobre el índice de P2, nunca
re-parsea Markdown. Documentación completa en [`docs/08-p3-context-engine-v0.md`](docs/08-p3-context-engine-v0.md).

```bash
npm run atlas:context -- context-engine                 # 2 saltos, ambas direcciones
npm run atlas:context -- context-engine --hops 1 --budget 5
npm run atlas:context -- adr-001-use-ids-over-paths --core-only --direction out
npm run atlas:context -- "Atlas OS" --json
```

Resuelve la semilla por id, slug, path o título; recorre aristas fuertes (directo/reverso) hasta
`--hops`, con presupuesto en nodos (`--budget`), y devuelve el subgrafo como texto legible o JSON.
Es la fase "grafo fuerte" de la cascada de degradación (RFC-001.1 §9). Todavía sin ranking por
activación ni búsqueda semántica — eso es trabajo posterior.

## P4 — Activation v0

La primera implementación del modelo de activación (RFC-001.2): calcula qué tan importante
estructuralmente es cada KO y lo usa para priorizar el contexto. Documentación completa en
[`docs/09-p4-activation-v0.md`](docs/09-p4-activation-v0.md).

```bash
npm run atlas:activation                       # calcula, cachea y muestra el ranking
npm run atlas:activation -- --band REACTIVABLE # filtrar por banda
npm run atlas:context -- context-engine --budget 3 --rank   # contexto priorizado por activación
```

Calcula el **componente estructural** (respaldo humano, centralidad con tope, conexión a Intents
activos, bonus de tensión, piso de importancia), asigna bandas ACTIVO/REACTIVABLE/FRIO, cachea en
`.atlas/cache/` y, con `--rank`, hace que el Context Engine conserve los vecinos de mayor
activación bajo presupuesto. Los pesos son datos recalibrables. Todavía sin componente volátil
(recencia/uso) ni archivado automático — eso necesita el runtime de Tasks.

---

## Estado

**P4 — Activation v0.** Sobre P0–P3, Atlas ahora calcula activación estructural y la usa para
priorizar el contexto. Sigue sin componente volátil, sin decaimiento temporal, sin búsqueda
semántica (grafo débil), sin presupuesto en tokens, sin MCP server y sin runtime de agentes — todo
eso es trabajo posterior (ver `docs/05-implementation-notes.md`).
