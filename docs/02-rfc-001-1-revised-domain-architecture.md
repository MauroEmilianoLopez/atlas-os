# PROYECTO ATLAS — RFC-001.1
## Revised Domain Architecture — Knowledge Operating System AI-First

**Estado:** Revisión que supersede a RFC-001
**Fase:** 2.1 — Revisión de arquitectura de dominio
**Base:** RFC-001 + Architecture Review adversarial (veredicto: aprobado con cambios mayores)
**Alcance:** Dominio revisado. NO define carpetas, YAML, plantillas ni plugins.
**Cambio de tesis respecto a RFC-001:** Atlas pasa de ser un *almacén de conocimiento operado por agentes* a ser un *sistema de ejecución de trabajo de conocimiento*. La ejecución, antes ausente, es ahora el eje que convierte el KMS en un OS.

---

## 1. Executive Summary

1. **Atlas ahora es un Operating System, no un KMS.** El cambio que lo logra es una sola entidad: `Task/Execution`. Un OS gestiona procesos sobre un almacén; un filesystem solo gestiona el almacén. RFC-001 modelaba el almacén con rigor pero no tenía procesos. RFC-001.1 los tiene, y todo lo demás (permisos, contexto, feedback, auditoría) se reancla sobre ellos.

2. **El conocimiento se reduce a 3 estados reales** (FLEETING, LIVING, ARCHIVED). Todo lo demás que RFC-001 modelaba como estado (connected, canonical, deprecated, evergreen) pasa a ser **propiedad derivada o política**, no una decisión manual. Esto ataca directamente la fricción que habría matado al sistema.

3. **La autoría se separa del respaldo.** El ambiguo `afirmado_por` se descompone en cuatro relaciones de procedencia distintas (`escrito_por`, `respaldado_por`, `validado_por`, `deriva_de`), lo que hace el modelo de confianza implementable y auditable en vez de aspiracional.

4. **Las reglas del sistema son datos, no prosa.** `Policy` convierte "qué puede hacer un agente, qué caduca, qué requiere aprobación" en entidades legibles por humano y máquina, modificables sin reescribir el RFC. Es la pieza que hace al sistema verdaderamente observable y configurable por los propios agentes.

5. **El learning loop se cierra.** `Feedback` (modelado como Event tipado, no entidad nueva — se justifica abajo) registra correcciones, rechazos y errores, y es lo que actualiza la reputación de los agentes. Sin esto, la reputación de RFC-001 era un número que nadie tocaba.

6. **El modelo de entidades se rebalancea:** se elimina Capture Session (→ metadata), se fusiona Commitment en Endeavor (renombrado), se difiere Capability. Se añaden Task, Policy y Feedback. Saldo: entidades movidas de los extremos vacíos al centro que estaba hueco.

7. **El vocabulario de relaciones se estratifica en Core (8, uso diario) y Extendidas.** Nadie —humano ni agente— memoriza 30 verbos; usan 8 y consultan el resto. Esto salva la disciplina de tipado de ser ignorada en la práctica.

8. **El Context Engine ahora es invocado por Tasks, mide presupuesto en tokens, y tiene una cascada de degradación explícita** (grafo fuerte → memoria activada → semántica → textual → pedir aclaración). Ya no asume que el grafo fuerte siempre responde.

9. **Los agentes ganan autoridad de creación acotada.** Pueden crear aristas fuertes de bajo riesgo (con evidencia obligatoria y trazabilidad), no solo proponer. Esto resuelve el riesgo de que el grafo fuerte quedara subpoblado y el sistema degradara a embeddings.

10. **La frontera de implementación es explícita.** Obsidian/Markdown/Git/MCP son la primera realización física, no el dominio. Una sección dedicada declara qué vive dentro de Obsidian (edición humana, sustrato de archivos) y qué vive fuera (grafo, Context Engine, ejecución, auditoría, activación, compresión, métricas).

---

## 2. Updated Domain Model

### 2.1 Las cuatro capas se conservan, pero ahora hay un plano de ejecución sobre ellas

RFC-001 tenía cuatro capas de conocimiento más Agent como transversal. RFC-001.1 conserva las capas pero reconoce que faltaba un **plano de ejecución** que cruza todo: donde viven Task, Agent, Policy y Feedback. El conocimiento es el sustrato; la ejecución es lo que opera sobre él.

```
┌─────────────────────────────────────────────────────────────┐
│  PLANO DE EJECUCIÓN   [Agent] [Task] [Policy] [Feedback]      │
│  (opera sobre el conocimiento, gobernado por reglas)         │
└─────────────────────────────────────────────────────────────┘
                              ▼ opera sobre ▼
   CAPA 4  DESTILADO     [Concept] [Insight] [Intent] [Prompt]
   CAPA 3  MUNDO         [Actor] [Technology]   (Capability: diferida)
   CAPA 2  TRABAJO       [Endeavor] [Event] [Decision Record]
                         [Source] [Excerpt] [Artifact]
   CAPA 1  FLUJO         [Signal]   (Capture Session: → metadata)
```

