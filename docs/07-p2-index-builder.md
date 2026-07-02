# P2 — Index Builder

El primer **índice externo regenerable** de Atlas. Es el primer ladrillo técnico del futuro
Context Engine. Vive en `tools/atlas-cli/` (extiende el CLI de P1) y escribe en
`vault-prototype/.atlas/index/`.

---

## Qué hace P2

A partir del Markdown/YAML del vault (la fuente de verdad), genera un conjunto de archivos JSON
que permiten consultar el grafo tipado **sin volver a parsear Markdown**:

- `objects.json` — metadata mínima indexable de todos los Knowledge Objects.
- `id-path.json` — mapa `id → path` (resuelve relaciones que apuntan a `id`, no a filename).
- `path-id.json` — mapa inverso `path → id` (renombres, debugging).
- `relations.json` — lista plana de todas las relaciones fuertes tipadas, con procedencia.
- `graph.json` — nodos + `edges` + `reverse_edges`, listo para traversal directo y reverso.
- `tasks.json` — Tasks detectadas en los task logs (no hay runtime; solo se indexa lo que existe).
- `stats.json` — conteos por tipo y por relación, para humanos y CI.

Antes de indexar, **corre la validación de P1**. Si el vault no valida, no construye índice.

## Qué NO hace P2 (deliberadamente)

- No es MCP server, no es Context Engine completo.
- No calcula embeddings (`vectors.json`, `semantic-index.json` no existen — eso es otra fase).
- No calcula `activation_score` ni ninguna propiedad derivada de RFC-001.2.
- No hace ranking, búsqueda, traversal avanzado ni construcción de contexto mínimo.
- No ejecuta Tasks (no hay runtime de agentes).
- No indexa los wikilinks del cuerpo como relaciones fuertes (eso será el grafo débil, otra fase).

---

## Por qué existe `.atlas/index/`

El Markdown/YAML es la **fuente de verdad humana**, pero parsear todo el vault en cada consulta
no escala y no da traversal eficiente. El índice externo es **derivado y regenerable**: es una
proyección de solo-lectura de la verdad, optimizada para que un agente o el futuro Context Engine
recorra el grafo tipado rápido. Materializa la Implementation Boundary de RFC-001.1 §11: lo
generado vive separado de lo escrito.

### Fuente de verdad vs índice derivado

| | Fuente de verdad | Índice derivado |
|---|---|---|
| Dónde | los `.md` (knowledge, work, world, ...) | `.atlas/index/*.json` |
| Quién lo escribe | humano y agentes (con procedencia) | el indexer, automáticamente |
| Versionado en Git | sí | **no** (regenerable) |
| Si se borra | se pierde conocimiento | se reconstruye con `npm run atlas:index` |

**Regla dura:** no debe haber ningún dato manual dentro de `.atlas/index/`. Todo proviene del
Markdown/YAML y de los task logs.

---

## Formato de cada JSON

### objects.json
Array de KOs con metadata mínima (sin el body): `id, type, title, lifecycle, path, created,
tags, aliases`.

### id-path.json / path-id.json
Mapas directos e inversos entre `id` (la identidad inmutable) y `path` (la clave humana). Son lo
que permite que renombrar un archivo no rompa el grafo (ADR-001).

### relations.json
Lista plana de relaciones fuertes: `source_id, source_path, relation, target_id, target_label,
strength: "strong", kind: core|extended`, y la procedencia (`deriva_de, escrito_por,
respaldado_por, validado_por`) cuando existe. Incluye tanto las relaciones array como las
escalares (`escrito_por`, etc.) cuyo valor es un id (no `"human"`).

### graph.json
Orientado a traversal:
- `nodes`: `id → {id, type, title, path}`.
- `edges`: `source_id → [{relation, target_id, strength, kind}]` (traversal directo).
- `reverse_edges`: `target_id → [{relation, source_id, strength, kind}]` (traversal reverso).

Solo se crean aristas entre dos nodos KO conocidos. Las relaciones a ids que no son objetos
(p. ej. `task_...`) quedan en `relations.json` pero no en `graph.json`.

### tasks.json
Array de Tasks parseadas de los logs append-only: `id, date, agent, status, source_log,
produced[], cost{tokens, duration_ms}`. Solo se indexa lo que ya existe; no hay runtime.

### stats.json
`generated_at, vault_path, files_scanned, knowledge_objects, relations, tasks, types{},
relations_by_type{}, warnings[], errors[]`.

---

## Cómo correr

```bash
npm run atlas:index
```

Salida en éxito:

```text
Atlas index generated.
Objects: 13
Relations: 18
Tasks: 1
Output: vault-prototype/.atlas/index/
```

Salida si el vault no valida (no escribe nada, exit 1):

```text
Atlas index failed.
Reason: vault validation failed.
Run npm run atlas:validate for details.
```

### Borrar y regenerar desde cero

```bash
npm run atlas:index -- --clean
```

`--clean` borra los JSON del índice anterior antes de reconstruir. Y como el índice es totalmente
derivado, podés borrar la carpeta entera y regenerarla:

```bash
rm -rf vault-prototype/.atlas/index/*.json
npm run atlas:index
```

---

## Cómo prepara el futuro Context Engine

El Context Engine (fase posterior) necesita recorrer el grafo tipado localmente desde unas
semillas, sin tocar el grafo global ni re-parsear Markdown. P2 le entrega exactamente eso:
`graph.json` con `edges`/`reverse_edges` permite traversal directo y reverso O(1) por nodo;
`id-path.json` resuelve cualquier id a su archivo; `relations.json` da la procedencia para
ponderar confianza. Lo que falta encima de esto (ranking por activación, presupuesto en tokens,
cascada de degradación, embeddings para el grafo débil) es trabajo de fases siguientes — pero el
sustrato de traversal ya está.

---

## Decisiones técnicas

- **No duplica lógica:** el indexer corre `validateVault` (P1) como gate y trabaja sobre los
  archivos ya parseados con `parseFile`/`extractRelations`/`collectTaskIds`. El validador sigue
  siendo la única fuente de control.
- **Relaciones escalares como aristas:** `escrito_por`/`respaldado_por`/`validado_por` con valor
  id (no `"human"`) se registran como relaciones y aristas hacia el Actor/Agent. Por eso el conteo
  de `relations` del índice (18) puede ser mayor que el de `atlas:validate` (17), que cuenta solo
  relaciones-array.
- **Tasks por parseo de los bloques YAML del log**, no por runtime. Suficiente para indexar lo
  existente.
- **Escritura idempotente:** correr `atlas:index` dos veces produce el mismo resultado (salvo
  `generated_at`).

---

## Limitaciones actuales

- El parseo de Tasks del log es por regex sobre los bloques ```yaml; suficiente para el formato
  actual, a endurecer si el formato del log crece.
- `cost.duration_ms` queda en `null` (el log de ejemplo no lo registra todavía).
- No hay índice incremental: cada corrida re-parsea el vault completo (aceptable a esta escala; el
  índice incremental es trabajo del Context Engine).
- Las aristas del grafo solo conectan KOs presentes como objetos; referencias a `task_` viven en
  `relations.json`/`tasks.json`, no en `graph.json`.

---

## Tests

```bash
npm test     # 33 tests (P1: 20, P2: +13)
```

Cobertura P2 (graph.test.ts + indexer.test.ts): construye objects/id-path/path-id/relations/graph
correctamente, indexa task logs, falla y no escribe si el vault no valida, `--clean` borra y
reconstruye, no indexa wikilinks del body como relaciones fuertes, stats refleja conteos reales,
y escribe los 7 archivos esperados.
