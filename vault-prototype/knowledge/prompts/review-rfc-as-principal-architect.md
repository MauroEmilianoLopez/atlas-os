---
# Prompt — procedimiento de IA reutilizable y versionado (capa 4, conocimiento operativo)
id:        ko_01JZ000000000000000060
type:      prompt
title:     "Revisar un RFC como Principal Architect"
lifecycle: living
created:   2026-06-29T12:00:00Z
version:   1
tags:      [prompt, review, architecture]

opera_con:
  - target_id: ko_01JZ000000000000000040   # Source: RFC-002 (tipo de input sobre el que opera)
    label: "RFCs de Atlas"
escrito_por: human
respaldado_por: human

derived:
  managed_by: atlas-context-engine
  cached: false
---

# Revisar un RFC como Principal Architect

## Cuándo usarlo
Cuando hay un RFC que necesita una review adversarial honesta antes de aprobarse.

## El prompt
> Actuá como Principal Architect / Staff Engineer. Tu tarea NO es mejorar el documento.
> Tu tarea es intentar romperlo: detectar debilidades conceptuales, sobreingeniería,
> entidades mal modeladas, acoplamientos ocultos y deuda arquitectónica temprana.
> Entregá: Executive Summary, Critical Issues (problema/por qué importa/impacto/recomendación),
> Major/Minor Concerns, y un veredicto: aprobado / con cambios menores / con cambios mayores / rechazado.
> No seas amable.

## Tasks donde funcionó
- Review de RFC-001 → produjo "aprobado con cambios mayores" y los 13 cambios de RFC-001.1.
