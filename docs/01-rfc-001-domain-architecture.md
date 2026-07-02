# PROYECTO ATLAS — RFC-001
## Arquitectura del Dominio de un Knowledge Operating System AI-First

**Estado:** Borrador para revisión
**Fase:** 2 — Diseño de Arquitectura (modelo conceptual del dominio)
**Alcance:** Define el dominio. NO define carpetas, nombres de archivo, plugins ni plantillas.
**Audiencia:** El humano operador, los agentes de IA que operarán el sistema, y cualquier sistema futuro que se conecte a él.

---

## 0. Posición arquitectónica y marco mental

Atlas no es una aplicación. Es un **dominio de conocimiento con una representación física en texto plano**. La distinción importa porque define qué es estable durante 10 años (el dominio) y qué es desechable (toda herramienta que lo lea o escriba, Obsidian incluido).

El error que mata a estos sistemas es invertir el orden: diseñar la app/carpetas/plugins primero y dejar que el dominio emerja como subproducto. Atlas invierte eso. El dominio es el contrato. Las herramientas son implementaciones intercambiables de ese contrato. Si dentro de 5 años Obsidian desaparece y lo reemplaza otra cosa, el dominio sobrevive sin migración conceptual porque nunca dependió de la herramienta.

Hay una analogía exacta con software enterprise que va a recorrer todo este documento: **estamos diseñando el modelo de dominio de un sistema, no su capa de persistencia ni su UI.** Las entidades son agregados (en el sentido de Domain-Driven Design). Las relaciones son el lenguaje ubicuo. El ciclo de vida es la máquina de estados del agregado. La memoria es la política de caché y archivado. El context engine es la capa de queries. Los agentes son los consumidores de la API. Y los principios de diseño del final son los invariantes que ningún componente puede violar.

Una decisión de marco que atraviesa todo: **toda pieza de conocimiento es a la vez human-readable y machine-readable en el mismo artefacto, sin duplicación.** No hay una "versión para humanos" y una "versión para máquinas". Hay un único artefacto de texto plano cuya estructura es legible por un humano leyéndolo y parseable por una máquina al mismo tiempo. La metadata estructurada y la prosa coexisten en el mismo objeto. Esto es lo que hace que el sistema sea simultáneamente un segundo cerebro para vos y un cerebro primario para los agentes, sin sincronización entre dos representaciones (la sincronización entre representaciones es exactamente donde estos sistemas acumulan deuda y se pudren).

---

## 1. DOMAIN MODEL — Las entidades del sistema

### 1.1 Principio rector del modelado de entidades

No modelo entidades por "tipos de cosas que guardo" (libro, video, reunión). Eso produce una taxonomía de formatos de input que envejece mal: dentro de 5 años habrá formatos de contenido que hoy no existen, y un modelo organizado por formato necesitaría una entidad nueva por cada uno.

Modelo entidades por **rol que la cosa juega en el sistema de conocimiento**. Un libro, un video, un paper y un hilo de Twitter son todos el mismo rol: *fuentes de las que extraés conocimiento*. La diferencia entre ellos es un atributo (`medium`), no una entidad distinta. Esto mantiene el modelo pequeño, estable y extensible: un formato nuevo es un valor nuevo de un campo, no un cambio de esquema.

El modelo se organiza en **cuatro capas semánticas**, de la más volátil a la más estable. Esta estratificación no es decorativa: gobierna el ciclo de vida (sección 3), la memoria (sección 4) y el motor de contexto (sección 6). Es el eje vertebral de Atlas.

```
   CAPA 4 — CONOCIMIENTO DESTILADO    (lo más estable, lo que sos vos)
   ───────────────────────────────────────────────────────────────
   CAPA 3 — ENTIDADES DEL MUNDO       (referentes estables externos)
   ───────────────────────────────────────────────────────────────
   CAPA 2 — ARTEFACTOS DE TRABAJO     (lo operativo, ciclo de vida medio)
   ───────────────────────────────────────────────────────────────
   CAPA 1 — FLUJO / CAPTURA           (lo más volátil, alta rotación)
```

### 1.2 Las entidades, por capa

Cada entidad se define como un agregado: tiene identidad propia, ciclo de vida propio, y un conjunto de invariantes. No las defino con campos concretos (eso es esquema, fase 3); las defino por su **responsabilidad de dominio** y su **razón de existir separada de las demás**.

#### CAPA 1 — Flujo / Captura

**`Signal` (Señal).**
Responsabilidad: capturar algo del mundo *sin compromiso de procesamiento*. Una idea a las 3am, un link, una frase oída en una reunión, un fragmento de un chat con un agente. Es el equivalente a la nota fugaz (fleeting) pero elevada a entidad de primera clase porque el flujo de captura es donde nace todo conocimiento y donde más fricción mata sistemas.
Razón de existir separada: una Signal no afirma nada sobre su propia veracidad, relevancia ni permanencia. Tratarla como entidad propia permite que el sistema (y los agentes) sepan que es material crudo no validado, y que tiene una política de caducidad agresiva (sección 3). Confundir Signals con conocimiento es el origen del "cementerio de notas".

**`Capture Session` (Sesión de captura).**
Responsabilidad: agrupar Signals producidas en un mismo contexto temporal/situacional (una jornada, una sesión de lectura, una conversación con un agente). Es el contenedor temporal que da contexto a Signals sueltas antes de que se destilen.
Razón de existir separada: el contexto de captura ("esto lo pensé mientras leía X") es información valiosa que se pierde si las Signals viven sueltas. También es la unidad natural sobre la que opera la revisión periódica de destilación.

#### CAPA 2 — Artefactos de trabajo

**`Endeavor` (Empeño).**
Responsabilidad: representar una unidad de trabajo dirigida a un resultado, con un ciclo de vida que empieza y termina. Subsume lo que otros sistemas llaman "proyecto", pero deliberadamente más abstracto: un Endeavor puede ser un proyecto de software, escribir un artículo, una investigación, preparar una charla. Tiene estado, objetivo, y un horizonte temporal.
Razón de existir separada: es la entidad que ancla el trabajo *activo* y que tiene fecha de muerte natural (se completa o se abandona). No debe contaminar la capa de conocimiento estable.

