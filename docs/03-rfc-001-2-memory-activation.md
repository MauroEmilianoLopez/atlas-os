# PROYECTO ATLAS — RFC-001.2
## Memory Activation Model

**Estado:** Cierra la Open Question #1 de RFC-001.1
**Fase:** 2.2 — Modelo de activación de memoria
**Alcance:** SOLO el mecanismo de activación. No reabre el Domain Model, la ontología ni el lifecycle. No añade entidades.
**Dependencia:** asume RFC-001.1 (Task/Execution, lifecycle de 3 estados, Policy como dato, las cuatro relaciones de procedencia, Context Engine con cascada de degradación).

---

## 1. Executive Summary

1. **La activación es una propiedad derivada, no almacenada como verdad.** Es un score calculado sobre señales que ya existen en el grafo y en las Tasks. No introduce una entidad nueva ni un campo "fuente de verdad" que haya que mantener sincronizado — esto respeta la decisión de RFC-001.1 de que las propiedades derivadas se calculan, no se transicionan a mano.

2. **El modelo separa tres preguntas que suelen confundirse:** "¿cuán caliente está esto ahora?" (activación), "¿cuán establecido está?" (consolidación, que ya mapea sobre el lifecycle) y "¿cuán importante es intrínsecamente?" (relevancia estructural). La activación combina recencia con relevancia estructural, pero **deja la importancia intrínseca como un piso que el decaimiento no puede cruzar** — ese es el mecanismo central anti-sesgo.

3. **La activación tiene dos componentes con vidas distintas:** un componente **volátil** (recencia de uso, que decae rápido) y un componente **estructural** (posición en el grafo, respaldo humano, conexión a Intents activos, que decae lento o no decae). Esta separación es lo que evita que el conocimiento profundo se enfríe solo por no haberse tocado.

4. **La estrategia de recálculo es híbrida:** el componente estructural se recalcula por Task recurrente de baja frecuencia (es estable); el componente volátil se calcula lazy en el momento en que el Context Engine lo necesita (es barato y siempre fresco). Esto evita tanto el costo de recalcular todo el vault constantemente como el riesgo de operar sobre activación obsoleta.

5. **La activación gobierna las transiciones del lifecycle, pero nunca sola.** Activación baja + sin respaldo + Initiative cerrada → candidato a compresión a ARCHIVED. Pero activación baja + alto respaldo humano + es_evergreen → se queda LIVING. La activación es una señal de entrada a las Policies de transición, no la decisión.

6. **Cinco sesgos se atacan con cinco mecanismos concretos**, no con buenas intenciones: piso de importancia estructural (recency bias), penalización de popularidad sin profundidad (popularity bias), bonus de tensión para `contradice` (confirmation bias), decaimiento forzado de lo ligado solo a la Initiative actual (overfitting al trabajo), y reactivación proactiva de conocimiento histórico de alto respaldo (pérdida de conocimiento profundo).

7. **Los agentes consultan activación, no la escriben.** La activación es un servicio de lectura para el Context Engine, las Review Tasks, el archivado y la sugerencia de relaciones. Ningún Agent "sube la activación" de algo directamente — la activación sube como consecuencia de que el conocimiento se usó, no como acción.

8. **El feedback loop ya existente (RFC-001.1) alimenta la activación sin maquinaria nueva.** Feedback positivo sobre una pieza es una señal de entrada; feedback negativo la penaliza. No se añade nada: se reutiliza el Event tipado de Feedback.

9. **La observabilidad es la parte más importante del modelo, no un apéndice.** Las métricas (conocimiento importante pero frío, nodos activos sin uso real, Tasks que fallaron por contexto insuficiente) son lo que permite detectar que el modelo de activación está mal calibrado *antes* de que degrade el sistema. Se calculan como Review Tasks bajo Policy.

10. **El modelo es deliberadamente simple en su núcleo y configurable en sus pesos.** Los pesos de cada señal viven como Policy (dato), no hardcodeados, para poder recalibrarse con la evidencia de las métricas sin reescribir el modelo. La fórmula es conceptual y estable; los pesos son evolutivos.

---

## 2. Definition of Activation

### 2.1 Definición precisa, no metafórica

**Activación de un Knowledge Object (KO) es un score numérico, recalculable y acotado, que estima la probabilidad de que ese KO sea relevante para el trabajo del operador o de un agente en el momento presente.**

