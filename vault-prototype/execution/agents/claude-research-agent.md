---
# Agent — operador de IA (plano de ejecución). Identidad + permisos vía Task + reputación.
id:        agent_01JZ000000000000000001
type:      agent
title:     "Claude (research agent)"
lifecycle: living
created:   2026-06-29T12:00:00Z
tags:      [agent, research]

# Permisos BASE (los efectivos se acotan por Task vía Policy)
base_scope:
  leer:  [concept, insight, source, event, decision, initiative]
  crear: [concept, insight, deriva_de, trata_sobre]
  requiere_aprobacion: [contradice, decide_sobre]

# Reputación (placeholder en P0; la actualiza el feedback loop vía el Context Engine)
reputation:
  managed_by: atlas-context-engine
  cached: false

gobernado_por:
  - target_id: policy_01JZ000000000000000001   # agent-relation-creation
    label: "Creación de relaciones por agentes"
escrito_por: human
respaldado_por: human

derived:
  managed_by: atlas-context-engine
  cached: false
---

# Claude (research agent)

Agente de investigación y destilación. Lee fuentes y conocimiento, propone Concepts/Insights y
relaciones fuertes de bajo riesgo (con evidencia). Las relaciones de alto riesgo las propone para
validación humana. Opera bajo la policy [[agent-relation-creation]].