**`Commitment` (Compromiso).**
Responsabilidad: representar una responsabilidad continua sin fecha de fin (lo que PARA llama "área"): tu rol como Tech Lead, tu salud, una relación profesional que mantenés. A diferencia de Endeavor, no se "completa".
Razón de existir separada: distinguir lo que termina (Endeavor) de lo que se mantiene (Commitment) es la diferencia entre gestión de proyectos y gestión de vida, y tienen políticas de archivado opuestas.

**`Event` (Evento).**
Responsabilidad: registrar algo que ocurrió en un punto del tiempo y que importa: una reunión, una decisión tomada, un incidente, un hito. Es inmutable una vez cerrado — un Event no se edita, ocurrió.
Razón de existir separada: el conocimiento que nace de eventos (qué se decidió, qué se rompió) tiene propiedades distintas del conocimiento atemporal. Un Event es el ancla temporal de la cadena de razonamiento ("¿por qué decidimos X?" → tal Event).

**`Decision Record` (Registro de decisión).**
Responsabilidad: capturar una decisión con su contexto, alternativas consideradas, y consecuencias esperadas (el patrón ADR generalizado a cualquier dominio, no solo arquitectura de software). Es una sub-clase de Event con estructura más rica, pero la elevo a entidad propia por su valor desproporcionado.
Razón de existir separada: las decisiones son los nodos de mayor valor de razonamiento de todo el grafo. Un agente que entiende tus decisiones pasadas puede razonar como vos; uno que solo ve los resultados, no. Merecen ser ciudadanos de primera clase y tener relaciones tipadas fuertes (sección 2).

**`Source` (Fuente).**
Responsabilidad: representar cualquier origen externo de conocimiento — libro, paper, video, curso, artículo, conversación, repositorio de terceros. El `medium` es un atributo, no una entidad.
Razón de existir separada: la fuente es el referente de atribución. Mantenerla separada del conocimiento que extraés de ella es la distinción Zettelkasten literatura/permanente, y es crítica legalmente (atribución correcta para tu contenido de LinkedIn) y epistémicamente (no confundir "lo que leí" con "lo que pienso").

**`Excerpt` (Extracto).**
Responsabilidad: un fragmento atribuido de una Source — una cita, un highlight, un dato. Pertenece a una Source y aún no es conocimiento tuyo: es materia prima procesada pero no destilada.
Razón de existir separada: separar el extracto (de otro) de la nota permanente (tuya) preserva la frontera de autoría. Un agente nunca debe presentar un Excerpt como pensamiento tuyo.

**`Artifact` (Artefacto).**
Responsabilidad: algo producido por el sistema que vive afuera — un post de LinkedIn, un artículo publicado, un documento entregado, una charla. Tiene estado de publicación.
Razón de existir separada: cierra el loop del knowledge lifecycle (sección 3): el conocimiento no solo se acumula, se *expresa*. El Artifact es la salida del embudo, y su existencia como entidad permite rastrear qué conocimiento se convirtió en output (y cuál nunca, lo cual es señal de conocimiento huérfano).

#### CAPA 3 — Entidades del mundo (referentes estables)

**`Actor`.**
Responsabilidad: cualquier agente con intencionalidad en el mundo — una persona, una organización, un equipo. Persona y empresa son el mismo rol (un referente con el que el conocimiento se relaciona) distinguidos por un atributo `kind`.
Razón de existir separada: las personas y organizaciones son referentes extremadamente estables y de alta conectividad. Conectar ideas con quién las sostiene, quién las refutó, en qué empresa aplican, multiplica el valor del grafo (el caso de las 8.000 notas tenía 635 notas de personas por exactamente esta razón).

**`Technology`.**
Responsabilidad: una herramienta, lenguaje, framework, servicio o sistema técnico concreto y nombrable — Java, React, Kafka, una nube específica.
Razón de existir separada: para tu perfil, las tecnologías son nodos de altísima conectividad que cruzan Endeavors, Concepts y Decisions. Merecen entidad propia para poder preguntar "todo lo que sé y decidí sobre Kafka, en todos los proyectos".

**`Capability` (Capacidad).**
Responsabilidad: una habilidad, competencia o área de práctica — "diseño de sistemas distribuidos", "comunicación técnica". A diferencia de Technology (un artefacto concreto), es una aptitud.
Razón de existir separada: conecta tus objetivos de desarrollo personal con el conocimiento que los alimenta. Es el puente entre "qué sé" y "en qué quiero mejorar".

#### CAPA 4 — Conocimiento destilado (lo más estable, lo que sos vos)

**`Concept` (Concepto).**
Responsabilidad: una idea atómica, atemporal, orientada a concepto y no a fuente — el núcleo Zettelkasten/Evergreen. "Idempotencia", "backpressure", "el principio de mínimo privilegio". Una idea, una entidad. Título preciso como una API.
Razón de existir separada: es la unidad fundamental de conocimiento reutilizable. Es el chunk ideal para RAG, el nodo de razonamiento conceptual, y la pieza que sobrevive a todos los Endeavors. El grueso del valor a 10 años vive aquí.

**`Insight` (Aprendizaje).**
Responsabilidad: una conclusión propia, contextual, derivada de la experiencia — "en el proyecto X aprendí que sobre-optimizar Y costó Z". Se distingue del Concept en que el Insight es *situado y personal*; el Concept es *general y transferible*.
Razón de existir separada: tus aprendizajes son conocimiento de altísimo valor y de naturaleza distinta de los conceptos generales. Un Insight suele ser el germen que, destilado, produce un Concept o un Artifact.