Tres propiedades la definen como cosa calculable y no metáfora:

- **Es un escalar acotado** (conceptualmente, un valor normalizado en un rango fijo, p. ej. 0–100). No es una etiqueta cualitativa; es comparable y ordenable entre KOs.
- **Es derivada y reproducible.** Dada la misma evidencia (señales del grafo + historial de Tasks + feedback), dos cálculos producen el mismo score. No tiene estado oculto.
- **Es temporal.** El score de un KO en el momento T puede diferir del de T+1 aunque nada se haya editado, porque el tiempo mismo es una señal (decaimiento). Esto es lo que la distingue de "importancia", que es atemporal.

### 2.2 Lo que la activación NO es

- **No es consolidación.** Algo puede estar máximamente consolidado (un Concept canónico, LIVING desde hace años) y tener activación baja porque no se usó este trimestre. Son ejes ortogonales (RFC-001.1 §4). Confundirlos es el error que este RFC existe para evitar.
- **No es importancia intrínseca.** Un Decision Record fundacional es importante para siempre, pero su activación fluctúa. La importancia es un *piso* de la activación (§7), no la activación misma.
- **No es estado del lifecycle.** FLEETING/LIVING/ARCHIVED es la consolidación. La activación es una señal que *informa* las transiciones, no las define.

### 2.3 Las tres bandas operativas

Para uso práctico, el score continuo se interpreta en tres bandas (los umbrales viven como Policy, no fijos aquí):

- **ACTIVO (hot)** — alta activación. Entra en contexto casi sin costo. Es lo que el operador y los agentes están usando o probablemente usarán pronto.
- **FRÍO (cold)** — baja activación. Existe, es recuperable, pero no entra en contexto por defecto. La mayoría del conocimiento sano vive aquí — un vault donde todo está caliente es un vault que no escala.
- **REACTIVABLE (warm/dormant)** — activación baja PERO con alto componente estructural (respaldo humano, posición central en el grafo, importancia). Frío pero marcado como "vale la pena traer de vuelta proactivamente". Es la banda que previene la pérdida de conocimiento profundo.

---

## 3. Activation Inputs

### 3.1 Los dos componentes (la decisión estructural del modelo)

La activación se compone de dos sumandos con dinámicas temporales opuestas. Esta separación es el núcleo del diseño:

**Componente VOLÁTIL — "¿se tocó esto recientemente?"**
Decae rápido. Sin refuerzo, tiende a cero en semanas. Captura la atención de corto plazo.

**Componente ESTRUCTURAL — "¿esto importa por su posición y respaldo?"**
Decae lento o no decae. Captura el valor intrínseco y duradero. Es el piso que evita que lo profundo se enfríe.

`activation = volátil(t) + estructural`

donde `volátil` es función del tiempo (decae) y `estructural` es casi estable (cambia solo cuando cambia el grafo o el respaldo).

### 3.2 Señales que aumentan activación

Clasificadas por componente, porque eso determina si decaen o no:

**Aportan al componente VOLÁTIL (decaen):**
- Acceso reciente (lectura por humano o agente).
- Edición reciente.
- Uso en una Task reciente (`requiere_contexto` que lo incluyó, o `produjo` que lo tocó).
- Mención en conversaciones/capturas recientes (Signals que lo referencian).

**Aportan al componente ESTRUCTURAL (no decaen, o decaen muy lento):**
- Relación con una **Initiative activa** (`avanza`/`trata_sobre` una Initiative en curso). Nota crítica: esto decae *cuando la Initiative se cierra*, no con el tiempo — es un decaimiento por evento, no por reloj.
- Relación con un **Intent activo** — conecta con el propósito; mientras el Intent esté vivo, sostiene activación.
- Uso en un **Artifact publicado** — señal de que produjo valor expresado. Persistente.
- **Respaldo humano** (`respaldado_por` = humano) y **validación humana** (`validado_por`). La señal más fuerte y más duradera: lo que el operador garantizó como verdadero no debe enfriarse solo por desuso.
- **Cantidad y calidad de relaciones fuertes** — un nodo central del grafo de razonamiento. Pero con tope anti-popularidad (§7).
- **Contradicciones activas** (`contradice` no resuelta) — la tensión intelectual no resuelta merece mantenerse caliente; es trabajo cognitivo pendiente.
- **review_required = true** — algo marcado para revisión debe estar visible hasta que se revise.
- **is_evergreen = true** — flag de mantenimiento activo; sostiene un piso de activación.

