---
# Policy — regla del sistema como dato legible por humano y agente (plano de ejecución).
id:        policy_01JZ000000000000000001
type:      policy
title:     "Creación de relaciones por agentes"
lifecycle: living
created:   2026-06-29T12:00:00Z
tags:      [policy, agents, safety]

# --- declarativo: lo que el motor de Policy aplica ---
subject:   agent
condition: "crea una relación fuerte"
effect:
  - allow:    [deriva_de, trata_sobre]
    requires: evidencia            # deriva_de obligatorio (falsabilidad, RFC-001.1 §8.2)
  - require_approval: [contradice, decide_sobre, se_apoya_en]
    approver: human

escrito_por: human
respaldado_por: human

derived:
  managed_by: atlas-context-engine
  cached: false
---

# Creación de relaciones por agentes

## Qué establece
Un agente puede **crear** relaciones fuertes de bajo riesgo (`deriva_de`, `trata_sobre`) sin
aprobación previa, **siempre que cite evidencia** (`deriva_de` obligatorio en la arista). Las
relaciones de alto riesgo (`contradice`, `decide_sobre`, `se_apoya_en`) requieren validación
humana (`validado_por: human`) antes de comitearse a `main`.

## Por qué existe
Si los agentes solo pudieran *proponer* (nunca crear), el grafo fuerte quedaría crónicamente
subpoblado y el sistema degradaría al grafo débil de embeddings — exactamente lo que Atlas no
quiere ser. Darles autoridad acotada + evidencia obligatoria puebla el grafo a ritmo sano sin
sacrificar la honestidad: una arista sin evidencia citable se rechaza en el origen.

## Riesgo que mitiga
Que un agente invente conexiones falsas. La evidencia obligatoria hace toda arista de agente
falsable; la aprobación humana protege las relaciones de mayor impacto de razonamiento.