**`Intent` (Intención / Objetivo).**
Responsabilidad: algo que querés lograr o en lo que querés convertirte — un objetivo profesional, personal, de aprendizaje. Tiene horizonte y estado de avance.
Razón de existir separada: es la entidad que da *dirección* a todo el sistema. Sin Intents explícitos, un agente no puede priorizar ni detectar la brecha entre lo que hacés y lo que decís querer (un caso de uso explícito del AKM). Es lo que convierte un repositorio pasivo en un sistema con propósito.

**`Prompt` (Prompt / Procedimiento de IA).**
Responsabilidad: una instrucción reutilizable y versionada para un agente de IA — un prompt probado, una skill, un procedimiento. Es conocimiento sobre *cómo operar agentes*.
Razón de existir separada: en un sistema AI-first, los prompts son conocimiento de primera clase, tan valioso como un Concept. Versionarlos, relacionarlos con las tareas donde funcionan, y medir su efectividad es parte del dominio, no configuración.

### 1.3 La entidad transversal: el Agente

**`Agent` (Agente de IA).**
Vive fuera de las cuatro capas porque no es conocimiento: es un *operador* del conocimiento, par del humano. Pero es entidad de dominio porque el sistema debe saber qué agentes existen, qué permisos tienen, qué escribieron, y con qué confiabilidad. Se detalla en la sección 5. Lo registro aquí para dejar explícito que en Atlas el agente no es infraestructura invisible — es un ciudadano del dominio con identidad, historial y reputación.

### 1.4 Lo que deliberadamente NO es una entidad

- **Tag/Etiqueta**: es un mecanismo de clasificación transversal, no una entidad con ciclo de vida. (Implementación, fase 3.)
- **Carpeta**: explícitamente excluida por mandato y por principio — la ubicación física no debe portar semántica.
- **Libro, Video, Reunión, Incidente** como entidades separadas: son atributos (`medium`, `kind`) de Source y Event respectivamente. Colapsarlas evita la explosión de entidades por formato.
- **Documento**: demasiado genérico para ser entidad. Todo es un "documento" en texto plano; lo que importa es qué *rol* juega (Concept, Source, Event...).

### 1.5 Diagrama de capas y entidades

```
CAPA 4  DESTILADO     [Concept] [Insight] [Intent] [Prompt]
                            ▲        ▲        ▲
CAPA 3  MUNDO         [Actor] [Technology] [Capability]
                            ▲        ▲
CAPA 2  TRABAJO   [Endeavor][Commitment][Event][Decision Record]
                  [Source][Excerpt][Artifact]
                            ▲
CAPA 1  FLUJO          [Signal] [Capture Session]

TRANSVERSAL            [Agent]  (opera sobre todas las capas)
```

---

## 2. ONTOLOGY — Cómo se relacionan las entidades

### 2.1 Principio: relaciones tipadas, direccionales y de primera clase

El hallazgo más importante de la fase 1: **un grafo útil no emerge de la similitud de embeddings ni de wikilinks genéricos; emerge de relaciones tipadas explícitas.** En Atlas, una relación no es "A está enlazado a B". Es "A `implementa` B", "A `contradice` B", "A `se_decidió_en` B". El verbo es parte del dato.

Esto tiene tres consecuencias de diseño:

1. **Las relaciones son direccionales y tienen inversa semántica.** Si Concept A `generaliza` Concept B, entonces B `es_caso_de` A. El sistema (o un agente) puede derivar la inversa, pero el tipo importa en ambas direcciones.
2. **Las relaciones tienen fuerza** (sección 7): no todas pesan igual en el razonamiento.
3. **Las relaciones pueden tener su propia metadata**: cuándo se creó, qué la afirma, con qué confianza. Una relación afirmada por un agente con baja reputación no pesa lo mismo que una que vos afirmaste explícitamente.

### 2.2 El vocabulario de relaciones (lenguaje ubicuo)

Defino un conjunto *cerrado y pequeño* de tipos de relación. Un vocabulario cerrado es lo que evita el caos del grafo (sección 7): si cualquiera puede inventar un verbo nuevo, en 2 años tenés 400 tipos de relación sinónimos y el grafo es ilegible para máquinas. El vocabulario puede crecer, pero solo por decisión deliberada, versionada, como se extiende un lenguaje — no por improvisación en cada nota.

Agrupo los tipos por familia semántica:

**Familia estructural (jerarquía y composición)**
- `generaliza` / `es_caso_de` — relación concepto-subconcepto.
- `compone` / `es_parte_de` — relación todo-parte.
- `agrupa` / `pertenece_a` — relación de pertenencia a un conjunto (una MOC agrupa Concepts).

**Familia epistémica (cómo el conocimiento se relaciona con el conocimiento)**
- `fundamenta` / `se_apoya_en` — A es base lógica de B.
- `contradice` ↔ (simétrica) — A y B son incompatibles. Crítica: el grafo debe poder representar tensión, no solo acuerdo.
- `refina` / `es_refinado_por` — A es una versión más madura de B.
- `ejemplifica` / `es_ejemplificado_por` — un caso concreto de una idea abstracta.

**Familia de procedencia (de dónde viene el conocimiento)**
- `deriva_de` — un Concept/Insight nació de una Source, un Event, una Signal. Esta es la cadena de trazabilidad: todo conocimiento destilado debe poder rastrear su origen.
- `atribuido_a` — un Excerpt/idea se atribuye a un Actor. La frontera de autoría.
- `afirmado_por` — quién (humano o Agent) sostiene esta pieza o relación. Clave para el modelo de confianza (sección 5).

**Familia operativa (cómo el conocimiento se conecta al trabajo)**
- `usa` — un Endeavor usa una Technology.
- `aplica` — un Endeavor/Artifact aplica un Concept.
- `decide` / `se_decidió_en` — un Decision Record decide sobre un Endeavor/Technology, y se ancló en un Event.
- `avanza` / `es_avanzado_por` — un Endeavor avanza un Intent.
- `produce` / `producido_por` — un Endeavor produce un Artifact.
- `expresa` — un Artifact expresa uno o más Concepts (cierra el lifecycle).