### 3.3 Por qué esta clasificación importa

Si todas las señales decayeran (modelo ingenuo), el conocimiento profundo y respaldado se enfriaría por no tocarse, y el sistema olvidaría lo importante — exactamente el recency bias que la pregunta 7 pide evitar. Al poner respaldo, posición estructural e importancia en el componente *que no decae*, el modelo garantiza que la profundidad sobreviva al desuso. Esta es la decisión de la que cuelga todo lo demás.

---

## 4. Decay Model

### 4.1 Solo decae lo volátil

El decaimiento se aplica **únicamente al componente volátil**. El componente estructural no decae por reloj; cambia solo por eventos (Initiative cerrada, respaldo retirado, relación eliminada).

### 4.2 Forma del decaimiento

Decaimiento **exponencial con vida media configurable**, no lineal. Razón: el decaimiento lineal trata igual a algo de hace 3 días que a algo de hace 3 meses hasta que cruza un umbral; el exponencial modela mejor la atención real (lo de ayer pesa mucho, lo de hace un mes pesa poco, y la transición es suave). La vida media (cuánto tarda el componente volátil en reducirse a la mitad sin refuerzo) es un parámetro de Policy, no un número fijo — distintos tipos de KO pueden tener vidas medias distintas (una Signal decae en días, un Concept en meses).

### 4.3 Señales que reducen activación (más allá del decaimiento por tiempo)

Estas son reducciones por evento, no por reloj:

- **Initiative cerrada** — los KOs ligados a ella pierden su aporte estructural por esa vía (pero conservan otros aportes; un Concept usado en una Initiative cerrada sigue caliente si tiene respaldo humano).
- **Intent archivado** — análogo.
- **Solo relaciones débiles** — un KO conectado únicamente por aristas débiles (similitud) no acumula componente estructural; su activación es puramente volátil y se enfría rápido. Esto es deliberado: lo que solo está "vagamente relacionado" no merece estar caliente.
- **confidence_level bajo** — conocimiento poco respaldado o tentativo recibe un multiplicador reductor. No se confía en lo que no está respaldado.
- **superado_por otro KO** — un KO con arista `superado_por` entrante (is_deprecated) recibe penalización fuerte; ya no es la referencia. No se borra (valor histórico), pero se enfría agresivamente.
- **Feedback negativo** (Event de Feedback `kind: correction|rejection|error` que lo toca) — penalización proporcional a la severidad. Reutiliza el loop de RFC-001.1, sin maquinaria nueva.
- **Duplicación detectada** — un KO marcado como duplicado de otro pierde activación a favor del canónico (refuerza is_canonical).

### 4.4 El decaimiento nunca cruza el piso de importancia

Punto crítico que conecta con §7: por más que el componente volátil decaiga a cero y haya señales reductoras, **un KO con alto componente estructural de importancia (respaldo humano fuerte, posición fundacional) nunca cae por debajo de la banda REACTIVABLE.** El decaimiento puede enfriar, no puede sepultar lo importante. Esa es la red de seguridad contra el olvido de conocimiento profundo.

---

## 5. Scoring Model

### 5.1 Lógica conceptual (no fórmula final)

```
activation_score =
      VOLÁTIL:
        w1 · recency_access            (decae exp.)
      + w2 · recency_edit              (decae exp.)
      + w3 · recent_task_usage         (decae exp.)
      + w4 · recent_mentions           (decae exp.)

      ESTRUCTURAL (no decae por reloj):
      + w5 · active_initiative_link    (cae si Initiative cierra)
      + w6 · active_intent_link        (cae si Intent se archiva)
      + w7 · published_artifact_usage  (persistente)
      + w8 · human_endorsement         (la más fuerte y duradera)
      + w9 · strong_relation_centrality (con tope anti-popularidad)
      + w10 · unresolved_contradiction (bonus de tensión)
      + w11 · review_or_evergreen_flag

      MODULADORES (multiplicativos, no aditivos):
      × confidence_multiplier          (<1 si confidence bajo)
      × deprecation_multiplier         (<<1 si superado_por)

      PISO:
      max( score , importance_floor )   (importancia nunca se sepulta)
```

### 5.2 Por qué aditivo + moduladores multiplicativos + piso

