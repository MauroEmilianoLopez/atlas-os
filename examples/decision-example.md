---
# Decision Record — decisión con contexto, alternativas y consecuencias (capa 2).
id:        ko_01JZ000000000000000031
type:      decision
title:     "ADR-001 — Usar IDs estables en vez de paths como identidad"
lifecycle: living
created:   2026-06-29T12:00:00Z
tags:      [adr, architecture]

decide_sobre:
  - target_id: ko_01JZ000000000000000020   # Initiative: Atlas OS
    label: "Atlas OS"
se_apoya_en:
  - target_id: ko_01JZ000000000000000010   # Concept: context-engine
    label: "Context Engine"
deriva_de:
  - target_id: ko_01JZ000000000000000030   # Event: RFC-002 aprobado
    label: "RFC-002 aprobado"
escrito_por: human
respaldado_por: human
validado_por: human

derived:
  managed_by: atlas-context-engine
  cached: false
---

# ADR-001 — Usar IDs estables en vez de paths como identidad

## Contexto
El problema más caro de los vaults a 10 años es que renombrar archivos rompe los enlaces. Si las
relaciones del grafo apuntan a paths/filenames, cualquier renombrado corrompe el grafo.

## Decisión
La identidad de todo Knowledge Object es un campo `id` inmutable (ULID con prefijo legible). El
filename es solo una clave humana renombrable. Las relaciones fuertes apuntan por `target_id`.

## Alternativas consideradas
- **Wikilinks por filename como identidad** — rechazada: renombrar rompe el grafo.
- **Path como identidad** — rechazada: mover de carpeta rompe el grafo.

## Consecuencias
- (+) Renombrar/mover archivos no rompe nada. El Context Engine mantiene el mapeo id↔path.
- (+) El grafo es estable a 10 años.
- (−) El `id` no es legible de un vistazo; se necesita el `label` como cache humano.
- (−) Requiere un índice externo que resuelva id→path (responsabilidad del Context Engine).