**Familia de IA (relaciones específicas del dominio AI-first)**
- `opera_con` — un Prompt opera con/sobre cierto tipo de tarea o entidad.
- `escrito_por` — cualquier entidad puede haber sido escrita o modificada por un Agent. Trazabilidad total de autoría máquina.
- `requiere_contexto` — una tarea/Prompt declara qué entidades necesita como contexto (alimenta directamente el Context Engine, sección 6).

### 2.3 Ejemplos de cadenas de razonamiento que esta ontología habilita

La prueba de una buena ontología es qué preguntas permite responder por traversal de grafo sin que un humano lo haya anticipado:

- *"¿Por qué elegimos Kafka en el proyecto X?"* → `Decision Record --se_decidió_en--> Event`, `Decision Record --usa--> Technology(Kafka)`, `Decision Record --se_apoya_en--> Concept(backpressure)`. El agente reconstruye el razonamiento completo, no solo el resultado.
- *"¿Qué conceptos contradicen mi Insight Y?"* → traversal por `contradice`. El sistema puede sostener tensión intelectual, no solo acumular acuerdos.
- *"¿Qué conocimiento nunca se expresó en un Artifact?"* → Concepts sin relación `expresa` entrante. Detección de conocimiento huérfano para el lifecycle.
- *"¿Qué decisiones se apoyaron en una Source que después resultó desactualizada?"* → traversal de procedencia. Permite re-evaluar decisiones cuando su fundamento cambia.

### 2.4 Diagrama de la ontología (núcleo)

```
        ┌──────────────────────────────────────────────┐
        │                                               │
   [Source]──Excerpt──atribuido_a──>[Actor]             │
      │                                ▲                 │
   deriva_de                       afirmado_por          │
      ▼                                │                 │
  [Concept]<──aplica──[Endeavor]──usa──>[Technology]     │
   ▲  │ ▲                  │  │            ▲              │
   │  │ contradice      avanza produce  decide           │
   │  │ ▼                  ▼     ▼          │             │
   │ [Concept]         [Intent] [Artifact]──expresa──────┘
   │                      ▲         
 deriva_de            (dirección)   
   │                                
 [Insight]<──deriva_de──[Event]<──se_decidió_en──[Decision Record]
   ▲                                                    │
 deriva_de                                          se_apoya_en
   │                                                    ▼
 [Signal]                                          [Concept]
```

---

## 3. KNOWLEDGE LIFECYCLE — Nacimiento, evolución, muerte

### 3.1 Principio: el conocimiento se mueve hacia arriba o muere

Atlas trata el conocimiento como un flujo dirigido a través de las cuatro capas, no como un stock. El estado por defecto de toda pieza es **caducar**, salvo que sea promovida activamente. Esto invierte la entropía natural de los sistemas de notas: en la mayoría, todo se acumula por defecto y muere por olvido (cementerio). En Atlas, todo caduca por defecto y sobrevive por promoción (jardín que se poda).

### 3.2 La máquina de estados del conocimiento

Toda pieza de conocimiento atraviesa estados explícitos. El estado es metadata de primera clase (machine-readable), no una intuición.

```
  CAPTURED ──> TRIAGED ──> DISTILLED ──> CONNECTED ──> CANONICAL
     │           │            │             │             │
     │           │            │             │             ▼
     │           │            │             │         EVERGREEN (mantenida viva)
     │           │            │             │             │
     ▼           ▼            ▼             ▼             ▼
  EXPIRED <───────────────────────────────────────── DEPRECATED
  (Signal muere)                                  (era canónica, ya no aplica)
```

- **CAPTURED**: existe como Signal cruda. Sin validar, sin conectar. Reloj de caducidad corriendo (días/semanas).
- **TRIAGED**: revisada en una sesión de destilación. Decisión binaria: ¿esto merece subir o muere? Si muere → EXPIRED (no se borra necesariamente, se marca; ver 3.4).
- **DISTILLED**: convertida en una entidad de capa 4 (Concept/Insight) o capa 2 (se asoció a un Endeavor/Source). Ahora es conocimiento, no flujo.
- **CONNECTED**: tiene al menos una relación tipada significativa con el resto del grafo. Una nota sin conexiones no está conectada aunque exista.
- **CANONICAL**: es la representación de referencia de su idea. No hay otra nota compitiendo por el mismo concepto (resuelve duplicación).
- **EVERGREEN**: estado de mantenimiento activo — se revisita y refina periódicamente. Reservado para el conocimiento de mayor valor.
- **DEPRECATED**: fue canónica, pero el mundo cambió (la tecnología quedó obsoleta, la decisión se revirtió). No se borra: el conocimiento histórico de "esto creíamos antes y por qué cambió" es valioso. Se marca y se desconecta de las cadenas de razonamiento activas.
- **EXPIRED**: Signal que no mereció promoción. Candidata a archivo histórico o purga.

### 3.3 Quién mueve los estados

- El **humano** promueve por juicio (lo más valioso sube por decisión consciente).
- Los **agentes** proponen transiciones, nunca las ejecutan unilateralmente en piezas de alto valor (human-in-the-loop, sección 5). Un agente puede mover CAPTURED→TRIAGED y proponer DISTILLED; promover a CANONICAL o EVERGREEN requiere aprobación humana.
- El **tiempo** ejecuta caducidad automática: Signals en CAPTURED más allá de su ventana pasan a candidatas a EXPIRED sin intervención.

### 3.4 Cómo se evita la nota muerta (tres mecanismos, no uno)

1. **Caducidad por defecto** (arriba): lo que no se promueve, no sobrevive en la capa activa.
2. **Resurfacing activo**: las entidades de alta conectividad (MOCs, Intents) actúan como puntos de entrada que traen de vuelta conocimiento relevante; un agente puede detectar Concepts CANONICAL que no se han tocado ni referenciado en N meses y proponer revisión, fusión o deprecación.
3. **Detección de orfandad**: el sistema puede consultar nodos sin relaciones entrantes/salientes significativas (huérfanos estructurales) y nodos cuya última `afirmado_por` es vieja y nunca se conectó. Esto es una query sobre el grafo, ejecutable como tarea recurrente del AKM.