- **Suma de señales** para los aportes positivos: cada señal contribuye independientemente; un KO puede estar caliente por muchas razones distintas.
- **Moduladores multiplicativos** para confidence y deprecation: no son "una señal más", son *atenuadores de todo lo demás*. Un KO con confidence muy bajo no merece estar caliente aunque tenga muchas señales positivas — multiplicar captura eso mejor que restar.
- **Piso por máximo** para importancia: es la red de seguridad; garantiza matemáticamente que lo importante no se sepulte, sin importar cuánto decaiga el resto.

### 5.3 Pesos conceptuales y por qué

No fijo números finales (eso se calibra con métricas, §9), pero sí el *orden de magnitud relativo* y la justificación:

- **w8 (respaldo humano) es el peso mayor.** Lo que el operador garantizó como verdadero es la señal de máxima confianza del sistema. Debe dominar.
- **w5, w6 (Initiative/Intent activos) son altos.** Conectan el conocimiento con el trabajo y el propósito presentes — es exactamente lo que un sistema con dirección debe priorizar.
- **w1–w4 (recencia) son medios y decaen.** Importan, pero son la señal más propensa a sesgo; no deben dominar (anti recency bias).
- **w9 (centralidad) es medio CON TOPE.** Un nodo muy conectado importa, pero sin tope produce popularity bias (lo conectado se vuelve más conectado). El tope evita la espiral.
- **w10 (contradicción) es un bonus deliberado, no neutral.** El sistema premia mantener visible la tensión no resuelta — anti confirmation bias por diseño.

Todos los pesos viven como **Policy (dato)**, recalibrables con la evidencia de §9 sin reescribir el modelo.

---

## 6. Recalculation Strategy

### 6.1 Las tres estrategias y sus problemas

- **Periódica (Task recurrente que recalcula todo):** simple, predecible. Problema: costosa a escala (recalcular 100k KOs constantemente) y siempre algo obsoleta entre corridas. Recalcular el volátil de todo el vault cada hora es desperdicio porque la mayoría está frío y seguirá frío.
- **Lazy / on-demand (calcular al pedir contexto):** siempre fresca, paga solo por lo que se usa. Problema: no puede responder preguntas globales ("¿qué conocimiento importante está frío?") sin recorrer todo, y repite cálculo si el mismo KO se pide muchas veces.
- **Híbrida:** combina ambas según el componente.

### 6.2 Decisión: HÍBRIDA, dividida por componente

La elección se justifica por la propia estructura de dos componentes (§3):

- **Componente ESTRUCTURAL → Task recurrente de baja frecuencia.** Es estable (cambia solo por eventos del grafo), así que recalcularlo seguido es desperdicio. Una Review Task lo recalcula periódicamente (p. ej. diaria o tras cambios significativos del grafo) y lo cachea como propiedad derivada. Además, los *eventos* que lo cambian (cerrar una Initiative, añadir respaldo) pueden disparar recálculo dirigido solo de los KOs afectados, no de todo.
- **Componente VOLÁTIL → lazy, en el momento del Context Engine.** Es barato de calcular (es función del tiempo desde el último uso, dato que ya existe) y debe ser siempre fresco porque cambia minuto a minuto. Se calcula al construir contexto, no antes.

`activation_en_T = estructural_cacheado + volátil_calculado_lazy(T)`

### 6.3 Por qué esto es lo correcto para Atlas

Respeta la propiedad de escala de RFC-001.1: el costo no depende del tamaño del vault. El estructural se recalcula dirigido por evento (solo lo que cambió) o en batch de baja frecuencia (barato porque es estable); el volátil se calcula solo para los KOs que el Context Engine realmente toca en una Task concreta. Nunca se recalcula activación de KOs que nadie va a usar. Y las preguntas globales de observabilidad (§9) corren como Review Tasks de baja frecuencia que sí recorren más ampliamente, pero son aceptablemente costosas porque son ocasionales.

---

## 7. Bias Prevention

Cada sesgo de la pregunta 7 con su mecanismo concreto. Esto no es prosa de buenas intenciones; cada uno es un elemento del scoring de §5.

