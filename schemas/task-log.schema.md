# Schema — Task / Execution Log

Cómo se registran las Tasks. Decisión: log append-only estructurado, NO un archivo por Task.

Referencia de dominio: RFC-001.1 §4 (Task/Execution), RFC-002 §8.

---

## Principio

- La mayoría de las Tasks → entradas en un log append-only, particionado por mes
  (ej. `execution/tasks/2026-06-task-log.md`).
- Solo las Tasks que producen un Artifact o Decision Record dejan un archivo referenciable
  (el Artifact/Decision ya ES un archivo; la Task se cita por su id de log vía `produjo`).
- El log es la fuente de auditoría. Es append-only: nunca se edita una entrada pasada
  (amigable con Git: solo añade líneas, sin conflictos de merge).

---

## Forma de una entrada de log

Cada Task es un bloque YAML dentro del archivo de log mensual, separado por `---`.
Campos según RFC-001.1 §4.2 (anatomía de Task/Execution):

```yaml
- id:            task_01JZ000000000000000001
  intent:        "Destilar las Signals de ayer a Concepts"   # qué se buscaba
  ejecutado_por: agent_01JZ000000000000000001                # qué Agent (o 'human')
  estado:        committed     # pending|contextualizing|executing|proposing|committed|rejected|failed
  created:       2026-06-29T09:00:00Z
  finished:      2026-06-29T09:02:00Z

  requiere_contexto:           # qué pidió al Context Engine (referencias, no contenido)
    - ko_01JZ000000000000000020
  contexto_entregado:          # qué recibió (referencias) — clave para auditar alucinaciones
    - ko_01JZ000000000000000020
    - ko_01JZ000000000000000021

  permisos_temporales:         # scope acotado de ESTA ejecución (mínimo privilegio por Task)
    leer:   [concept, insight, signal]
    crear:  [concept, deriva_de, trata_sobre]
    requiere_aprobacion: [contradice, decide_sobre]

  outputs:                     # qué produjo
    - produjo: ko_01JZ000000000000000030
  cambios_propuestos: 3
  cambios_aplicados:  2        # la diferencia con propuestos es auditable
  feedback:                    # corrección/rechazo si hubo (Event de Feedback)
    - corrige: ko_01JZ000000000000000031
      kind: rejection
  costo:                       # observabilidad
    tokens: 4200
```

---

## Reglas

1. Append-only. Una entrada existente nunca se modifica; las correcciones son nuevas entradas
   o Events de Feedback que apuntan a la Task original.
2. `contexto_entregado` se guarda como REFERENCIAS (ids), no como copia del contenido
   (evita inflar el log y duplicar conocimiento — RFC-002 §8.3).
3. El log se particiona por mes para mantener archivos manejables.
4. Toda arista/nodo que la Task creó lleva su `escrito_por` = el agent, trazable a este `task_id`.
