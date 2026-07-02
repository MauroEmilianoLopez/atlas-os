# PROYECTO ATLAS — RFC-002
## Physical Representation Design

**Estado:** Fase 3 — Representación física mínima viable
**Base:** RFC-001, RFC-001.1, RFC-001.2 (dominio cerrado)
**Alcance:** Cómo el dominio se materializa en Markdown + YAML + Git + Obsidian, pensado para un futuro MCP server / Context Engine. NO es el vault final; es la representación mínima viable.
**Principio rector heredado (P8):** la representación física es una implementación del dominio, no el dominio. Nada de lo que sigue puede contradecir RFC-001.x; donde Markdown/Obsidian no alcanza, se construye fuera, no se deforma el dominio.

---

## 1. Executive Summary

1. **No todo Knowledge Object es un archivo.** La regla: es un archivo si tiene identidad estable, ciclo de vida propio y se referencia desde otros lugares. Concept, Insight, Initiative, Event, Decision Record, Source, Artifact, Prompt, Agent, Policy → archivo. Signal vive en un inbox/daily hasta destilarse. Excerpt vive dentro de su Source salvo que entre en una relación. Feedback es un Event. Task es un log estructurado append-only, no un archivo bonito por ejecución.

2. **Las carpetas reflejan el *tipo* (capa de ejecución / capa de conocimiento), no el *tema*.** Esto es deliberado y contraintuitivo: el caso real de la fase 1 demostró que organizar por tema colapsa a escala. Una docena de carpetas de primer nivel por tipo de entidad, planas, sin jerarquía temática. El tema lo dan las relaciones y los tags, no la ubicación.

3. **El nombre de archivo es una clave humana legible, NO el identificador.** El identificador es un campo `id` inmutable en el frontmatter. El nombre puede cambiar (renombrar un Concept) sin romper nada, porque las relaciones apuntan al `id`, no al path. Esto resuelve el problema más caro de los vaults a 10 años: renombrar rompe wikilinks.

4. **Las relaciones tipadas viven en YAML, no en wikilinks inline.** Decisión central: un wikilink no tiene tipo. Las relaciones core/extendidas se representan como listas YAML tipadas (`se_apoya_en: [[...]]`), legibles por humano en el frontmatter y triviales de parsear por un agente. Los wikilinks inline en prosa quedan como aristas *débiles* (asociativas), que es exactamente su naturaleza.

5. **Las propiedades derivadas NO se escriben a mano y NO son la fuente de verdad.** `activation_score`, `is_connected`, `is_canonical`, `confidence_level` viven en un **índice externo** (el futuro Context Engine), no en el Markdown. Se pueden *cachear* en YAML para lectura humana, pero marcadas como gestionadas-por-agente y nunca editadas por el humano. La fuente de verdad de lo derivado es el índice, no el archivo.

6. **La auditoría de Tasks es un log append-only, no un archivo por Task.** Convertir cada ejecución en un `.md` produciría miles de archivos basura. Las Tasks se registran como entradas estructuradas en un log (particionado por tiempo); solo las Tasks de alto valor que producen un Artifact o Decision Record dejan un archivo referenciable. El resto vive en el log.

7. **Las Policies son archivos Markdown con frontmatter declarativo** — sujeto, condición, efecto — legibles por vos y por los agentes antes de actuar. Pocas, versionadas, en su propia carpeta.

8. **Ocho templates, ni uno más.** Concept, Insight, Initiative, Event/Decision, Source, Artifact, Prompt, Policy. Signal no necesita template (es una línea en el inbox). Task no necesita template (la genera el runtime). Agent es casi solo frontmatter.

9. **Git es el versionado y el sensor de cambios.** Branch por agente para cambios de IA (revisión humana vía merge), main protegida para lo canónico, commits con convención parseable. El índice del Context Engine y los embeddings NO se versionan (se regeneran).

10. **Obsidian arranca casi desnudo.** Core features + Properties + Bases. Solo dos plugins de comunidad indispensables al inicio (Git y un capturador rápido), todo lo demás diferido. La regla anti-dependencia: si una feature es core o se puede lograr con convención, no se instala un plugin.

---

## 2. File as Knowledge Object Strategy

### 2.1 La regla de decisión

Un Knowledge Object **es un archivo** si y solo si cumple las tres condiciones:
1. Tiene **identidad estable** (existe como "cosa" referenciable, no como fragmento).
2. Tiene **ciclo de vida propio** (FLEETING/LIVING/ARCHIVED individual).
3. Es **referenciado** desde otros KOs (target de relaciones).