### 3.5 Qué hace que una pieza "deje de ser relevante"

La irrelevancia no es falta de uso (eso es resurfacing). La irrelevancia es **pérdida de fundamento**: una pieza pasa a DEPRECATED cuando aquello en lo que `se_apoya_en` quedó desactualizado, o cuando algo que la `contradice` ganó. Modelar esto como traversal de grafo (no como decisión manual nota por nota) es lo que permite que el sistema se mantenga honesto a escala: cuando una Source se marca obsoleta, todo lo que `deriva_de` ella se puede señalar para re-evaluación automáticamente.

---

## 4. MEMORY MODEL — Memoria inspirada en cognición, no copiada de ella

### 4.1 Principio: la memoria es una política de acceso, no un lugar

El error de los modelos de memoria tipo "memoria inmediata / activa / permanente" es que confunden *dónde vive el dato* con *qué tan accesible está*. En Atlas todo vive en el mismo sustrato de texto plano (local-first, markdown-first). La memoria no es un conjunto de cajones físicos; es una **función de activación** que determina qué tan rápido y con qué prioridad una pieza entra en el contexto de razonamiento, humano o de agente.

Diseño la memoria sobre tres ejes ortogonales, no sobre una escalera de niveles. Una pieza tiene una posición en cada eje simultáneamente. Esto es más expresivo que niveles porque captura que algo puede ser, a la vez, viejo (eje temporal) pero altamente activado (eje de relevancia) — exactamente lo que pasa con un principio que aprendiste hace 10 años y usás cada día.

### 4.2 Los tres ejes de la memoria

**Eje 1 — Activación (qué tan "caliente" está ahora).**
Análogo a la memoria de trabajo. Determinado por: recencia de acceso, conexión a Intents activos, conexión a Endeavors en curso. Es dinámico y decae con el tiempo si no se refuerza. Es el eje que el Context Engine consulta primero (sección 6). Una pieza muy activada entra en contexto casi sin costo; una fría hay que ir a buscarla deliberadamente.

**Eje 2 — Consolidación (qué tan establecida está como conocimiento).**
Análogo a la consolidación de memoria de largo plazo. Mapea directamente sobre la máquina de estados del lifecycle: CAPTURED es no consolidado, EVERGREEN/CANONICAL es máximamente consolidado. Determina cuánto puede *confiar* un agente en la pieza: el conocimiento consolidado es base segura para razonar; el no consolidado debe tratarse como tentativo.

**Eje 3 — Persistencia (cuánto debe durar y a qué fidelidad).**
Análogo a la distinción entre memoria episódica detallada y memoria semántica comprimida. Una pieza muy persistente se preserva con todo su detalle indefinidamente (Decisions, Concepts canónicos). Una poco persistente se *comprime*: una Capture Session vieja se puede reducir a un resumen y archivar el detalle. Esto es la analogía de cómo el cerebro retiene el gist y olvida el detalle de episodios viejos.

### 4.3 Operaciones de memoria

- **Activación / refuerzo**: acceder a una pieza, conectarla a un Intent activo, o que un agente la use, sube su activación.
- **Decaimiento**: la activación baja con el tiempo sin uso. NO baja la consolidación — algo consolidado sigue siendo verdadero aunque esté frío.
- **Consolidación**: promoción en el lifecycle = consolidación en memoria. Es el mismo movimiento visto desde dos ángulos.
- **Compresión** (la operación más distintiva): cuando algo cae en persistencia, su detalle episódico se resume y el original se archiva. El gist sobrevive en la capa activa; el detalle se mueve a memoria histórica recuperable bajo demanda. Esto es lo que mantiene la capa activa pequeña y rápida sin perder información — resuelve directamente el problema del caso de las 8.000 notas donde el grafo global se vuelve inservible: la mayoría de las piezas viejas no deberían estar en la capa caliente.
- **Reconsolidación**: cuando una pieza consolidada se contradice por conocimiento nuevo, vuelve a estado tentativo hasta resolverse (modela el `contradice` del lifecycle como un evento de memoria, no solo de grafo).

### 4.4 Memoria histórica vs. olvido

Atlas casi nunca borra (olvido destructivo); comprime y archiva (olvido como reducción de fidelidad). La razón es AI-first: el conocimiento histórico de "qué pensábamos antes y por qué cambiamos" es de los datos más valiosos para que un agente razone sobre tu evolución. Pero ese historial vive en memoria de baja activación y baja persistencia de detalle — presente, recuperable, pero fuera del camino del razonamiento cotidiano. La única excepción donde sí hay borrado destructivo: Signals EXPIRED que nunca fueron triaged y no tienen ninguna conexión — ruido puro, sin valor histórico.

---

## 5. AGENT INTERACTION MODEL — Múltiples agentes sobre una base compartida

### 5.1 Principio: los agentes son ciudadanos con identidad, permiso y reputación

En un sistema usado por múltiples agentes simultáneamente, el modelo de interacción es esencialmente un problema de **concurrencia sobre estado compartido con actores de confiabilidad variable**. Lo trato con el rigor con que se trata un sistema distribuido, porque eso es lo que es.

Todo `Agent` tiene: una **identidad** estable, un **scope de permisos** explícito (qué entidades puede leer, cuáles escribir, qué transiciones de estado puede ejecutar), y una **reputación** acumulada (qué proporción de sus propuestas fueron aprobadas/revertidas por el humano). La reputación no es decorativa: pondera cuánto pesa lo que el agente `afirma` en el grafo.

### 5.2 Cómo leen

