---
# Insight — conclusión propia, situada (capa 4). Puede destilar a un Concept.
id:        ko_01JZ000000000000000011
type:      insight
title:     "El contexto se construye, no se lee"
lifecycle: living
created:   2026-06-29T12:00:00Z
tags:      [ai, retrieval, design]

deriva_de:
  - target_id: ko_01JZ000000000000000040   # Source: RFC-002
    label: "RFC-002 Physical Representation"
destila_a:
  - target_id: ko_01JZ000000000000000010   # Concept: context-engine
    label: "Context Engine"
escrito_por: human
respaldado_por: human

derived:
  managed_by: atlas-context-engine
  cached: false
---

# El contexto se construye, no se lee

Diseñando Atlas quedó claro que un agente que lee el vault completo es inviable (costo, latencia,
ruido) y peligroso (la ventana saturada de irrelevancia degrada el razonamiento).

El error conceptual es tratar "memoria" y "contexto" como lo mismo. La memoria es todo lo que el
sistema sabe; el contexto es el subconjunto mínimo relevante para una tarea concreta, ensamblado
en el momento. Memoria es el almacén; contexto es la atención.

Este aprendizaje, generalizado, se convirtió en el Concept [[context-engine]].