Si falla alguna, vive *embebido* en otro KO o en un log.

### 2.2 Decisión por entidad

| Entidad | ¿Archivo propio? | Dónde vive si no | Justificación |
|---|---|---|---|
| `Concept` | **Sí** | — | Identidad, lifecycle, altamente referenciado. El caso canónico. |
| `Insight` | **Sí** | — | Igual que Concept; puede `destila_a` Concept (cambio de archivo). |
| `Initiative` | **Sí** | — | Ancla de trabajo, referenciada por Tasks/Decisions. |
| `Event` | **Sí** | — | Ancla temporal, referenciada por Decisions. |
| `Decision Record` | **Sí** | — | Nodo de razonamiento de máximo valor; siempre archivo. |
| `Source` | **Sí** | — | Referente de atribución estable. |
| `Excerpt` | **Condicional** | Dentro de la Source (bloque con ancla) | Solo se promueve a archivo cuando entra en una relación fuerte (`deriva_de`). Evita explosión de 200 archivos por libro. |
| `Artifact` | **Sí** | — | Salida expresada, referenciable, con estado de publicación. |
| `Actor` | **Sí** | — | Referente de alta conectividad. |
| `Technology` | **Sí** | — | Nodo que cruza capas; muy referenciado. |
| `Intent` | **Sí** | — | Da dirección; referenciado por `avanza`. |
| `Prompt` | **Sí** | — | Conocimiento operativo versionado. |
| `Agent` | **Sí** (ligero) | — | Casi solo frontmatter: identidad, permisos base, reputación cacheada. |
| `Signal` | **No (al inicio)** | Inbox o daily note (una línea/bloque) | Alta rotación, caduca por defecto. Se promueve a archivo solo si se destila a Concept/Insight. |
| `Feedback` | **No** | Es un `Event` tipado (log o archivo Event) | Decisión de dominio RFC-001.1: reutiliza Event. |
| `Task/Execution` | **No (regla general)** | Log append-only estructurado | Miles de ejecuciones ⇒ log, no archivos. Solo Tasks que producen Artifact/Decision dejan rastro de archivo. (§8) |
| `Policy` | **Sí** | — | Pocas, versionadas, legibles por agentes. |

---

## 3. Folder Structure

### 3.1 Principio: carpeta = tipo, nunca tema

Las carpetas son una conveniencia de navegación, performance de Git y partición para agentes — **no son el modelo de dominio** (lo dice el mandato y lo confirma la evidencia de fase 1: organizar por tema colapsa a las ~1.000 notas). Una nota nunca se clasifica por "de qué trata" vía su carpeta; eso lo dan relaciones y tags. La carpeta solo dice "qué tipo de objeto es esto".

### 3.2 Estructura mínima propuesta

```
atlas/
├── knowledge/              # Capa 4 — conocimiento destilado (lo más estable)
│   ├── concepts/
│   ├── insights/
│   ├── intents/
│   └── prompts/
├── work/                   # Capa 2 — artefactos de trabajo
│   ├── initiatives/
│   ├── events/             # incluye Feedback como Event tipado
│   ├── decisions/
│   ├── sources/
│   └── artifacts/
├── world/                  # Capa 3 — entidades del mundo
│   ├── actors/
│   └── technologies/
├── flow/                   # Capa 1 — flujo / captura
│   ├── inbox.md            # Signals crudas (una por línea/bloque)
│   └── daily/              # notas diarias (capture sessions como metadata)
├── execution/              # Plano de ejecución
│   ├── agents/
│   ├── policies/
│   └── tasks/              # log append-only, particionado por tiempo
├── maps/                   # MOCs — nodos de gobernanza/navegación
└── .atlas/                 # gestionado por el sistema, NO por el humano
    ├── index/              # índice de grafo (regenerable, no se versiona)
    └── cache/              # activation_score, derived props (regenerable)
```