| Sesgo | Mecanismo concreto en el modelo |
|---|---|
| **Recency bias** (solo lo nuevo) | Separación volátil/estructural (§3): la recencia (w1–w4) es solo una parte y decae; el respaldo y la importancia (w8, piso) no decaen. Lo profundo sobrevive al desuso. |
| **Popularity bias** (lo conectado se conecta más) | Tope en w9 (centralidad): la contribución por número de relaciones fuertes está acotada. Un nodo hiperconectado no monopoliza la activación. |
| **Confirmation bias** (solo lo que confirma) | Bonus de tensión w10: las contradicciones no resueltas (`contradice`) ganan activación, no la pierden. El sistema premia mantener visible lo que te incomoda. |
| **Overfitting al trabajo actual** | El aporte de Initiative activa (w5) decae *por evento* al cerrar la Initiative. Lo ligado solo al proyecto de hoy se enfría cuando el proyecto termina, en vez de contaminar el contexto futuro. |
| **Pérdida de conocimiento histórico** | Banda REACTIVABLE + piso de importancia (§4.4) + Review Task de reactivación proactiva (§8): el conocimiento de alto respaldo, aunque frío, se marca reactivable y un agente lo trae de vuelta proactivamente cuando es relevante a una Initiative nueva. |

El principio transversal anti-sesgo: **ninguna señal única puede dominar la activación.** La suma con pesos topados, los moduladores y el piso garantizan que ni la recencia, ni la popularidad, ni el trabajo actual secuestren el modelo. Y el bonus de tensión introduce deliberadamente una fuerza *contraria* al confort cognitivo.

---

## 8. Agent Usage

Cómo un Agent o Task consume `activation_score`. Regla transversal: **los agentes leen activación, no la escriben.** La activación sube como consecuencia del uso, nunca como acción directa de un agente (eso sería gameable y rompería la auditoría).

- **Pedir contexto:** una Task declara `requiere_contexto`; el Context Engine usa activación como el ordenador de prioridad dentro de su cascada (RFC-001.1 §9): tras el traversal del grafo fuerte, la "memoria activada" que inyecta es precisamente los KOs de alta activación ligados a las semillas. La activación es el ranking de la fase 2 de la cascada.
- **Priorizar lectura:** ante presupuesto de tokens limitado, el agente lee primero lo más activado. La activación es la función de prioridad del presupuesto.
- **Decidir qué revisar:** una Review Task selecciona KOs en banda REACTIVABLE (importantes pero fríos) o con `review_required`, y propone revisarlos. La activación dirige la atención de mantenimiento.
- **Decidir qué comprimir:** una Archiving Task selecciona KOs de activación persistentemente baja, sin respaldo, con Initiative cerrada → candidatos a comprimir a ARCHIVED. La activación es el disparador (gobernado por Policy, nunca automático sobre lo respaldado).
- **Sugerir relaciones:** un agente que ve dos KOs ambos recién activados por la misma Task puede proponer una arista fuerte entre ellos (con evidencia, RFC-001.1 §8.2). La co-activación es una hipótesis de relación.
- **Detectar conocimiento olvidado:** la banda REACTIVABLE *es* la respuesta a "¿qué sé que debería estar usando y no estoy?". Un agente la consulta contra la Initiative activa para traer conocimiento profundo relevante que se había enfriado.
- **Recuperar material para LinkedIn / trabajo:** para una Task de generación de contenido, el agente combina activación (qué está fresco en tu cabeza) con la banda REACTIVABLE (qué conocimiento profundo respaldado encaja con el tema) — produce posts anclados en lo que pensás ahora pero enriquecidos con tu conocimiento consolidado, no solo lo reciente.

---

## 9. Observability / Metrics

Las métricas no son apéndice: son cómo se detecta que la activación está mal calibrada antes de que dañe el sistema. Todas se calculan como Review Tasks de baja frecuencia bajo Policy.