Ningún agente lee el sustrato completo (eso es el Context Engine, sección 6). La lectura es siempre una **query contextualizada**: el agente declara qué necesita (`requiere_contexto`), el motor le entrega el contexto mínimo. La lectura es libre dentro del scope de permisos — leer no genera conflictos.

### 5.3 Cómo escriben

La escritura sigue un protocolo estricto de **propuesta → validación → commit**, nunca escritura directa silenciosa sobre conocimiento de valor:

1. **Propose**: el agente genera una propuesta de cambio (nueva entidad, nueva relación, transición de estado) como un artefacto explícito, no como una mutación. Toda propuesta lleva `afirmado_por` = ese agente.
2. **Validate**: la propuesta pasa validaciones automáticas (¿respeta los invariantes del dominio? ¿el tipo de relación está en el vocabulario cerrado? ¿la entidad referenciada existe?) y, según el nivel de riesgo, validación humana.
3. **Commit**: la propuesta aprobada se integra y queda registrada con autoría y timestamp.

El nivel de fricción es proporcional al valor y la irreversibilidad, como en la jerarquía de acciones de un agente bien diseñado:
- Operaciones de **bajo riesgo** sobre capa 1 (triage de Signals, sugerir tags): el agente puede ejecutar con auditoría posterior.
- Operaciones de **riesgo medio** (crear un Concept, proponer una relación): propuesta + validación automática, commit si pasa.
- Operaciones de **alto riesgo** (promover a CANONICAL, deprecar conocimiento, escribir un Decision Record, modificar un Intent): human-in-the-loop obligatorio, siempre.

### 5.4 Cómo evitan conflictos

El estado compartido con múltiples escritores es el problema duro. Tres mecanismos:

1. **Granularidad atómica**: como cada Concept/entidad es atómica (una idea, un agregado), dos agentes trabajando en ideas distintas no colisionan — la atomicidad del modelo de dominio es también la estrategia de concurrencia. La mayoría de los conflictos desaparecen por diseño.
2. **Versionado como verdad** (Git-like): cada cambio es un commit con autor y padre. Los conflictos reales (dos agentes editan la misma entidad) se detectan como conflictos de merge, no se pierden silenciosamente. El historial es la fuente de verdad de quién hizo qué.
3. **Locks suaves por intención**: un agente que va a trabajar sobre una entidad declara intención (`requiere_contexto` con propósito de escritura); otros agentes ven esa intención y ceden o esperan. No es un lock duro (no bloquea), es coordinación cooperativa — apropiado porque los agentes no son adversarios.

### 5.5 Cómo colaboran y validan entre sí

Los agentes pueden validarse mutuamente, lo cual eleva la calidad sin meter al humano en cada paso. Un agente especializado en consistencia ontológica puede revisar las propuestas de un agente de captura. La relación `afirmado_por` permite que el grafo registre acuerdo o desacuerdo entre agentes: una pieza afirmada por dos agentes independientes y validada por el humano tiene confianza máxima; una afirmada por un solo agente de baja reputación, mínima.

### 5.6 El invariante de seguridad no negociable

Heredo de la fase 1 el riesgo de la **"trifecta letal"** (acceso a datos privados + exposición a contenido no confiable + capacidad de exfiltrar). Principio de diseño duro: ningún agente debe tener simultáneamente los tres. Un agente que procesa contenido externo no confiable (páginas web, emails) opera en un scope aislado, sin acceso de escritura al conocimiento canónico ni capacidad de exfiltración. Mínimo privilegio, permisos con expiración, humano en el loop para todo lo irreversible. Esto no es una recomendación operativa: es un invariante del dominio, codificado en el scope de permisos de la entidad Agent.

---

## 6. CONTEXT ENGINE — Construcción del contexto mínimo necesario

### 6.1 Principio: el contexto se construye, no se lee

Este es, como dijiste, uno de los documentos más importantes, porque es donde un sistema AI-first se gana o se pierde. Un agente que lee el vault completo es inviable (costo, latencia, ruido) y peligroso (ventana de contexto saturada de irrelevancia degrada el razonamiento). El Context Engine es el componente que, dada una tarea, **ensambla el subgrafo mínimo suficiente** para resolverla bien.

La metáfora correcta no es "buscar en una biblioteca". Es **"el sistema de atención del cerebro"**: dado un foco, traer a la conciencia activa solo lo relevante, suprimir el resto, y poder expandir el foco si hace falta.

### 6.2 El algoritmo de construcción de contexto (conceptual)

Dada una **intención de tarea** (declarada por el agente o el humano), el motor construye el contexto en fases, expandiendo solo lo necesario:

**Fase 0 — Anclaje (¿de qué trata esto?).**
Identificar las entidades semilla: las que la tarea menciona o referencia directamente. Si la tarea es "escribir un post sobre backpressure", la semilla es `Concept(backpressure)`.

**Fase 1 — Expansión por relaciones fuertes.**
Desde las semillas, traer los vecinos conectados por relaciones de **alta fuerza** (sección 7): el Concept canónico, sus `ejemplifica`, sus `contradice`, sus `deriva_de`. Una capa de traversal, no todo el grafo.

**Fase 2 — Inyección de memoria activada.**
Sumar las piezas de **alta activación** (eje 1 de la memoria) relacionadas con las semillas — lo que está "caliente" porque pertenece a Endeavors o Intents activos. Esto da contexto situacional: no solo qué es backpressure, sino que estás escribiendo para LinkedIn en el contexto de tu Endeavor activo.

**Fase 3 — Filtro por consolidación y confianza.**
Excluir o marcar como tentativo lo no consolidado (capa 1) y lo afirmado por agentes de baja reputación, salvo que la tarea pida explícitamente material crudo. El contexto entregado distingue "conocimiento firme" de "material tentativo".

**Fase 4 — Expansión bajo demanda (lazy).**
Si el agente, razonando, detecta que necesita más (sigue una relación hacia afuera del subgrafo), puede solicitar expansión incremental. El motor nunca entrega de más por las dudas; entrega lo mínimo y expande si se pide. Esto es la diferencia entre atención focalizada y saturación.