Notas de diseño:
- Las carpetas de primer nivel espejan las **capas del dominio**, no temas. Esto le da a un agente una pista estructural: leer `knowledge/concepts/` es leer la capa destilada.
- `maps/` es la única carpeta "transversal": las MOCs cruzan capas por diseño (un mapa de "sistemas distribuidos" enlaza Concepts, Technologies, Decisions). Es deliberado y consistente con que las MOCs son nodos de gobernanza.
- `.atlas/` es la frontera física entre lo que el humano edita (todo lo demás) y lo que el sistema genera (índice, caché). Va al `.gitignore` parcialmente (§11). Esta carpeta es la materialización de la Implementation Boundary de RFC-001.1: lo derivado vive aparte de lo escrito.
- **No hay carpeta por proyecto ni por tema.** Si querés "ver todo lo del proyecto Atlas", eso es una query/Base sobre la relación `trata_sobre`, no una carpeta.

### 3.3 Lo que NO se hace

No subcarpetas temáticas dentro de `concepts/` (nada de `concepts/distributed-systems/`). El tema lo da el grafo. Subcarpetar por tema es exactamente el error que reintroduce el colapso a escala. La única excepción aceptable a futuro: particionar `events/` y `tasks/` por año si el volumen lo exige (performance de Git/filesystem), porque son los de mayor cardinalidad — pero eso es partición por fecha, no por tema.

---

## 4. Naming Convention

### 4.1 Principio: el nombre es clave humana, el `id` es la identidad

El nombre de archivo es para que vos navegues y para que Obsidian muestre wikilinks legibles. **NO es el identificador del dominio.** El `id` (frontmatter, §5) es inmutable; el nombre puede cambiar. Las relaciones se resuelven por `id`, no por path — así renombrar nunca rompe el grafo. (El Context Engine mantiene el mapeo id↔path en su índice.)

### 4.2 Reglas

- **Minúsculas, kebab-case, sin acentos ni ñ en el filename.** Razón: portabilidad cross-OS, amabilidad con Git (evita problemas de case-insensitive en algunos FS), y parseo trivial. El título *legible con acentos* vive en `title:` (frontmatter); el filename es el slug ASCII.
- **Sin fecha** para entidades atemporales (Concept, Technology, Actor, Source, Prompt, Intent): `concepts/backpressure.md`, `technologies/kafka.md`, `actors/nick-milo.md`.
- **Con fecha prefijo `YYYY-MM-DD`** para entidades ancladas en el tiempo (Event, Decision, Initiative datada, Task): `events/2026-06-29-rfc-review.md`, `initiatives/2026-atlas-os.md`.
- **Prefijo de serie** para entidades numeradas (Decision Records): `decisions/adr-001-context-engine.md` — el ADR mantiene su número de serie como parte del nombre porque el orden importa y es una convención reconocible.
- **Idioma:** slugs en inglés por defecto (portabilidad, consistencia con el vocabulario técnico), `title`/`aliases` en el idioma que prefieras. Esto evita la mezcla español/inglés en paths que envejece mal.

### 4.3 Ejemplos canónicos

```
knowledge/concepts/backpressure.md
knowledge/insights/over-optimization-cost-atlas.md
knowledge/intents/become-staff-architect.md
knowledge/prompts/distill-signals-to-concepts.md
work/initiatives/2026-atlas-os.md
work/events/2026-06-29-rfc-review.md
work/decisions/adr-001-context-engine.md
work/sources/book-how-to-take-smart-notes.md
work/artifacts/2026-07-linkedin-post-context-engine.md
world/actors/nick-milo.md
world/technologies/kafka.md
execution/agents/distiller-agent.md
execution/policies/agent-relation-creation.md
maps/distributed-systems.md
```

---

## 5. YAML Frontmatter Standard

### 5.1 Principio: cuatro clases de campo con dueño distinto

El error que evita este diseño es mezclar campos que el humano edita con campos que un agente sobreescribe — eso produce conflictos de Git y corrupción. Cada campo declara su **dueño**:

- **Required** — todo KO los tiene. Mínimos.
- **Optional (human-managed)** — el humano los pone si quiere.
- **Relations (human or agent, with provenance)** — las relaciones tipadas (§6).
- **Derived (agent-managed, NEVER hand-edited)** — cacheados desde el índice; el humano nunca los toca.

### 5.2 Campos comunes a todos los KO

**Required (humano o sistema en creación):**
- `id` — identificador inmutable, único, opaco (no derivado del título). La identidad real. Nunca cambia.
- `type` — la entidad de dominio (concept, insight, initiative, event, decision, source, artifact, actor, technology, intent, prompt, agent, policy).
- `title` — título legible (con acentos/idioma libre).
- `lifecycle` — `fleeting | living | archived`. El único estado real (RFC-001.1). Editable por humano y agente bajo Policy.
- `created` — timestamp de creación. Inmutable.