### 2.2 Cambios de entidades respecto a RFC-001

**Eliminada — Capture Session.** El contexto de captura (cuándo, durante qué) pasa a ser metadata de Signal (`capturado_en`, `capturado_durante`). No era un agregado, era ceremonia.

**Fusionada y renombrada — Commitment → dentro de `Endeavor`, renombrado a `Initiative`.** Una sola entidad con atributo `horizon: bounded | ongoing`. Un proyecto de software es `bounded`; tu rol de Tech Lead es `ongoing`. Misma expresividad, una entidad menos, y "Initiative/Iniciativa" se dice en voz alta sin fricción (a diferencia de "Empeño").

**Diferida — Capability.** No entra al núcleo. Concept + las relaciones de agrupación cubren el caso de "aptitud" por ahora. Se reintroduce solo si la práctica demuestra que se necesita un nodo distinto.

**Excerpt — granularidad definida.** Excerpt NO es una entidad por cada highlight. Un Excerpt es un fragmento atribuido **que vas a referenciar o construir conocimiento encima**. Los highlights crudos sin uso viven como contenido dentro de la Source con anclas; solo se promueven a Excerpt-entidad cuando entran en una relación (`deriva_de`, `respaldado_por`). Esto evita la explosión de 200 entidades por libro.

**Insight — regla anti-duplicación dura.** Insight y Concept se mantienen separados (la distinción situado/personal vs general/transferible es real y valiosa). Pero: un Insight que se generaliza **se convierte** en Concept (transición de tipo vía `destila_a`), no se copia. Un mismo conocimiento nunca existe como ambos simultáneamente. Esto protege la atomicidad.

**Añadidas:** `Task/Execution`, `Policy`, `Feedback` (detalladas en sus secciones).

### 2.3 Catálogo de entidades RFC-001.1 (definitivo de esta revisión)

| Capa / Plano | Entidad | Responsabilidad de dominio en una línea |
|---|---|---|
| Flujo | `Signal` | Captura cruda sin compromiso de procesamiento; caduca por defecto. |
| Trabajo | `Initiative` | Unidad de trabajo dirigida a resultado; `horizon` bounded/ongoing. |
| Trabajo | `Event` | Algo que ocurrió en el tiempo; inmutable una vez cerrado. |
| Trabajo | `Decision Record` | Decisión con contexto, alternativas, consecuencias; nodo de razonamiento. |
| Trabajo | `Source` | Origen externo de conocimiento; `medium` es atributo. |
| Trabajo | `Excerpt` | Fragmento atribuido de Source que entra en una relación. |
| Trabajo | `Artifact` | Salida expresada al mundo (post, artículo, charla); cierra el lifecycle. |
| Mundo | `Actor` | Persona u organización; referente estable de alta conectividad. |
| Mundo | `Technology` | Herramienta/lenguaje/sistema concreto; cruza capas. |
| Destilado | `Concept` | Idea atómica, atemporal, transferible; unidad fundamental. |
| Destilado | `Insight` | Conclusión propia, situada; puede destilar a Concept. |
| Destilado | `Intent` | Objetivo/dirección; da propósito y prioridad al sistema. |
| Destilado | `Prompt` | Procedimiento de IA reutilizable y versionado; conocimiento operativo. |
| Ejecución | `Agent` | Operador de IA con identidad, permisos vía Task, reputación. |
| Ejecución | `Task/Execution` | Unidad de trabajo en ejecución; ancla permisos, contexto, auditoría. |
| Ejecución | `Policy` | Regla del sistema como dato legible por humano y máquina. |
| Ejecución | `Feedback` | Event tipado que cierra el learning loop y ajusta reputación. |

---

## 3. Updated Ontology — Core vs Extendidas

### 3.1 Principio conservado

Se mantiene intacto lo que la review marcó como joya: relaciones tipadas, direccionales, con fuerza (fuerte/débil) y con procedencia. La distinción **aristas fuertes (razonamiento, escasas) vs débiles (descubrimiento, densas)** sigue siendo el mecanismo central anti-caos y no se toca.

Lo que cambia: se estratifica el vocabulario por frecuencia de uso para que sea memorizable, y se descompone `afirmado_por`.

### 3.2 Relaciones Core (8 — uso diario, las que todos memorizan)

Estas ocho cubren el ~90% de los casos. Un humano o agente puede operar Atlas conociendo solo estas.