### 6.3 Presupuesto de contexto

Cada construcción de contexto opera bajo un **presupuesto** explícito (tamaño máximo del subgrafo). Si el contexto relevante excede el presupuesto, el motor **comprime** (usa los resúmenes/gist de la memoria de baja persistencia en vez del detalle completo) antes que truncar arbitrariamente. Preferir el gist de muchas piezas sobre el detalle de pocas, salvo que la tarea requiera profundidad. Esto convierte la operación de compresión de la memoria (sección 4) en un parámetro de primera clase del motor de contexto.

### 6.4 Por qué este diseño escala a 10 años / 100.000 notas

El costo de construir contexto depende del *tamaño del subgrafo relevante*, no del tamaño total del vault. Un vault de 100.000 notas y uno de 1.000 producen contextos de tamaño similar para la misma tarea, porque el motor traversa localmente desde las semillas. Esta es la propiedad que rompe el techo de escala que el caso real de la fase 1 encontró (grafo global inservible): el motor de contexto nunca toca el grafo global, siempre opera local. La escala deja de ser un problema de rendimiento.

### 6.5 Diagrama del motor de contexto

```
  TAREA ──> [Fase 0: anclar semillas]
                    │
                    ▼
            [Fase 1: expandir relaciones FUERTES] ──1 hop──┐
                    │                                       │
                    ▼                                       │
            [Fase 2: inyectar memoria ACTIVADA] <───────────┘
                    │
                    ▼
            [Fase 3: filtrar por consolidación/confianza]
                    │
                    ▼
            [presupuesto excedido?] ──sí──> [comprimir a gist]
                    │ no                          │
                    ▼                             ▼
            CONTEXTO MÍNIMO ENTREGADO  <──────────┘
                    │
              [agente razona]
                    │
            ¿necesita más? ──sí──> [Fase 4: expansión lazy] ──┐
                    │ no                                       │
                    ▼                                          │
                 RESULTADO                                     │
                    ▲──────────────────────────────────────────┘
```

---

## 7. KNOWLEDGE GRAPH — Cómo crece el grafo sin volverse caótico

### 7.1 Nodos y relaciones (recapitulación operativa)

Los **nodos** son las entidades de la sección 1. Las **relaciones** (aristas) son el vocabulario tipado de la sección 2. Lo nuevo aquí es la **gobernanza del crecimiento**: qué hace que un grafo crezca útil en vez de caótico.

### 7.2 Fuerza de las relaciones

No todas las aristas pesan igual. La fuerza es un atributo de la relación, y determina su rol en el traversal (Context Engine) y en el razonamiento.

**Relaciones fuertes** (estructurales y epistémicas, afirmadas deliberadamente):
- `fundamenta`/`se_apoya_en`, `contradice`, `generaliza`/`es_caso_de`, `decide`/`se_decidió_en`, `deriva_de`, `expresa`.
- Son las que el Context Engine sigue por defecto. Son escasas y de alto valor. Se crean por juicio (humano) o por propuesta validada (agente).

**Relaciones débiles** (asociativas, de proximidad):
- Similitud semántica por embeddings, co-ocurrencia, "relacionado con" genérico.
- NO se siguen por defecto en el traversal; son señales de descubrimiento ("quizás te interese"), no aristas de razonamiento. Pueden ser muchas y baratas. Un agente las usa para *sugerir* nuevas relaciones fuertes, que luego se validan y promueven.

La distinción fuerte/débil es el mecanismo central anti-caos: **el grafo de razonamiento (aristas fuertes) se mantiene escaso y legible; el grafo de descubrimiento (aristas débiles) puede ser denso y ruidoso sin contaminar el razonamiento.** Son dos grafos superpuestos sobre los mismos nodos, con políticas opuestas.

### 7.3 Cómo crece sano (reglas de gobernanza)

1. **Vocabulario de relaciones cerrado** (sección 2.2): el conjunto de tipos de aristas fuertes crece solo por decisión versionada. Esto impide la proliferación de verbos sinónimos que vuelve el grafo ilegible para máquinas.
2. **Toda arista fuerte tiene procedencia**: `afirmado_por` + timestamp. Una arista sin procedencia es sospechosa y se marca para revisión. Esto permite auditar y revertir contaminación.
3. **Nodos atómicos, un concepto = un nodo canónico**: la disciplina de CANONICAL del lifecycle evita el grafo donde la misma idea está fragmentada en 5 nodos mal conectados.
4. **Las relaciones débiles nunca se promueven automáticamente a fuertes**: requieren validación. Un embedding que dice "estas dos notas se parecen" es una hipótesis de relación, no una relación.
5. **MOCs como nodos de gobernanza, no de contenido**: las entidades que `agrupan` (índices, mapas de contenido) son los puntos de alta conectividad deliberada — son donde el humano y los agentes imponen estructura sobre la emergencia. El caso real confirmó que estos nodos concentran ~30x la conectividad promedio; en Atlas son explícitamente el mecanismo de navegación y resurfacing.

### 7.4 Métricas de salud del grafo (observabilidad)

Como el sistema debe ser observable (principio no negociable), el grafo se mide:
- **Tasa de orfandad**: nodos sin aristas fuertes / total. Subiendo = se está acumulando conocimiento desconectado (cementerio incipiente).
- **Densidad de razonamiento**: aristas fuertes por nodo canónico. Cayendo = el conocimiento se está acumulando sin integrarse.
- **Deuda de procedencia**: aristas fuertes sin `afirmado_por`. Subiendo = contaminación, riesgo de grafo no auditable.
- **Ratio de tensión**: presencia de `contradice`. Cero contradicciones en un grafo grande es señal de alarma (acumulás solo lo que confirma tus sesgos, no pensás críticamente).
- **Edad de activación**: distribución del eje de activación. Demasiada masa fría = el sistema no se está usando para razonar, solo para acumular.