**Optional (human-managed):**
- `aliases` — nombres alternativos para wikilinks.
- `tags` — clasificación transversal ligera (no jerárquica).
- `updated` — timestamp de última edición (puede automatizarse).

**Relations (con procedencia, §6):**
- Las relaciones core/extendidas como listas YAML.
- `escrito_por`, `respaldado_por` — procedencia (RFC-001.1 §3.4).

**Derived (agent-managed, NUNCA a mano — §7):**
- `activation_score`, `confidence_level`, `is_connected`, `is_canonical`, `is_deprecated`, `is_evergreen`, `review_required`.
- Marcados convencionalmente (prefijo o bloque separado) para dejar visualmente claro que son generados.

### 5.3 Convención para separar dueños visualmente

Para que sea obvio al humano qué no debe tocar, los campos derivados van agrupados bajo un namespace claro, p. ej. un bloque `derived:` anidado, o prefijados `_` (`_activation_score`). El prefijo `_` comunica "generado, no editar" sin necesidad de documentación externa. Esto es convención de representación, no dominio.

---

## 6. Typed Relations Representation (punto crítico)

### 6.1 La decisión: relaciones fuertes en YAML, débiles en prosa

Obsidian no tiene relaciones tipadas nativas. Las opciones evaluadas:

| Opción | Humano | Máquina | Veredicto |
|---|---|---|---|
| Wikilinks inline sin tipo | bueno | malo (sin tipo) | Solo sirve para aristas débiles. |
| Sintaxis inline propia (`[verbo:: [[x]]]`, estilo Dataview) | regular (ruido en prosa) | bueno | Acopla a sintaxis de un plugin; viola P8. |
| Arrays YAML tipados | bueno (legible en frontmatter) | excelente (parseo trivial) | **Elegido para aristas fuertes.** |
| Secciones Markdown estructuradas | excelente para humano | frágil de parsear | Complemento opcional, no fuente de verdad. |

**Estrategia elegida — combinación con jerarquía clara:**

- **Aristas FUERTES (razonamiento) → arrays YAML tipados.** Cada relación core/extendida es una clave en el frontmatter cuyo valor es una lista de referencias (`id` o wikilink resoluble a `id`). Son la fuente de verdad del grafo de razonamiento. Legibles por el humano en el frontmatter, triviales para el agente.

- **Aristas DÉBILES (descubrimiento) → wikilinks inline en la prosa.** Mencionar `[[backpressure]]` dentro del texto de una nota es una asociación, no una afirmación tipada. El Context Engine las trata como señales de descubrimiento, nunca como aristas de razonamiento. Esto le da a los wikilinks de Obsidian su rol natural sin pretender que son lo que no son.

### 6.2 Forma de las relaciones tipadas en YAML

Conceptualmente (sin fijar sintaxis exacta de fase de implementación), cada relación fuerte es una lista cuyos elementos pueden llevar **metadata de procedencia inline** cuando importa:

```yaml
se_apoya_en:
  - target: "[[backpressure]]"
    escrito_por: distiller-agent
    deriva_de: "[[adr-001-context-engine]]"
contradice:
  - target: "[[eager-loading-everything]]"
    respaldado_por: human
```

Para relaciones simples sin necesidad de procedencia inline, basta la lista de targets. La procedencia por-arista solo se añade cuando la relación la afirmó un agente (falsabilidad obligatoria, RFC-001.1 §8.2: una arista fuerte de agente DEBE citar `deriva_de`).

### 6.3 Por qué esto satisface a humano y máquina

El humano lee el frontmatter y ve "esta nota se apoya en backpressure y contradice X" en lenguaje claro. El agente parsea YAML —operación trivial y robusta— y obtiene el grafo tipado con procedencia sin heurísticas de texto. Y como las relaciones apuntan a `id` (resoluble desde el wikilink), renombrar no las rompe.

---

## 7. Derived Properties Strategy

### 7.1 Principio: la fuente de verdad de lo derivado es el índice, no el archivo

`activation_score`, `is_connected`, `is_canonical`, `is_deprecated`, `is_evergreen`, `review_required`, `confidence_level` son **propiedades calculadas** (RFC-001.1 §5.2, RFC-001.2). Tres opciones evaluadas:

1. **No existir en Markdown, solo en el índice externo** — purista, pero el humano no las ve al abrir la nota.
2. **Cachearse en YAML** — visible, pero riesgo de que el humano las edite o de conflictos de Git.
3. **Índice externo + caché de solo-lectura en YAML** — lo mejor de ambos.

