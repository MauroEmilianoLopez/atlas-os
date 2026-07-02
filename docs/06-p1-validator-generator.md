# P1 — Atlas Validator & Generator

El primer componente de **código real** de Atlas. Convierte las convenciones de RFC-002 (que en
P0 eran solo documentación) en **reglas verificables por máquina**.

Vive en `tools/atlas-cli/` (Node.js + TypeScript).

---

## Qué hace P1

1. **Genera IDs válidos** (ULID con prefijo legible: `ko_`, `agent_`, `task_`, `policy_`).
2. **Valida el frontmatter** de cada Knowledge Object contra el contrato común (RFC-002 §5).
3. **Valida unicidad de IDs** en todo el vault.
4. **Valida relaciones por `target_id`** — que cada referencia apunte a un id existente.
5. **Valida lifecycle** (`fleeting | living | archived`) y **tipos** (los 15 del dominio).
6. **Valida que los IDs tengan el prefijo correcto** para su tipo.
7. **Valida Task logs** — resuelve referencias `task_...` contra el log append-only.
8. **Detecta wikilinks usados como relaciones fuertes** (prohibido: no son fuente de verdad).
9. **Detecta campos derivados escritos a mano** fuera de `derived:` (deben calcularse).
10. **Crea Knowledge Objects mínimos** desde templates (`atlas new`).

## Qué NO hace P1 (deliberadamente)

- No es un MCP server.
- No es el Context Engine.
- No calcula `activation_score` ni ninguna propiedad derivada (solo verifica el placeholder).
- No construye el índice de grafo en `.atlas/`.
- No ejecuta Tasks (no hay runtime de agentes todavía).
- No toca el diseño de dominio.
- No instala plugins de Obsidian.

Su único objetivo: **que Atlas pueda verificar sus propias reglas antes de meter conocimiento real.**

---

## Instalación

```bash
# desde la raíz del repo
npm run setup            # equivale a: npm --prefix tools/atlas-cli install
```

(También funciona `cd tools/atlas-cli && npm install`.)

---

## Cómo correr validaciones

```bash
npm run atlas:validate
```

Salida en éxito:

```text
Atlas validation passed.
Files scanned: 17
Knowledge Objects: 13
Relations checked: 17
Task references checked: 1
Errors: 0
Warnings: 0
```

Salida en fallo (agrupada por archivo, con código de salida 1):

```text
Atlas validation failed.

ERROR knowledge/concepts/context-engine.md
- relation se_apoya_en[0].target_id points to unknown id ko_xxx

Files scanned: 18
...
Errors: 1
Warnings: 0
```

Validar otro vault: `npm run atlas:validate -- <ruta>` o directamente
`tools/atlas-cli/node_modules/.bin/tsx tools/atlas-cli/src/cli.ts validate <ruta>`.

---

## Cómo generar un ID

```bash
npm run atlas:id -- --type concept
# -> ko_01JZ...
npm run atlas:id -- --type agent
# -> agent_01JZ...
```

Mapeo de prefijos: la mayoría de los KO usan `ko_`; `agent`→`agent_`, `task`→`task_`,
`policy`→`policy_`.

---

## Cómo crear un Knowledge Object

```bash
npm run atlas:new -- --type concept --title "Backpressure"
# -> Created knowledge/concepts/backpressure.md
#    id: ko_01JZ...
```

- El archivo se crea en la carpeta correcta según el tipo (RFC-002 §3).
- El filename es un slug ASCII kebab-case derivado del título (sin acentos).
- Tipos temporales (`event`, `decision`) llevan prefijo `YYYY-MM-DD`; `initiative` lleva el año.
- Si el archivo ya existe, **no se sobrescribe** salvo `--force`.
- El KO generado nace en `lifecycle: fleeting` con el placeholder `derived` correcto, y
  **pasa la validación inmediatamente**.

Tipos soportados por `new`: concept, insight, initiative, event, decision, source, artifact,
prompt, policy, agent (y los demás del mapeo de carpetas).

---

## Cómo interpretar errores

| Mensaje | Qué significa |
|---|---|
| `Invalid YAML frontmatter in ...` | El bloque `---` tiene YAML mal formado. |
| `duplicate id "..."` | Dos KOs declaran el mismo `id`. La identidad debe ser única. |
| `frontmatter <campo>: ...` | Falta un campo required o tiene un valor inválido (zod). |
| `id "..." prefix does not match type` | El prefijo del id no corresponde al tipo (ej. un `agent` con `ko_`). |
| `relation X[i].target_id points to unknown id ...` | La relación apunta a un id que no existe. |
| `relation X[i].target_id points to unknown task ...` | Un `task_...` no aparece en el task log. |
| `relation X[i] is a bare wikilink ...` | Se usó `[[...]]` como relación fuerte (prohibido). |
| `derived field "..." must not be set manually` | Se escribió a mano una propiedad derivada. |

Warnings (no bloquean): por ejemplo `derived.cached should be false in P1`.

---

## Decisiones técnicas tomadas

- **Stack:** Node.js + TypeScript, dependencias livianas (`zod`, `gray-matter`, `js-yaml`,
  `fast-glob`, `ulid`, `commander`, `vitest`, `tsx`). Sin frameworks pesados. Elegido por
  compatibilidad con el ecosistema Obsidian y el futuro MCP server, y por correr fácil en Windows.
- **El validador es una librería pura** (`validateVault` devuelve resultado estructurado); la CLI
  es una capa fina encima. Esto permite que el futuro MCP server reutilice la misma lógica.
- **Parseo de YAML estricto:** se usa `js-yaml` en modo que lanza error ante YAML inválido, en
  vez de tragarlo silenciosamente.
- **Las Tasks no son archivos:** sus ids se extraen del log append-only en `execution/tasks/`
  (RFC-002 §8). Los `target_id` que empiezan con `task_` se resuelven contra ese conjunto.
- **Relaciones escalares vs array:** `escrito_por`/`respaldado_por`/`validado_por` aceptan un id
  o `"human"`; el resto son arrays de `{ target_id, ... }`.
- **Formas inversas reconocidas:** `producido_por`, `gobernado_por` se validan igual que sus
  formas activas (aparecen en los KOs de ejemplo).

---

## Limitaciones actuales

- No valida la *semántica* de las relaciones (ej. que `decide_sobre` solo salga de un `decision`);
  solo valida estructura y que los targets existan. La validación semántica por tipo es trabajo futuro.
- No verifica la regla de falsabilidad (que toda arista fuerte de un *agente* incluya `deriva_de`):
  requiere distinguir autoría humana de agente, que se hará cuando exista el runtime de Tasks.
- No construye ni consulta el índice de grafo; cada validación re-parsea el vault (aceptable a
  esta escala; el índice incremental es trabajo del Context Engine).
- `confidence_level` y `activation_score` solo se verifican como ausentes del top-level; su
  cálculo es P2+.

---

## Tests

```bash
npm test     # 20 tests, 4 archivos
```

Cubren los 8 casos requeridos: genera IDs con prefijo correcto · parsea frontmatter válido ·
detecta YAML inválido · detecta ID duplicado · detecta `target_id` inexistente · valida una
relación fuerte correcta · detecta wikilink usado como relación fuerte · resuelve un `task_id`
desde el task log. Más casos extra (prefijo incorrecto, campo derivado manual, forma corta de relación).
