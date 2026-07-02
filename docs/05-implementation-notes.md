# Implementation Notes — P0

## Qué es este prototipo (P0)
La estructura versionable mínima que implementa RFC-001.x + RFC-002. NO es un vault productivo.
Su único objetivo es **validar decisiones físicas** con ejemplos reales antes de escalar:
estructura de carpetas, naming, frontmatter, relaciones tipadas por `target_id`, IDs, policies,
task logs.

## Decisiones cerradas en P0
- **IDs**: ULID con prefijo legible (`ko_`, `agent_`, `task_`, `policy_`). El filename NO es identidad.
- **Relaciones fuertes**: arrays YAML que apuntan por `target_id` (+ `label`, `deriva_de`,
  `escrito_por` cuando aplica). Wikilinks `[[...]]` solo en el cuerpo, como navegación / aristas débiles.
- **Propiedades derivadas**: NO se cachean aún. Placeholder `derived: {managed_by, cached:false}`.
  El índice externo (Context Engine) vendrá después.

## Cómo está poblado el grafo de ejemplo
Los KOs de ejemplo usan el propio proyecto Atlas como contenido, y forman un subgrafo conectado:

```
Intent(build-a-knowledge-os) <--avanza-- Initiative(Atlas OS)
                                              ^  ^
                                  trata_sobre |  | decide_sobre
                          Concept(Context Engine)  Decision(ADR-001)
                                  ^                     |
                       se_apoya_en|              se_apoya_en / deriva_de
                                  |                     v
                          Insight(context-is-not-memory) --deriva_de--> Source(RFC-002)
                                  |
                            destila_a --> Concept(Context Engine)
Artifact(README) --expresa--> Concept(Context Engine), Decision(ADR-001)
                 --producido_por--> Task(task_...001)  [en el task log]
Agent(claude-research) --gobernado_por--> Policy(agent-relation-creation)
MOC(atlas-architecture) --agrupa--> Concept, Insight, Decision
```

## Qué falta construir después de P0
- **Generador de IDs** (ULID real) y validador de frontmatter contra los schemas.
- **Índice externo** (`.atlas/index/`): mapeo id↔path + grafo tipado parseado del YAML.
- **Context Engine**: traversal local, presupuesto en tokens, cascada de degradación (RFC-001.1 §9).
- **Motor de activación** (RFC-001.2): componente estructural cacheado + volátil lazy.
- **Motor de Policy**: parsea las policies-dato y las aplica a las Tasks.
- **Runtime de Tasks + auditoría**: ejecuta agentes, otorga permisos temporales, escribe el log.
- **MCP server**: interfaz de agentes sobre todo lo anterior.

## Open Questions heredadas (a validar con este prototipo)
- RFC-002 #1: ¿se versiona el caché de propiedades derivadas en Git? (en P0 no se cachea, evitado).
- RFC-002 #3: sintaxis exacta de relaciones con procedencia inline (P0 fija una forma; validar uso).
- RFC-002 #4: mecanismo de ID (P0 usa ULID con prefijo; confirmar generación real).
- RFC-001.2 #1: calibración de pesos de activación (período de "solo observación" recomendado).