**Estrategia elegida: opción 3.** La fuente de verdad vive en `.atlas/index/` (el Context Engine). Se *cachea* en el YAML del archivo (en el namespace `_`/`derived:`) para que el humano y las Bases de Obsidian las vean, pero:
- El humano NUNCA las edita (convención `_` + Policy).
- El caché lo escribe solo el agente/runtime, en su propia rama de Git o en commits marcados (§11), para no contaminar el historial de edición humana.
- Si el caché y el índice divergen, **el índice gana**; el caché se regenera.

### 7.2 Por qué cachear en vez de solo índice

Porque queremos que Obsidian Bases pueda filtrar/ordenar por `activation_score` o `lifecycle` sin un plugin custom, y que el humano vea de un vistazo el estado de una nota. Es la concesión pragmática que mantiene la experiencia humana rica sin violar que el dominio calcula, no transiciona. El precio (regenerar caché) es barato y el índice es siempre la verdad.

---

## 8. Task / Execution Representation

### 8.1 Principio: log append-only, no archivo por Task

Convertir cada ejecución en un `.md` produciría miles de archivos efímeros que ahogan el vault y el grafo. Las Tasks son de altísima cardinalidad y la mayoría son rutinarias. Estrategia en dos niveles:

**Nivel 1 — Log estructurado append-only (la mayoría de las Tasks).**
Las ejecuciones se registran como entradas estructuradas en un log particionado por tiempo en `execution/tasks/` (p. ej. un archivo por día o por mes, append-only). Cada entrada captura los campos de auditoría de RFC-001.1 §4.2: intención, agente, contexto requerido/entregado (referencias, no el contenido completo), permisos temporales, estado, outputs, cambios propuestos vs aplicados, feedback, costo. El log es la fuente de auditoría.

**Nivel 2 — Archivo referenciable (solo Tasks de alto valor).**
Una Task que produce un Artifact o un Decision Record genera, además de su entrada de log, una relación `produjo` desde un objeto referenciable. El Artifact/Decision queda como archivo (ya lo es); la Task que lo produjo se cita por su `id` de log. No se crea un `.md` de Task; se crea el output y se enlaza al log.

### 8.2 Por qué esto preserva auditoría sin basura

Toda ejecución es auditable (está en el log, con contexto entregado y razonamiento). Pero el grafo de conocimiento no se contamina con miles de nodos-Task. La trazabilidad se mantiene por referencia al `id` de la entrada de log. El log es append-only (nunca se edita), lo que lo hace confiable como auditoría y amigable con Git (solo añade líneas, sin conflictos de merge).

### 8.3 Qué NO va en el log

El contexto entregado se guarda como **referencias** (qué KOs se incluyeron), no como copia del contenido — copiar el contenido inflaría el log y duplicaría conocimiento. Para reconstruir exactamente qué vio un agente, se combinan las referencias con el historial de Git de esos KOs.

---

## 9. Policy Representation

### 9.1 Archivos Markdown con frontmatter declarativo

Las Policies son pocas, viven en `execution/policies/`, una por archivo, versionadas. Cada una es legible por el humano (prosa explicativa en el cuerpo) y por el agente (frontmatter declarativo estructurado).

Estructura conceptual:
- **Frontmatter declarativo:** `subject` (a qué/quién aplica: tipo de agente, tipo de Task, tipo de KO), `condition` (cuándo aplica), `effect` (allow / require_approval / deny / expire), y los detalles del efecto.
- **Cuerpo Markdown:** la justificación legible — por qué existe esta regla, qué riesgo mitiga. Esto es para vos y para que un agente entienda el *propósito*, no solo la regla.

### 9.2 Ejemplos de Policies (conceptuales)

- **`agent-relation-creation`** — subject: agentes; effect: pueden crear `deriva_de`, `trata_sobre` con evidencia obligatoria; `contradice`/`decide_sobre` requieren `validado_por` humano.
- **`signal-expiry`** — subject: Signals fleeting; condition: sin triagear > 30d; effect: candidata a purga si huérfana.
- **`canonical-promotion`** — subject: cualquier KO; condition: promoción a is_canonical; effect: require_approval humano.
- **`external-content-isolation`** — subject: agentes que procesan contenido web/email; effect: deny lectura de KO privados, deny escritura sobre canónico (defensa anti-trifecta-letal de RFC-001.1).
- **`activation-weights`** — subject: motor de activación; effect: define los pesos de RFC-001.2 como dato recalibrable.