| Métrica | Qué detecta | Señal de alarma |
|---|---|---|
| **% de conocimiento frío** | Salud general de la distribución | Demasiado caliente = no escala / no se poda. Demasiado frío = el sistema no se usa para razonar. |
| **Nodos activos sin uso real** | Activación inflada falsamente | KOs en banda ACTIVO que ninguna Task tocó recientemente → pesos volátiles mal calibrados o señal espuria. |
| **Nodos importantes pero fríos** | Pérdida de conocimiento profundo | KOs con alto respaldo en banda FRÍO (no REACTIVABLE) → el piso de importancia está fallando; recalibrar. |
| **Conocimiento archivado reactivado** | Tasa de error del archivado | Mucho ARCHIVED que vuelve a LIVING → se está comprimiendo demasiado agresivo; la activación enfría de más. |
| **Tasks que fallaron por contexto insuficiente** | El test más duro del modelo | Tasks que cayeron hasta "pedir aclaración" en la cascada porque la activación no trajo lo relevante → falso negativo de activación. Métrica de oro. |
| **Concepts is_evergreen sin revisión** | Mantenimiento incumplido | Evergreen que nadie revisó en N meses → el flag no está disparando Review Tasks. |
| **Intents activos sin conocimiento asociado** | Brecha propósito-conocimiento | Un Intent vivo con poca/ninguna activación a su alrededor → o el Intent está huérfano, o hay conocimiento relevante que la activación no está conectando. |

La métrica de cierre del loop: **"Tasks que fallaron por contexto insuficiente"** es la que valida todo el modelo. Si la activación funciona, esta métrica tiende a cero; si sube, la activación está dejando afuera conocimiento que las Tasks necesitaban, y los pesos (Policy) deben recalibrarse. Es el feedback objetivo que evita que el modelo se calibre por intuición.

---

## 10. Final Decisions

1. La activación es un **score derivado, acotado y reproducible**, no una entidad ni un campo-verdad. No se añade nada al Domain Model.
2. Tiene **dos componentes**: volátil (decae exponencial, configurable por Policy) y estructural (decae solo por evento). Esta separación es el núcleo del modelo.
3. **Scoring = suma de señales positivas × moduladores (confidence, deprecation) acotada por debajo por un piso de importancia.**
4. **El respaldo humano es el peso dominante**; la recencia es media y decae; la centralidad tiene tope; la contradicción no resuelta da bonus.
5. **Recálculo híbrido**: estructural por Review Task de baja frecuencia + recálculo dirigido por evento; volátil lazy en el Context Engine. El costo no depende del tamaño del vault.
6. **La activación informa, no decide, las transiciones del lifecycle.** Es señal de entrada a las Policies de promoción/compresión/reactivación, junto con respaldo, confidence y estado de Initiative.
7. **Banda REACTIVABLE** (frío pero estructuralmente importante) es el mecanismo explícito contra el olvido de conocimiento profundo.
8. **Cinco mecanismos anti-sesgo** integrados en el scoring, no añadidos aparte.
9. **Los agentes leen activación, nunca la escriben.** Sube por consecuencia del uso.
10. **Los pesos y umbrales viven como Policy (dato)**, recalibrables con las métricas de §9 sin tocar el modelo.

---

## 11. Open Questions

1. **Calibración inicial de pesos:** el modelo es estable pero los pesos arrancan sin datos. ¿Se siembran con valores razonables y se ajustan con las métricas, o se corre un período de "solo observación" antes de dejar que la activación gobierne transiciones? Recomendación tentativa: período de observación — la activación se calcula y se mide, pero no dispara compresión automática, hasta que las métricas de §9 muestren calibración sana.
2. **Vida media por tipo de KO:** se decidió que es configurable por Policy, pero no qué valores. ¿Una Signal y un Concept deben tener la misma curva de decaimiento volátil? Casi seguro no, pero los valores concretos requieren datos de uso real.
3. **Interacción activación ↔ compresión a gist:** cuando un KO se comprime a ARCHIVED, ¿su versión gist conserva activación propia, o la activación se recalcula sobre el gist? Afecta la reactivación. Probablemente el gist hereda el componente estructural y resetea el volátil, pero conviene validarlo en prototipo.
4. **Co-activación como señal de relación:** §8 propone que dos KOs co-activados por la misma Task son candidatos a relación. ¿Cuán fuerte es esa señal? Riesgo de generar ruido si se aplica agresivo. Necesita umbral empírico.
5. **¿La activación debe ser visible al humano en la interfaz?** Mostrar el score podría ayudar al operador a entender por qué el sistema le trae cierto contexto, pero también podría inducir gaming inconsciente. Decisión de fase 3 (representación física / UX).

---

*RFC-001.2 — Proyecto Atlas. Cierra la Open Question #1 de RFC-001.1. El modelo de activación queda definido a nivel conceptual e implementable. Con esto, el dominio está listo para avanzar a la fase 3 (representación física), pendiente solo de la calibración empírica (Open Questions #1–#2), que es trabajo de implementación, no de dominio.*