| # | Relación | Inversa | Qué expresa |
|---|---|---|---|
| 1 | `deriva_de` | origina | Procedencia: este conocimiento nació de aquella Source/Event/Signal. La cadena de trazabilidad. |
| 2 | `se_apoya_en` | fundamenta | Epistémica: A usa a B como base lógica. |
| 3 | `contradice` | (simétrica) | Epistémica: A y B son incompatibles. Permite sostener tensión. |
| 4 | `trata_sobre` | es_tratado_por | Conexión genérica fuerte tema↔entidad (un Artifact trata_sobre un Concept; un Event trata_sobre una Technology). Sustituye al difuso "está enlazado a" pero exige un sustantivo. |
| 5 | `decide_sobre` | decidido_en | Operativa: un Decision Record decide sobre una Technology/Initiative. |
| 6 | `avanza` | avanzado_por | Operativa: una Initiative avanza un Intent. Conecta trabajo con propósito. |
| 7 | `escrito_por` | escribió | Procedencia/autoría: quién (humano o Agent) creó/modificó esto. |
| 8 | `respaldado_por` | respalda | Confianza: quién garantiza la veracidad de esto (≠ quién lo escribió). |

### 3.3 Relaciones Extendidas (casos específicos, se consultan)

Agrupadas por familia. No es necesario memorizarlas; existen para precisión cuando importa.

- **Estructurales:** `generaliza`/`es_caso_de`, `compone`/`es_parte_de`, `agrupa`/`pertenece_a`.
- **Epistémicas finas:** `refina`/`refinado_por`, `ejemplifica`/`ejemplificado_por`, `superado_por` (reemplaza el estado DEPRECATED).
- **Procedencia fina:** `atribuido_a` (Excerpt→Actor), `validado_por` (quién aprobó formalmente, distinto de respaldar), `destila_a` (Insight→Concept, la regla anti-duplicación).
- **Operativas finas:** `usa` (Initiative→Technology), `aplica` (Initiative/Artifact→Concept), `produce`/`producido_por` (Initiative/Task→Artifact), `expresa` (Artifact→Concept).
- **Causales/temporales:** `precede`/`sigue_a`, `causa`/`causado_por` (añadidas por recomendación de la review: el RFC-001 no modelaba causalidad entre eventos).
- **De ejecución:** `ejecutado_por` (Task→Agent), `requiere_contexto` (Task→entidades), `produjo` (Task→cualquier resultado), `corrige` (Feedback→Task/relación), `gobierna` (Policy→Agent/Task/tipo).

### 3.4 La descomposición de `afirmado_por` (cambio crítico 3)

RFC-001 mezclaba autoría y respaldo en un solo verbo. Ahora son cuatro relaciones distintas, y la distinción es lo que hace seguro el modelo:

- **`escrito_por`** — *quién lo creó*. Pura autoría. Un agente puede escribir algo sin garantizar su verdad.
- **`respaldado_por`** — *quién garantiza que es verdad*, con un nivel de confianza. Aquí entra la reputación: una pieza respaldada por dos agentes independientes + el humano tiene confianza máxima; una respaldada por un solo agente de baja reputación, mínima.
- **`validado_por`** — *quién aprobó formalmente* una transición de alto riesgo (promoción a canónico, una decisión). Es el sello human-in-the-loop, auditable.
- **`deriva_de`** — *de qué evidencia se desprende*. Es la falsabilidad: toda arista fuerte afirmada por un agente DEBE poder citar de qué deriva, o se rechaza.

Por qué mejora trazabilidad/confianza/seguridad: ahora podés preguntar "¿quién escribió esto?" (autoría/responsabilidad), "¿en qué confío esto?" (respaldo + reputación), "¿esto fue aprobado por un humano?" (validación), y "¿en qué se basa?" (evidencia) como cuatro preguntas separadas. En RFC-001 las cuatro estaban colapsadas y ninguna era respondible con precisión.

---

## 4. Task / Execution Model (cambio crítico 1 — el corazón de RFC-001.1)

### 4.1 Por qué Task convierte a Atlas en un OS

Un Operating System se define por gestionar **ejecución sobre un almacén compartido bajo reglas**. RFC-001 tenía almacén (conocimiento) y operadores (agentes) pero le faltaba el proceso. `Task/Execution` es ese proceso: la unidad de trabajo que un agente (o el humano) ejecuta, con un contexto acotado, permisos temporales, y un rastro auditable de lo que hizo.

La distinción conceptual importante: **`Task` es la intención de trabajo; `Execution` es el intento concreto de realizarla.** Una Task puede tener múltiples Executions (un reintento tras un fallo, una re-ejecución con más contexto). En la mayoría de los casos hay una sola Execution por Task, pero modelarlos como un agregado con uno-a-muchos permite reintentos y comparación. Para el resto del documento los trato como un agregado único `Task/Execution`.

### 4.2 Anatomía conceptual de Task/Execution

No defino campos YAML (eso es fase 3). Defino las partes que el dominio exige que existan:

- **Identidad** — identificador estable y único; una Task es citable desde el grafo y la auditoría.
- **Intención** — qué se busca lograr, en lenguaje declarativo ("destilar las Signals de ayer", "redactar un Artifact a partir del Concept X"). Es lo que el Context Engine usa como semilla.
- **Agente ejecutor** — quién la ejecuta (`ejecutado_por`). Puede ser un Agent o el humano.
- **Contexto requerido** — qué declara la Task que necesita (`requiere_contexto`). Es la *petición* al Context Engine.
- **Contexto entregado** — qué le dio efectivamente el Context Engine. Se registra porque es esencial para auditar: para depurar por qué un agente alucinó, necesitás saber qué vio, no solo qué hizo.
- **Permisos temporales** — el scope acotado *de esta ejecución*: qué puede leer, qué puede escribir, qué transiciones puede ejecutar. Otorgados por Policy, expiran al terminar la Task. Esto es el mínimo privilegio hecho implementable: no se otorga a un agente en abstracto, sino a una ejecución concreta.
- **Estado de ejecución** — `pending → contextualizing → executing → proposing → committed | rejected | failed`. Es la máquina de estados de la *ejecución*, distinta de la del *conocimiento* (sección 5).
- **Outputs producidos** — qué generó (`produjo`): Artifacts, nuevos Concepts, propuestas de relación.
- **Decisiones tomadas** — si la ejecución implicó decisiones, quedan como Decision Records enlazados.
- **Cambios propuestos vs cambios aplicados** — separados explícitamente. Lo propuesto es lo que el agente quiso hacer; lo aplicado es lo que pasó validación y se comiteó. La diferencia es auditable y alimenta el feedback.
- **Feedback recibido** — correcciones o rechazos sobre esta ejecución (`corregido_por`).
- **Costo aproximado** — tokens consumidos, llamadas, tiempo. Necesario para observabilidad y para el presupuesto de contexto.
- **Trazabilidad y auditoría** — la Task ES el registro de auditoría. Contexto entregado + razonamiento + propuestas + resultado + feedback constituyen el log completo de qué hizo un agente y por qué.

### 4.3 Cómo Task conecta con todo lo demás

`Task/Execution` es el hub que reancla las piezas que en RFC-001 flotaban:

```
        [Policy] ──gobierna──> [Task] <──ejecutado_por── [Agent]
                                 │  │
              requiere_contexto  │  │  produjo
                                 ▼  ▼
                   [Context Engine]  [Artifact / Concept / relación]
                                 │
                          corregido_por
                                 ▼
                            [Feedback] ──ajusta──> reputación del Agent
                                 │
                          deriva_de / respaldado_por
                                 ▼
                         [Knowledge Graph]
```

- **↔ Agent:** la Task es ejecutada por un Agent; los permisos del Agent se concretan *en* la Task.
- **↔ Context Engine:** la Task declara `requiere_contexto`; el motor responde; la Task registra qué recibió.
- **↔ Policy:** una Policy `gobierna` qué puede hacer la Task (permisos, qué requiere aprobación). La Task lee sus límites de las Policies aplicables.
- **↔ Feedback:** el resultado de la Task puede recibir Feedback, que ajusta la reputación del Agent ejecutor.
- **↔ Knowledge Graph:** las aristas y nodos que la Task crea llevan `escrito_por` = Agent y `deriva_de` = evidencia, ambos trazables a la Task.
- **↔ Artifacts:** los outputs publicables de una Task son Artifacts (`produjo`/`produce`).
- **↔ Prompts:** una Task puede ejecutarse *usando* un Prompt (`opera_con`). Los Prompts son procedimientos reutilizables que las Tasks instancian; medir qué Prompts producen Tasks exitosas es cómo se evalúa un Prompt.

---

## 5. Updated Lifecycle (cambio crítico 2)

### 5.1 Tres estados reales, lo demás derivado

RFC-001 tenía 8 estados, la mayoría requiriendo decisión humana. La review predijo abandono por fricción. RFC-001.1 reduce a tres estados que el operador realmente transiciona, y mueve el resto a propiedades calculadas o políticas.

```
   FLEETING ──promoción (humano o agente)──> LIVING ──compresión──> ARCHIVED
      │                                         ▲                      │
      └── caducidad por defecto ────> (purga si huérfana)              │
                                                └── reactivación ──────┘
```

- **FLEETING** — conocimiento crudo, no integrado, no confiable. Signals, capturas, borradores. Caduca por defecto. Es la zona de alta rotación.
- **LIVING** — conocimiento activo, integrado al grafo, en uso. Concepts, Insights, Decisions, Initiatives activas. Es donde vive el razonamiento.
- **ARCHIVED** — conocimiento histórico, comprimido a gist, recuperable bajo demanda. No es muerte: es memoria de baja activación. Lo que fue LIVING y dejó de ser relevante, sin perder el "qué pensábamos antes y por qué".

### 5.2 Lo que antes era estado, ahora es propiedad derivada o política

Ninguno de estos requiere una decisión manual de transición. Se calculan del grafo o se aplican por Policy:

| Antes (estado RFC-001) | Ahora (RFC-001.1) | Cómo se obtiene |
|---|---|---|
| CONNECTED | `is_connected` (propiedad derivada) | ¿Tiene ≥1 arista fuerte? Lo calcula el grafo. |
| CANONICAL | `is_canonical` (propiedad derivada) | ¿Es el único nodo de su concepto? Lo detecta el grafo (deduplicación). |
| DEPRECATED | `is_deprecated` (derivada de relación) | ¿Tiene una arista `superado_por` entrante, o su fundamento está obsoleto? |
| EVERGREEN | `is_evergreen` (política/flag) | Política: "revísame periódicamente". No es un estado del conocimiento, es una instrucción de mantenimiento. |
| (nuevo) | `review_required` (política derivada) | Calculado: LIVING sin tocar en N meses, o cuyo fundamento cambió. Dispara una Task de revisión. |
| (nuevo) | `confidence_level` (derivada de respaldo) | Calculado de `respaldado_por` + reputación de quien respalda + `validado_por`. |

### 5.3 Por qué esto reduce fricción operativa

La fricción venía de que cada estado de RFC-001 exigía una decisión consciente del operador. En la práctica, eso significa que el operador deja de transicionar y todo se atasca en un estado intermedio (el nuevo cementerio). RFC-001.1 le pide al humano **una sola decisión de juicio**: promover de FLEETING a LIVING (¿esto vale la pena?). Todo lo demás —si está conectado, si es canónico, si necesita revisión, cuánta confianza merece— lo calcula el sistema del grafo y las políticas. La compresión a ARCHIVED la ejecutan agentes. El humano decide qué vale; el sistema mantiene la contabilidad. Esa es la división de trabajo que sobrevive al uso diario.

---

## 6. Policy Model (cambio crítico 4)

### 6.1 Reglas como datos, no como prosa

El gran problema de RFC-001 era que sus reglas (qué puede hacer un agente, qué caduca, qué requiere aprobación) vivían como prosa en el documento. Eso las hace inmodificables sin reescribir el RFC y opacas para los agentes. `Policy` las convierte en **entidades-dato legibles por humano y máquina**: un agente puede *leer* las políticas que lo gobiernan antes de actuar, y vos podés cambiar una regla sin tocar la arquitectura.

### 6.2 Qué es una Policy (ligera, no burocracia)

Una Policy es una regla declarativa con: un **sujeto** (a qué/quién aplica: un Agent, un tipo de Task, un tipo de conocimiento), una **condición** (cuándo aplica), y un **efecto** (qué permite, prohíbe o exige). Conceptualmente, una regla legible del tipo "SI [condición] ENTONCES [efecto] PARA [sujeto]".

### 6.3 Tipos de Policy que el dominio necesita

- **Permission policies** — qué puede leer/escribir un Agent o Task. Ej: "el agente de captura puede crear Signals y proponer Concepts, no puede promover a LIVING".
- **Approval policies** — qué requiere human-in-the-loop. Ej: "toda promoción a is_canonical requiere `validado_por` humano".
- **Expiry policies** — qué caduca y cuándo. Ej: "Signals FLEETING sin triagear caducan a los 30 días; si están huérfanas, se purgan".
- **Auto-promotion policies** — qué conocimiento puede promoverse sin aprobación. Ej: "un Insight respaldado por el humano puede auto-promoverse a LIVING".
- **Relation-creation policies** — qué aristas puede crear un agente sin aprobación. Ej: "un agente puede crear `deriva_de` y `trata_sobre` con evidencia; `contradice` y `decide_sobre` requieren validación humana".
- **Visibility/isolation policies** — qué no puede leer cierto agente. Ej: "el agente que procesa contenido web externo no puede leer conocimiento marcado privado ni escribir sobre conocimiento canónico" (la defensa contra la trifecta letal, ahora como dato).

### 6.4 Por qué Policy es muy AI-first

Porque los agentes pueden razonar sobre sus propias reglas. Antes de ejecutar, un agente consulta las Policies que lo gobiernan (`gobierna`) y ajusta su comportamiento. Las reglas dejan de ser un guardarraíl externo opaco y pasan a ser contexto que el agente entiende. Y como son datos, son observables (podés auditar qué reglas existen y cuáles se aplicaron a una Task) y evolutivas (cambiás una política, no el código ni el RFC).

---

## 7. Feedback / Learning Loop (cambio crítico 5)

### 7.1 Decisión de modelado: Event tipado, no entidad nueva

`Feedback` se modela como un **Event tipado** (`kind: correction | rejection | error | acceptance | improvement`), no como una entidad de pleno derecho. Justificación: un Feedback es, por naturaleza, *algo que ocurrió en un punto del tiempo y es inmutable* — que es exactamente la definición de Event. Crear una entidad separada duplicaría la maquinaria de Event (identidad, inmutabilidad, ancla temporal) sin ganar nada. Reutilizar Event mantiene el modelo pequeño (principio de la review: no agregar por agregar) y le da a Feedback gratis la trazabilidad temporal que necesita.