### 9.3 Por qué declarativo + prosa

El frontmatter declarativo es lo que el motor de Policy parsea y aplica. La prosa es lo que mantiene la regla comprensible y mantenible a 10 años — una Policy sin su "por qué" se vuelve un misterio que nadie se anima a cambiar. Las dos cosas en un archivo, sin duplicación (P5).

---

## 10. Minimal Templates (máximo 8)

Solo lo necesario para empezar. Signal no lleva template (es una línea en el inbox). Task no lleva template (la genera el runtime). Agent es casi solo frontmatter (template trivial, no cuenta).

| # | Template | Propósito | Frontmatter base | Cuerpo sugerido |
|---|---|---|---|---|
| 1 | **Concept** | Idea atómica atemporal | id, type:concept, title, lifecycle, created, se_apoya_en, contradice, deriva_de, escrito_por, respaldado_por | Definición en una frase · Desarrollo · Ejemplos (`ejemplifica`) · Relaciones clave |
| 2 | **Insight** | Aprendizaje propio situado | base + `deriva_de` (Event/Initiative), `destila_a` (si aplica) | Contexto en que se aprendió · El aprendizaje · A qué Concept podría destilar |
| 3 | **Initiative** | Unidad de trabajo | base + `horizon: bounded\|ongoing`, `avanza` (Intent), fechas | Objetivo · Estado · Decisiones clave · Outputs |
| 4 | **Event/Decision** | Hecho temporal / decisión (un solo template, Decision = Event rico) | base + `precede`/`causa`, y para Decision: `decide_sobre`, alternativas, consecuencias | Qué ocurrió · (Decision: contexto, alternativas consideradas, decisión, consecuencias) |
| 5 | **Source** | Fuente externa | base + `medium`, `atribuido_a` (Actor), `created` | Resumen · Excerpts clave (bloques con ancla) · Qué `deriva_de` esto |
| 6 | **Artifact** | Output expresado | base + `expresa` (Concepts), `produjo`-por, `publication_status` | Borrador/contenido · A qué Concepts expresa · Dónde se publicó |
| 7 | **Prompt** | Procedimiento de IA | base + `opera_con`, versión, métricas de efectividad (derivadas) | El prompt · Cuándo usarlo · Tasks donde funcionó |
| 8 | **Policy** | Regla del sistema | subject, condition, effect | Justificación legible de la regla |

---

## 11. Git Strategy

### 11.1 Estructura de ramas

- **`main`** — el conocimiento canónico, protegido. Cambios humanos directos; cambios de agente solo vía merge revisado.
- **Rama por agente** (`agent/<nombre>`) — los agentes commitean sus propuestas aquí. El humano revisa vía merge a `main`. Esto materializa el propose→validate→commit de RFC-001.1: la propuesta es el commit en la rama del agente; la validación es la revisión; el commit es el merge. Las Tasks de bajo riesgo con autoridad de creación (RFC-001.1 §8.2) pueden auto-mergear bajo Policy; las de alto riesgo esperan revisión humana.

### 11.2 Convención de commits (parseable)

Formato estructurado para que el Context Engine y la auditoría puedan parsearlo:
```
<tipo>(<entidad>): <descripción>   [task:<id>] [agent:<nombre>]
```
Ej: `create(concept): backpressure [task:2026-06-29-001] [agent:distiller]`. El `task:` y `agent:` conectan el commit con la auditoría del log de Tasks.

### 11.3 Qué NO versionar

`.gitignore`:
- `.atlas/index/` — el índice de grafo (regenerable desde los archivos).
- `.atlas/cache/` embeddings y vectores — regenerables, grandes, binarios (matan los diffs de Git).
- Adjuntos grandes — a un almacenamiento aparte o Git LFS, no inline.

Lo que SÍ se versiona: todos los `.md` (conocimiento, fuente de verdad), las Policies, el log de Tasks (append-only, diffs limpios). El caché de propiedades derivadas en YAML es un caso de borde: versionarlo ensucia el historial con cambios de agente; la recomendación es escribirlo en commits marcados `[derived]` que se pueden filtrar, o mantenerlo fuera de `main` en la rama del agente y regenerarlo. (Open question §15.)

### 11.4 Backups y conflictos

