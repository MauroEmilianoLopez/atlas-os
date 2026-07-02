---
# Map of Content (MOC) — nodo de gobernanza/navegación. Cruza capas por diseño.
id:        ko_01JZ0000000000000000M1
type:      map
title:     "Atlas — Arquitectura (MOC)"
lifecycle: living
created:   2026-06-29T12:00:00Z
tags:      [moc, atlas]

agrupa:
  - target_id: ko_01JZ000000000000000010   # Concept: context-engine
    label: "Context Engine"
  - target_id: ko_01JZ000000000000000011   # Insight: context-is-not-memory
    label: "Context is not memory"
  - target_id: ko_01JZ000000000000000031   # Decision: ADR-001
    label: "IDs over paths"
escrito_por: human
respaldado_por: human

derived:
  managed_by: atlas-context-engine
  cached: false
---

# Atlas — Arquitectura (MOC)

Punto de entrada de navegación a la arquitectura de Atlas. Las MOCs son nodos de gobernanza:
concentran conectividad deliberada y son lo que un agente consulta primero para una visión
general antes de bucear en nodos individuales.

## Núcleo
- [[context-engine]] — cómo un agente obtiene contexto mínimo.
- [[context-is-not-memory]] — el insight del que nació.

## Decisiones
- [[adr-001-use-ids-over-paths]] — identidad por id, no por path.
