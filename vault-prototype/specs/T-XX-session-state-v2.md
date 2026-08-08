Actuá como implementador siguiendo Spec-Driven Development (SDD).

No tomes decisiones de diseño por tu cuenta.
Todo lo necesario para esta tarea está definido en esta spec.
Si encontrás una ambigüedad o algo no cubierto, frená y preguntame antes de asumir.
# Contexto

Atlas OS es un runtime de conocimiento personal.

Su filosofía es:

Vault → Core → Contexto → Modelo

Su objetivo es permitir continuar el trabajo con cualquier IA
(Claude, GPT, Gemini, Codex, DeepSeek local, etc.)
sin depender de la memoria del chat.

Este proyecto es para uso individual.

NO optimices para:

- múltiples usuarios
- concurrencia distribuida
- CI/CD
- infraestructura remota
- forks externos
- colaboración masiva

Esas necesidades no forman parte del alcance.

El Core ya está estabilizado.

Existen:

- atlas continue
- atlas session update

y ambos funcionan correctamente.

Esta tarea consiste únicamente en evolucionar Session State.

------------------------------------------------------------
PRIMER PASO OBLIGATORIO
------------------------------------------------------------

Antes de modificar cualquier archivo:

1. Crear la spec

vault-prototype/specs/T-XX-session-state-v2.md

copiando íntegramente este documento.

2. Mostrarme:

- dónde quedó creada
- git status

3. Esperar mi aprobación.

No modificar código todavía.

------------------------------------------------------------
DISEÑO
------------------------------------------------------------

## Estructura

vault-prototype/work/

    session-state.md

    .scratch/
        codex.md
        claude-code.md
        claude-web.md
        openclaw-deepseek.md
        ...

Agregar:

.scratch/

al .gitignore.

------------------------------------------------------------
SESSION STATE
------------------------------------------------------------

session-state.md tendrá exactamente DOS secciones.

============================================================
1. ESTADO ACTUAL
============================================================

Esta sección se REEMPLAZA COMPLETA en cada actualización.

Contiene únicamente:

- work unit
- branch
- objetivo actual
- estado
- completados
- pendientes
- próximo paso

No agregar otros campos.

============================================================
2. HISTORIAL DE DECISIONES
============================================================

Esta sección es APPEND ONLY.

Nunca modificar.

Nunca borrar entradas.

Cada nueva decisión se agrega al final.

Formato:

## YYYY-MM-DD HH:MM — <branch> — base <base_commit_corto>

decisión:
<una línea>

contexto:
<opcional>

Donde:

base_commit_corto

es el resultado de

git rev-parse --short HEAD

obtenido ANTES de crear el commit que cierra la work unit.

No intentar guardar el SHA del mismo commit.

------------------------------------------------------------
REGLA DE ACTUALIZACIÓN
------------------------------------------------------------

session-state.md

se actualiza únicamente

al cerrar una work unit.

Nunca durante el trabajo intermedio.

Toda información temporal pertenece al scratch.

## Estados de cierre

El checkpoint operativo únicamente puede actualizarse cuando el estado pertenece al conjunto:

- published
- cancelled
- abandoned

Cualquier otro estado debe rechazarse.

En particular:

- active
- draft
- ready_for_review

no representan cierre de una work unit y no pueden escribirse en session-state.md mediante atlas session update.

------------------------------------------------------------
REGLA DE CONFIANZA
------------------------------------------------------------

Antes de escribir session-state.md:

1.

Construir el contenido candidato completamente en memoria.

2.

Mostrarme el diff completo entre:

archivo actual

vs

contenido candidato

sin modificar todavía el archivo.

3.

Esperar mi aprobación explícita.

4.

Recién después escribir el archivo.

Nunca escribir session-state.md sin mi aprobación.

Nunca commitearlo sin mi aprobación.

------------------------------------------------------------
SCRATCH
------------------------------------------------------------

Cada agente mantiene su propio archivo.

Ejemplos:

.scratch/codex.md

.scratch/claude-code.md

.scratch/openclaw-deepseek.md

Formato libre.

Sin estructura obligatoria.

Nunca se commitea.

Nunca se comparte.

Es únicamente memoria efímera de la sesión.

------------------------------------------------------------
ATLAS CONTINUE
------------------------------------------------------------

Cambiar el comportamiento.

1.

Requerir

--agent <name>

como parámetro.

No implementar inferencia automática del agente en V2.