Remoto privado (GitHub) + un segundo backup independiente (la lección de fase 1: "catástrofes pasan, estate listo"). Conflictos: la granularidad atómica (un KO = un archivo) minimiza colisiones; los conflictos reales (dos agentes, mismo archivo) se resuelven por el árbitro de Policy de RFC-001.1 §8.4 y, si persisten, escalan al humano como conflicto de merge — nunca se pierden silenciosamente.

---

## 12. Obsidian Strategy

### 12.1 Principio anti-dependencia

Regla dura: **si una capacidad es core, o se logra con convención de frontmatter, NO se instala un plugin.** Cada plugin de comunidad es una dependencia de un mantenedor individual y un riesgo a 10 años (lección de fase 1: Dataview depende de un mantenedor que se distanció). Atlas minimiza la superficie de dependencia.

### 12.2 Core features a usar

- **Properties** — la base de todo (las relaciones tipadas y el frontmatter viven aquí).
- **Bases** — vistas tipo base de datos nativas sobre las properties. Reemplaza la mayoría de los casos de Dataview sin plugin. Filtrar Concepts por `lifecycle`/`activation_score`, listar Tasks, dashboards de Initiatives.
- **Backlinks, búsqueda, graph local** — navegación humana.

### 12.3 Plugins indispensables al inicio (mínimo absoluto)

Solo dos, y ambos justificados por ausencia de equivalente core:
1. **Git** — versionado y sensor de cambios. No hay equivalente core. Indispensable.
2. **Un capturador rápido de Signals** (QuickAdd o similar) — para que la fricción de captura a `flow/inbox.md` sea casi cero. La fricción de captura mata sistemas (fase 1).

### 12.4 Plugins diferidos (instalar solo cuando la práctica lo pida)

- **Templater** — útil para automatizar templates, pero los 8 templates manuales sirven para empezar. Diferir hasta que la repetición duela.
- **Dataview** — diferir indefinidamente; Bases cubre el caso. Solo si aparece una consulta que Bases no puede (DataviewJS), y aun así evaluar si va al Context Engine en vez de a un plugin.
- **Smart Connections** — diferir; el RAG/embeddings es responsabilidad del Context Engine externo (§13), no de un plugin de Obsidian. Evita acoplar el grafo débil a un plugin.
- Excalidraw, Kanban, Calendar, etc. — diferir todos. Conveniencias, no fundamentos.

### 12.5 Qué NO instalar todavía

Nada que: (a) duplique una core feature, (b) escriba metadata en un formato propietario no-Markdown (viola P8), o (c) sea responsabilidad del Context Engine externo (RAG, embeddings, índice de grafo). El grafo tipado, la activación y el RAG **no son plugins de Obsidian** — son el componente externo.

---

## 13. MCP / Future Context Engine Compatibility

### 13.1 La representación está diseñada para ser parseada por el componente externo

Toda decisión física anterior está tomada pensando en que el futuro MCP server / Context Engine (que vive *fuera* de Obsidian, RFC-001.1 §11) pueda leer, indexar y escribir. Qué necesita y qué lo facilita:

**Qué necesita LEER:**
- El frontmatter YAML de cada `.md` → entidades, lifecycle, relaciones tipadas, procedencia. Facilitado por: relaciones en YAML (§6), no en prosa, así el parseo es robusto y sin heurísticas.
- El cuerpo Markdown → para chunking semántico (grafo débil). Facilitado por: estructura de encabezados consistente de los templates (§10), que da chunking por sección de calidad (hallazgo de fase 1: chunking consciente de estructura > corte arbitrario de tokens).
- El log de Tasks → auditoría e historial de ejecución. Facilitado por: log estructurado append-only (§8).
- Las Policies → reglas a aplicar. Facilitado por: frontmatter declarativo de Policy (§9).
- El historial de Git → quién cambió qué cuándo. Facilitado por: convención de commits parseable (§11.2).

**Qué necesita ESCRIBIR:**
- Propiedades derivadas (activation_score, is_connected...) → al índice (`.atlas/index/`) como verdad, y opcionalmente al caché YAML. Facilitado por: separación dueño-de-campo (§5, §7).
- Propuestas de relación/nodo → como commits en la rama del agente. Facilitado por: estrategia de ramas (§11.1).
- Entradas de auditoría → al log de Tasks. Facilitado por: §8.