Estas métricas son queries sobre el grafo, ejecutables como tarea recurrente de un agente de mantenimiento (AKM), y son el equivalente a los health checks de un sistema productivo.

---

## 8. DESIGN PRINCIPLES — Los "SOLID" del conocimiento

Ocho principios. Cada uno tiene nombre, enunciado, y la consecuencia de violarlo. Son los invariantes que ningún componente, herramienta o agente puede transgredir. Cuando una decisión futura entre en conflicto, estos principios desempatan.

**P1 — Separación de Procedencia (Provenance Separation).**
*Todo conocimiento debe poder rastrear su origen y su autoría; lo que afirma otro y lo que afirmás vos nunca se mezclan en el mismo nodo.*
Violarlo produce: confusión entre cita y pensamiento propio (riesgo legal y epistémico), y un grafo donde no se puede auditar de dónde vino una afirmación cuando su fundamento cambia.

**P2 — Atomicidad de Significado (Meaning Atomicity).**
*Cada nodo de conocimiento expresa exactamente una idea, con un título tan preciso como la firma de una API.*
Violarlo produce: nodos que no se pueden reutilizar ni enlazar limpiamente, chunks de mala calidad para RAG, y un grafo donde las relaciones quedan "embarradas" (un nodo que mezcla 3 ideas no puede tener relaciones tipadas limpias).

**P3 — Tipado de Relaciones (Typed Relations).**
*Toda relación de razonamiento lleva un verbo de un vocabulario cerrado; "está enlazado a" no es una relación, es ausencia de una.*
Violarlo produce: el caos del grafo: imposibilidad de razonar por traversal, y degradación a una bolsa de enlaces genéricos donde ni humano ni máquina pueden reconstruir una cadena de razonamiento.

**P4 — Caducidad por Defecto (Default Expiry).**
*El estado por defecto de toda pieza es caducar; la supervivencia se gana por promoción activa, no por inercia.*
Violarlo produce: el cementerio de notas. Todo lo que se acumula por defecto y muere por olvido en vez de podarse activamente.

**P5 — Doble Legibilidad Sin Duplicación (Dual-Readability, Single-Source).**
*Cada artefacto es legible por humano y por máquina en el mismo objeto de texto plano; nunca hay dos representaciones que sincronizar.*
Violarlo produce: deuda de sincronización entre la "versión humana" y la "versión máquina", que es donde estos sistemas se pudren. Y dependencia de herramienta (si la versión-máquina vive en un formato propietario, perdés el local-first).

**P6 — Contexto Mínimo (Minimal Context).**
*Ningún consumidor lee el grafo completo; el contexto se construye al tamaño mínimo suficiente para la tarea y se expande solo bajo demanda.*
Violarlo produce: costo y latencia insostenibles, razonamiento degradado por ruido, y un techo de escala que hace inviable el sistema a 10 años / 100.000 nodos.

**P7 — Autonomía Acotada (Bounded Autonomy).**
*Los agentes proponen; el humano dispone sobre lo irreversible y lo canónico. El privilegio es mínimo, explícito y con expiración.*
Violarlo produce: corrupción silenciosa del conocimiento canónico, pérdida de control, y exposición a la trifecta letal. La velocidad nunca justifica saltarse el human-in-the-loop en lo de alto valor.

**P8 — Independencia de Herramienta (Tool Independence).**
*El dominio es el contrato; toda herramienta que lo lee o escribe es una implementación intercambiable. Ninguna decisión de dominio puede depender de una feature específica de una app.*
Violarlo produce: lock-in encubierto. El día que la herramienta muera o cambie, migrás conceptos y no solo archivos — exactamente lo que el local-first/markdown-first existe para prevenir.

### 8.1 Jerarquía de principios cuando entran en conflicto

Cuando dos principios chocan, este es el orden de prioridad (de mayor a menor):
**P8 (Independencia de Herramienta) > P5 (Doble Legibilidad) > P7 (Autonomía Acotada) > P1 (Procedencia) > P3 (Tipado) > P2 (Atomicidad) > P4 (Caducidad) > P6 (Contexto Mínimo).**

La lógica: lo que protege la supervivencia a 10 años (P8, P5) gana sobre lo que optimiza la operación diaria (P6). La seguridad (P7) y la honestidad epistémica (P1) ganan sobre la elegancia estructural (P2, P3). Ejemplo de uso: si una optimización de contexto (P6) requiriera duplicar conocimiento en una representación separada solo-máquina (violando P5), se rechaza — la durabilidad del activo gana sobre la eficiencia del runtime.

---

## 9. Cierre y trazabilidad con la fase 1

Cada decisión de este RFC tiene raíz en un hallazgo de la investigación:
- Las cuatro capas y la caducidad por defecto responden al quiebre documentado de la organización manual a las ~1.000 notas y al cementerio de notas.
- Las relaciones tipadas fuertes/débiles responden directamente al hallazgo de que un grafo útil no emerge de embeddings sino de relaciones explícitas (RAG vectorial vs. grafo).
- El modelo de agentes (propose/validate/commit, reputación, trifecta letal) operacionaliza el marco de Agentic Knowledge Management y sus requisitos de seguridad.
- El Context Engine (traversal local, presupuesto, compresión) responde al techo de escala del grafo global inservible.
- La doble legibilidad sin duplicación y la independencia de herramienta responden a la apuesta local-first/markdown-first y al riesgo de lock-in (caso Quip).

Lo que este RFC deliberadamente NO hizo, por mandato: no definió carpetas, nombres de archivo, esquema concreto de properties, plugins ni plantillas. Todo eso es la **fase 3 — Diseño de la Representación Física**, donde el dominio aquí definido se materializa en convenciones concretas de markdown/YAML, y donde recién entonces se decide qué herramientas (Obsidian u otras) implementan el contrato.

---

*RFC-001 — Proyecto Atlas, Fase 2. Documento de arquitectura de dominio. Base para construir Atlas durante los próximos 10 años.*