### 7.2 Qué registra el Feedback

- **Correcciones humanas** — el humano arregló algo que un agente hizo mal.
- **Rechazos de propuestas** — una propuesta de Task no pasó validación.
- **Errores de agentes** — la ejecución falló o produjo algo inválido.
- **Relaciones falsas** — una arista fuerte resultó incorrecta (`corrige` esa arista, que se marca o elimina).
- **Outputs malos** — un Artifact producido no sirvió.
- **Mejoras aceptadas** — una propuesta de agente fue aceptada (feedback positivo, sube reputación).

### 7.3 El loop

```
  [Task ejecutada por Agent] ──produjo──> [cambio/Artifact/relación]
            │                                      │
            │                              evaluado por humano/otro agente
            │                                      ▼
            │                              [Feedback (Event tipado)]
            │                                      │
            │                          ┌───────────┼───────────┐
            ▼                          ▼           ▼           ▼
   reputación del Agent <──ajusta── corrige    informa     alimenta
                                   la arista   Policy     futuras Tasks
                                    falsa      (ajuste)   (vía contexto)
```

El feedback hace tres cosas que en RFC-001 no pasaban: **(1)** ajusta la reputación del Agent (la convierte de número muerto en señal viva), **(2)** corrige el grafo (una relación falsa se marca/elimina y queda registro de que fue falsa, conocimiento histórico valioso), y **(3)** puede alimentar ajustes de Policy o de Prompts (si un agente falla repetido en cierto tipo de Task, una Policy puede endurecerse o un Prompt revisarse). Este es el learning loop que faltaba.

---

## 8. Updated Agent Model (cambio crítico 9)

### 8.1 Permisos por Task, no por Agent

El cambio estructural: un Agent ya no tiene permisos fijos en abstracto. Tiene una **identidad** y una **reputación**, pero sus permisos se concretan *por Task*, otorgados por las Policies aplicables y expirando al terminar la ejecución. "El agente de captura puede X" es demasiado grueso; lo correcto es "esta Task de captura, ejecutada por este agente bajo estas Policies, puede X y expira al terminar". Esto es lo que hace el mínimo privilegio implementable.

### 8.2 Autoridad de creación acotada (resuelve el grafo subpoblado)

RFC-001 dejaba a los agentes solo *proponer*, lo que habría dejado el grafo fuerte crónicamente vacío. RFC-001.1 les da **autoridad de creación de aristas fuertes de bajo riesgo**, gobernada por Policy:

- Aristas de bajo riesgo (`deriva_de`, `trata_sobre`) con evidencia obligatoria: el agente las crea, el humano audita por muestreo.
- Aristas de alto riesgo (`contradice`, `decide_sobre`, `se_apoya_en`): requieren `validado_por` humano.
- **Falsabilidad obligatoria:** toda arista fuerte afirmada por un agente DEBE citar `deriva_de` (qué evidencia la justifica). Una afirmación sin evidencia citable se rechaza automáticamente. Esto es más robusto que confiar en reputación: previene la invención de conexiones falsas en el origen.

### 8.3 Trazabilidad, auditoría y reputación

- **Toda relación creada por un agente** lleva `escrito_por` = Agent y `deriva_de` = evidencia, trazable a la Task que la creó.
- **Cada ejecución deja auditoría completa:** la Task registra contexto entregado + propuestas + resultado + feedback (sección 4.2). Para depurar una alucinación, sabés qué vio el agente, no solo qué hizo.
- **La reputación se actualiza con feedback real** (sección 7): cada corrección/rechazo baja reputación, cada aceptación la sube. La reputación pondera `confidence_level` del conocimiento que el agente respalda.

### 8.4 Concurrencia con árbitro determinista

RFC-001 dejaba los "locks suaves" sin árbitro. RFC-001.1: la granularidad atómica (un Concept = un agregado) elimina la mayoría de colisiones; para el caso real de dos Tasks sobre la misma entidad, el árbitro es determinista por **prioridad de Policy** (ej. Tasks de validación humana ganan a Tasks de agente; entre agentes, mayor reputación o quien declaró intención primero). Conflictos genuinos se materializan como conflictos de versión (Git-like) que escalan al humano, nunca se pierden silenciosamente.

### 8.5 El invariante de seguridad, ahora como Policy

La trifecta letal (datos privados + contenido no confiable + exfiltración) se codifica como visibility/isolation policies (sección 6.3): ningún Agent tiene los tres simultáneamente. Un agente expuesto a contenido externo no confiable opera bajo una Policy que le niega acceso a conocimiento privado y escritura sobre lo canónico. El invariante deja de ser prosa del RFC y pasa a ser un dato auditable.

---

## 9. Updated Context Engine (cambio crítico 8)

### 9.1 Ahora invocado por Tasks, con presupuesto en tokens