**Qué índices construiría (en `.atlas/index/`, regenerables):**
- **Índice de grafo tipado** — el grafo de aristas fuertes parseado del YAML (id → relaciones). Lo que Obsidian no tiene nativo.
- **Índice id↔path** — para resolver relaciones por `id` independiente del nombre de archivo (§4.1). Es lo que hace que renombrar no rompa nada.
- **Índice vectorial / embeddings** — el grafo débil, para la cascada de degradación del Context Engine (RFC-001.1 §9). Regenerable, no versionado.
- **Caché de activación** — los scores de RFC-001.2, componente estructural cacheado + volátil lazy.

### 13.2 Las tres decisiones físicas que más facilitan el futuro

1. **`id` inmutable como identidad, nombre como clave humana** (§4.1) — desacopla el grafo de los paths; el Context Engine indexa por `id` y el humano renombra libremente.
2. **Relaciones fuertes en YAML tipado** (§6) — el grafo de razonamiento es parseable sin NLP; el agente lo lee directo.
3. **Frontera física `.atlas/`** (§3.2) — lo derivado/generado vive separado de lo escrito; el Context Engine tiene su espacio sin contaminar el conocimiento ni el historial de edición humana.

---

## 14. Final Decisions

1. **KO = archivo** si tiene identidad estable + lifecycle propio + es referenciado; si no, vive embebido o en log. Signal→inbox, Excerpt→Source, Feedback→Event, Task→log.
2. **Carpetas por capa/tipo, nunca por tema.** Estructura plana de ~5 carpetas de primer nivel + `maps/` + `.atlas/`.
3. **`id` inmutable = identidad; nombre de archivo = clave humana renombrable.** Slugs ASCII kebab-case; fecha-prefijo para entidades temporales.
4. **Cuatro clases de campo con dueño explícito** (required / optional-humano / relations / derived-agente). Derivados con namespace `_`, nunca editados a mano.
5. **Relaciones fuertes en arrays YAML tipados con procedencia inline; relaciones débiles como wikilinks en prosa.**
6. **Propiedades derivadas: fuente de verdad en el índice externo, caché de solo-lectura en YAML.** El índice gana ante divergencia.
7. **Tasks: log append-only estructurado; archivo solo para outputs (Artifact/Decision).**
8. **Policies: archivo Markdown, frontmatter declarativo + prosa justificativa.**
9. **8 templates máximo.**
10. **Git: main protegida + rama por agente; commits parseables con task/agent; índice y embeddings no versionados.**
11. **Obsidian casi desnudo: core + Properties + Bases; solo Git y un capturador como plugins iniciales; RAG/grafo/activación viven FUERA, no como plugins.**

---

## 15. Open Questions

1. **Versionado del caché de propiedades derivadas en Git.** ¿Commits marcados `[derived]` filtrables en `main`, o caché solo en rama de agente / fuera de Git? Hay tensión entre que Bases lo vea (requiere estar en el archivo) y no ensuciar el historial. Necesita prototipo. (Relacionado §7.1, §11.3.)
2. **Partición temporal de `events/` y `tasks/` por año.** ¿A partir de qué volumen conviene? Es performance, no dominio; se decide con datos de crecimiento real.
3. **Sintaxis exacta de las relaciones YAML con procedencia inline.** §6.2 fija la forma conceptual; la sintaxis precisa (¿objetos anidados siempre, o forma corta para relaciones simples?) se cierra al construir el parser del Context Engine.
4. **Mecanismo de `id`.** ¿UUID, timestamp+slug, ULID? Debe ser estable, único y razonablemente legible. Decisión de implementación temprana.
5. **Cómo Obsidian muestra relaciones tipadas al humano sin plugin.** Las Bases pueden mostrar el frontmatter, pero la experiencia de "ver el grafo tipado" rica probablemente requiera una vista custom del Context Engine. ¿Aceptamos que la vista tipada rica es del componente externo y Obsidian solo muestra el YAML crudo al inicio?
6. **Migración del caché cuando cambian los pesos de activación (RFC-001.2).** Recalibrar pesos invalida todos los `activation_score` cacheados → regeneración masiva. ¿Costo aceptable? Probablemente sí (es regenerable), pero conviene confirmarlo.

---

*RFC-002 — Proyecto Atlas. Representación física mínima viable del dominio. Con esto, el dominio (RFC-001.x) tiene una materialización concreta en Markdown/YAML/Git/Obsidian compatible con el futuro Context Engine. Pendiente: prototipo que valide las Open Questions de implementación (#1, #3, #4 en particular) antes de construir el vault real.*
