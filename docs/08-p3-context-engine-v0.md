# P3 — Context Engine v0

La primera versión del **Context Engine**: dado un nodo semilla, ensambla el subgrafo mínimo
relevante recorriendo el grafo **fuerte** por saltos, con un presupuesto. Es la primera pieza que
convierte el índice estático de P2 en **recuperación de contexto real**.

Trabaja 100% sobre el índice de P2 (`graph.json`) — **nunca re-parsea Markdown**.

---

## Qué hace P3

- Comando `atlas:context <seed>` que construye un subgrafo de contexto alrededor de una semilla.
- Resuelve la semilla por **id**, **slug de archivo**, **path** o **título** (case-insensitive).
- Traversal BFS por saltos (`--hops`, default 2) sobre aristas fuertes, directo y/o reverso.
- Presupuesto en **nodos** (`--budget`, default 20); si se excede, marca `truncated`.
- Opciones: `--direction out|in|both`, `--core-only` (solo aristas core), `--json`.
- Salida legible (árbol por profundidad + lista de aristas) o JSON crudo del subgrafo.

## Qué NO hace v0 (deliberadamente, y por qué)

- **No rankea por activación** — el modelo de activación (RFC-001.2) está diseñado pero no
  implementado. Sin él, no hay "memoria activada" que inyectar. v0 expande por estructura, no por calor.
- **No hace búsqueda semántica** — el grafo débil (embeddings) es P4. v0 es solo la fase "grafo
  fuerte" de la cascada de degradación de RFC-001.1 §9.
- **El presupuesto es en NODOS, no en tokens** — el presupuesto en tokens necesita cargar el body
  de cada KO y (idealmente) la activación. v0 es honesto sobre esta limitación: cuenta nodos.
- **No genera el contexto final para un LLM** — no arma un prompt ni concatena contenido; entrega
  el subgrafo (qué KOs son relevantes y cómo se conectan). Empaquetarlo para un modelo es fase posterior.
- No es MCP server, no ejecuta Tasks, no toca el dominio.

---

## Cómo correr

```bash
# valida + indexa primero (el context necesita el índice de P2)
npm run atlas:index

# contexto alrededor de un Concept, 2 saltos, ambas direcciones
npm run atlas:context -- context-engine

# limitar profundidad y presupuesto
npm run atlas:context -- context-engine --hops 1 --budget 5

# solo relaciones core, solo salientes
npm run atlas:context -- adr-001-use-ids-over-paths --core-only --direction out

# resolver por título, salida JSON
npm run atlas:context -- "Atlas OS" --json
```

Si no existe el índice, avisa: `No index found ... Run: npm run atlas:index`.
Si la semilla no resuelve: `Could not resolve seed "..." to any Knowledge Object.` (exit 1).

### Ejemplo de salida (legible)

```text
Context for: Context Engine  (ko_01JZ000000000000000010)
hops=2 budget=20 direction=both

Nodes (10):
  [d0] concept: Context Engine  (knowledge/concepts/context-engine.md)
    [d1] insight: El contexto se construye, no se lee  (...)
    [d1] initiative: Atlas OS  (...)
    [d1] decision: ADR-001 — ...  (...)
      [d2] source: RFC-002 — Physical Representation Design  (...)
      ...

Edges (22):
  Context Engine --se_apoya_en->-- El contexto se construye, no se lee  [core]
  ADR-001 — ... --se_apoya_en<--- Context Engine  [core]
  ...
```

La profundidad (`d0/d1/d2`) muestra cuántos saltos hay desde la semilla; las aristas reconstruyen
la cadena de razonamiento, no solo una lista plana.

---

## Cómo funciona el traversal (v0)

1. Resolver la semilla a un `id` de nodo.
2. BFS por niveles de profundidad hasta `hops`. En cada nodo, reunir aristas candidatas (salientes
   de `edges`, entrantes de `reverse_edges`, según `--direction`).
3. Orden **determinista**: core antes que extended, luego por id del vecino. Correr dos veces da el
   mismo resultado (hay un test que lo verifica).
4. Agregar vecinos nuevos mientras haya presupuesto de nodos; si se agota, marcar `truncated` y
   dejar de agregar nodos (pero seguir registrando aristas entre los ya presentes).
5. Al final, conservar solo las aristas cuyos dos extremos entraron en el contexto.

---

## Cómo prepara las fases siguientes

- **P4 (grafo débil / semántica):** la cascada de RFC-001.1 §9 dice "grafo fuerte → memoria
  activada → semántica → textual → aclaración". P3 implementa el primer nivel. P4 enchufa la
  búsqueda semántica como fallback cuando el traversal fuerte no alcanza.
- **Activación (RFC-001.2):** cuando exista, se usará para (a) priorizar qué vecinos entran primero
  bajo presupuesto, y (b) inyectar "memoria activada" como nivel 2 de la cascada. La firma de
  `buildContext` ya está lista para recibir ese ranking.
- **Presupuesto en tokens:** cuando se cargue el body de los KOs, el presupuesto pasará de nodos a
  tokens y la compresión a gist entrará en juego.

---

## Decisiones técnicas

- **Módulo puro + CLI fina:** `buildContext(idx, seedId, opts)` es una función pura sobre el índice
  cargado; la CLI solo resuelve la semilla y renderiza. El futuro MCP server reutiliza `buildContext`.
- **Lee el índice, no el Markdown:** `index-loader.ts` carga `graph.json`/`objects.json`/etc. Si el
  índice no está, falla con instrucción de construirlo. El costo del contexto depende del subgrafo,
  no del tamaño del vault (propiedad de escala de RFC-001.1 §9.4).
- **Aristas escalares incluidas:** `escrito_por` a un agente aparece como arista (viene del índice),
  así el contexto de un KO incluye quién lo escribió.

---

## Limitaciones actuales

- Presupuesto en nodos, no en tokens (ver arriba).
- Sin ranking: bajo presupuesto, el corte es por orden determinista (core-first, luego id), no por
  relevancia real. Es predecible pero no "inteligente" — eso llega con activación.
- Sin degradación semántica: si el grafo fuerte no conecta nada, el contexto queda chico; no hay
  fallback a embeddings todavía (P4).
- El traversal trata todas las aristas fuertes como igualmente transitables; no distingue que
  algunos verbos (p. ej. `contradice`) quizá deban expandirse distinto. Refinamiento futuro.

---

## Tests

```bash
npm test     # 47 tests (P1: 20, P2: +13, P3: +14)
```

Cobertura P3 (context.test.ts + index-loader.test.ts): traversal de 1 y N saltos, presupuesto y
truncación, `core-only`, `direction=in`, aristas con ambos extremos presentes, semilla desconocida,
determinismo; y carga del índice + resolución de semilla por id/slug/título + error si no hay índice.