El Context Engine ya no es un servicio abstracto: es invocado por una `Task` que declara `requiere_contexto`, y devuelve el contexto mínimo que la Task registra como "contexto entregado" (para auditoría). El **presupuesto se mide en tokens**, no en nodos (un nodo puede ser enorme); la compresión es token-aware.

### 9.2 La cascada de degradación explícita

El cambio más importante: RFC-001 asumía que el grafo fuerte siempre respondía. RFC-001.1 define una **cascada de degradación** explícita, de mayor a menor precisión, que se recorre hasta llenar el presupuesto o satisfacer la Task:

```
  1. GRAFO FUERTE      Traversal de aristas fuertes desde las semillas.
        │              Máxima precisión. Primera opción siempre.
        ▼ (insuficiente)
  2. MEMORIA ACTIVADA  Piezas "calientes" (alta activación) ligadas a
        │              Intents/Initiatives activas. Contexto situacional.
        ▼ (insuficiente)
  3. BÚSQUEDA SEMÁNTICA Grafo débil / embeddings. Descubrimiento por
        │              similitud. Marca resultados como tentativos.
        ▼ (insuficiente)
  4. BÚSQUEDA TEXTUAL   Léxica/keyword. Último recurso automático.
        │
        ▼ (sigue insuficiente o ambiguo)
  5. PEDIR ACLARACIÓN   La Task no puede construir contexto suficiente;
                        devuelve la pregunta al humano/agente invocante.
```

Esto reconoce lo que RFC-001 negaba: el grafo débil (embeddings) es un **ciudadano necesario**, no un mal — es el fallback cuando el grafo fuerte no tiene respuesta (típicamente conocimiento nuevo, aún sin aristas). Lo que el RFC sostiene es que el grafo fuerte va *primero*, no que el débil no exista.

### 9.3 Las fases de construcción (conservadas, reancladas)

El traversal local de RFC-001 se conserva (anclar semillas → expandir relaciones fuertes 1 hop → inyectar memoria activada → filtrar por confianza → expansión lazy bajo demanda), pero ahora: las semillas vienen de la *intención de la Task*; el filtro de confianza usa `confidence_level` (derivado de respaldo + reputación, sección 5.2); y si el presupuesto de tokens se excede, se comprime a gist (memoria de baja persistencia) antes de truncar.

### 9.4 Por qué sigue escalando a 100k notas

Sin cambios respecto a la propiedad clave de RFC-001: el costo depende del subgrafo relevante, no del vault total. El motor nunca toca el grafo global. La cascada de degradación no rompe esto: cada nivel opera local o sobre índices acotados.

---

## 10. Updated Knowledge Graph Governance

Se conserva el núcleo de RFC-001 (fuertes vs débiles, vocabulario cerrado, procedencia obligatoria, nodos atómicos canónicos, MOCs como nodos de gobernanza) con tres refuerzos derivados de los cambios:

1. **Poblamiento activo del grafo fuerte como responsabilidad de agente.** Los agentes ahora crean aristas fuertes de bajo riesgo (8.2), así que el grafo fuerte se puebla a ritmo sano. Una Policy define la "tasa objetivo de densidad de razonamiento" y un agente de mantenimiento ejecuta Tasks recurrentes para sostenerla.
2. **Evidencia obligatoria en aristas de agente** (falsabilidad, 8.2) — previene contaminación en el origen.
3. **Las métricas de salud son Tasks recurrentes.** Tasa de orfandad, densidad de razonamiento, deuda de procedencia, ratio de tensión (`contradice`), edad de activación — todas se calculan como Tasks de un agente de mantenimiento bajo Policy, no como inspección manual. La observabilidad se vuelve operativa, no aspiracional.

---

## 11. Implementation Boundary (cambio crítico 10)

### 11.1 El dominio no es la herramienta

Atlas, tal como lo define este RFC, es un **dominio**. Su realización física es intercambiable (Principio P8). La primera realización física probable usará un conjunto concreto de herramientas, pero **ninguna decisión de dominio de este documento depende de ellas**:

| Rol | Primera realización probable | El dominio depende de esto? |
|---|---|---|
| Interfaz humana de edición | Obsidian | No. Cualquier editor de Markdown sirve. |
| Representación física | Markdown + YAML frontmatter | No conceptualmente; sí se exige texto plano legible (P5, P8). |
| Versionado | Git | No. Cualquier sistema con historial auditable sirve. |
| Interfaz de agentes | MCP (servidor propio o de comunidad) | No. Cualquier protocolo de tool-calling sirve. |
| Vistas tipo base de datos | Obsidian Bases | No. Conveniencia, no requisito. |

### 11.2 Qué vive DENTRO de Obsidian

- La **edición human-readable** del conocimiento (vos escribiendo y leyendo notas).
- El **sustrato de archivos** de texto plano (el activo durable).
- Navegación humana básica (backlinks, búsqueda, vistas Bases simples).