Validaciones mínimas para agent:

- string no vacío;
- no permitir separadores de ruta `/` o `\`;
- no permitir `..`.

Usar el valor únicamente para resolver:

work/.scratch/<agent>.md

2.

Leer

.scratch/<agent>.md

si existe.

3.

Leer

session-state.md

- bloque de estado

- exactamente las últimas 5 decisiones disponibles.

Si existen menos de 5, mostrar todas.

Seleccionar las últimas 5 y renderizarlas en orden cronológico ascendente dentro del subconjunto seleccionado.

4.

No implementar detección semántica automática de contradicciones entre scratch y session-state.md en V2.

Scratch es texto libre. Atlas no debe inferir contradicciones mediante heurísticas, regex complejas ni IA.

Atlas no debe preguntar automáticamente durante `continue`.

La detección y resolución de contradicciones queda fuera de alcance en V2 hasta que scratch tenga estructura comparable.

5.

Generar en este orden:

- Estado actual compartido.
- Scratch del agente, si existe y no está vacío.
- Últimas 5 decisiones.
- Contexto estructural existente.

Si scratch no existe o está vacío, omitir ese bloque sin error.

Si session-state.md falta o está corrupto, mantener el comportamiento tolerante actual y continuar con scratch y contexto estructural si están disponibles.

------------------------------------------------------------
ATLAS SESSION UPDATE
------------------------------------------------------------

Debe:

1.

Actualizar el bloque de estado.

2.

Preguntar si existe una decisión nueva.

No asumir que siempre existe.

3.

Si existe:

agregar una nueva entrada

append only

usando:

base_commit = git rev-parse --short HEAD

4.

Construir el contenido candidato en memoria.

5.

Mostrarme el diff completo.

6.

Esperar aprobación.

7.

Recién después escribir.

------------------------------------------------------------
MIGRACIÓN
------------------------------------------------------------

Migrar el session-state actual.

Reglas:

- el estado existente pasa al nuevo bloque de estado.

- cada elemento de last_decisions se convierte en una entrada inicial del historial.

- si no existen decisiones previas,
  el historial comienza vacío.

## Excepción de migración legacy

Las decisiones provenientes del formato anterior de Session State pueden no tener un
base_commit histórico recuperable.

Solo durante la migración inicial a Session State V2 se permite:

base legacy

en lugar de:

base <base_commit_corto>

Para cada entrada migrada, agregar en context:

Migrated from legacy Session State; first reachable Git evidence: <sha>.

Esta excepción aplica únicamente a entradas que ya existían antes de T-XX-session-state-v2.

Toda decisión nueva creada después de esta migración debe cumplir estrictamente el formato:

base <git rev-parse --short HEAD>

No se permite usar `legacy`, `unknown` ni valores equivalentes para decisiones nuevas.

Para las dos decisiones actuales, usá:

first reachable Git evidence: 0466056

y conservá su fecha y branch históricas existentes.

------------------------------------------------------------
NO IMPLEMENTAR
------------------------------------------------------------

No implementar:

- JSON
- schemas
- vault_id
- lineage_id
- locks
- TTL
- sincronización remota
- heurísticas
- resolución automática
- IA dentro de Atlas
- múltiples escritores
- mecanismos para equipos

Si durante la implementación parece hacer falta cualquiera de esas cosas:

DETENERSE

y preguntarme.

------------------------------------------------------------
WORK UNIT
------------------------------------------------------------

Toda esta spec constituye UNA única work unit.

Podés usar varios commits si resulta conveniente técnicamente.

Pero:

session-state.md

debe actualizarse UNA sola vez

cuando T-XX-session-state-v2 quede completamente terminada.

Nunca durante commits intermedios.

------------------------------------------------------------
ORDEN DE IMPLEMENTACIÓN
------------------------------------------------------------

1.

Actualizar .gitignore

2.

Migrar session-state.md

3.

Actualizar atlas continue

4.

Actualizar atlas session update

------------------------------------------------------------
RESTRICCIONES
------------------------------------------------------------

No tocar:

- Core
- Context
- Activation
- Index

Mantener TDD estricto.

Antes de cada unidad de trabajo:

explicar qué archivo vas a modificar y por qué.

Después de cada unidad:

ejecutar los tests relevantes.

Al finalizar:

ejecutar la suite completa.

No hagas commit sin mostrarme primero el diff correspondiente y esperar mi aprobación.