### 11.3 Qué vive FUERA de Obsidian (componente custom, probablemente un MCP server)

Esto es lo que la review marcó como subestimado y aquí se reconoce explícitamente. Obsidian **no** provee nativamente nada de esto:

- **Índice de grafo tipado** — wikilinks de Obsidian son no tipados; el grafo fuerte/débil con fuerza de arista vive en un índice propio.
- **Context Engine** — traversal multi-hop con presupuesto y cascada de degradación está más allá de Bases.
- **Ejecución de Tasks** — el runtime que ejecuta agentes, otorga permisos temporales y registra auditoría.
- **Auditoría de agentes** — el log estructurado de contexto entregado + propuestas + resultado.
- **Cálculo de activación** — el proceso que recalcula el eje de activación de la memoria periódicamente.
- **Compresión / gist** — el proceso de agente que resume y archiva conocimiento de baja persistencia.
- **Métricas de salud del grafo** — las Tasks recurrentes que calculan orfandad, densidad, deuda de procedencia.
- **Motor de Policies** — el componente que lee las Policies-dato y las aplica a Tasks.

### 11.4 Consecuencia para la fase 3

La fase 3 (representación física) no es "configurar Obsidian". Es **construir el componente custom** (probablemente un MCP server con su propio índice de grafo y runtime de Tasks) que implementa el dominio, *usando* Obsidian como editor humano y Markdown/Git como sustrato. El grueso de la ingeniería de Atlas vive fuera de Obsidian. Esto es coherente con P8 y debe presupuestarse como tal.

---

## 12. Final Decisions

Decisiones cerradas en esta revisión (no reabrir sin nuevo RFC):

1. `Task/Execution` es entidad transversal de primera clase y el eje que hace de Atlas un OS.
2. El lifecycle del conocimiento tiene **tres estados** (FLEETING, LIVING, ARCHIVED); todo lo demás es propiedad derivada o Policy.
3. `afirmado_por` queda **eliminado**; se reemplaza por `escrito_por`, `respaldado_por`, `validado_por`, `deriva_de`.
4. `Policy` es entidad-dato ligera; las reglas del sistema viven como datos legibles, no como prosa.
5. `Feedback` se modela como **Event tipado**, no entidad nueva.
6. Capture Session **eliminada** (→ metadata de Signal). Commitment **fusionado** en `Initiative` (con `horizon`). Capability **diferida**.
7. Vocabulario de relaciones estratificado: **8 Core** + extendidas.
8. Permisos **por Task**, no por Agent. Agentes con **autoridad de creación acotada** y **evidencia obligatoria** (falsabilidad).
9. Context Engine invocado por Tasks, **presupuesto en tokens**, **cascada de degradación** de 5 niveles.
10. Frontera de implementación explícita: Obsidian es la primera interfaz, no el dominio.

---

## 13. Open Questions

Preguntas abiertas que la fase 3 (o un RFC-002) debe resolver, honestamente sin respuesta cerrada todavía:

1. **¿Cómo se recalcula la activación de la memoria, y con qué frecuencia?** El Memory Model de tres ejes sigue siendo conceptualmente correcto, pero "la activación decae con el tiempo" exige un proceso concreto (¿una Task recurrente? ¿cálculo perezoso al construir contexto?). Sin esto resuelto, la Fase 2 del Context Engine (inyección de memoria activada) opera sobre datos posiblemente obsoletos. Es la deuda conceptual más grande que queda.

2. **¿Cuál es exactamente el árbitro de concurrencia entre Tasks de agentes de igual reputación?** Se propuso "quien declaró intención primero", pero en un sistema sobre archivos + Git las condiciones de carrera reales necesitan una regla más precisa. Requiere prototipo.

3. **¿Dónde está el límite entre Insight y Concept en la práctica?** La regla anti-duplicación (`destila_a` + conversión de tipo) resuelve la duplicación, pero no elimina la ambigüedad de clasificación en el momento de crear. Puede necesitar un agente clasificador o quedar como juicio humano.

4. **¿El MCP server custom debe construirse desde cero o sobre uno de comunidad?** Decisión de fase 3 con trade-off de mantenimiento (P8 favorece control propio; pragmatismo favorece reusar). No se decide en el dominio.

5. **¿Cómo se versiona el vocabulario de relaciones cerrado y las Policies?** Ambos son "datos que evolucionan deliberadamente". Necesitan su propio mecanismo de cambio versionado para no convertirse en el caos que el vocabulario cerrado existe para prevenir.

6. **¿Capability vuelve?** Diferida en esta revisión. La práctica dirá si Concept+MOC realmente cubren el caso de "aptitud" o si hace falta el nodo distinto.

---

*RFC-001.1 — Proyecto Atlas. Revisión de arquitectura de dominio. Supersede RFC-001. Base para la fase 3 (representación física) una vez resueltas las Open Questions críticas (#1 en particular).*
