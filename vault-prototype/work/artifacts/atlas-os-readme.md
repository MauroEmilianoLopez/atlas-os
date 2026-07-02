---
# Artifact — output expresado al mundo (capa 2). Cierra el knowledge lifecycle.
id:        ko_01JZ000000000000000070
type:      artifact
title:     "README de atlas-os"
lifecycle: living
created:   2026-06-29T12:00:00Z
publication_status: internal   # draft | internal | published
tags:      [doc, atlas]

expresa:
  - target_id: ko_01JZ000000000000000010   # Concept: context-engine
    label: "Context Engine"
  - target_id: ko_01JZ000000000000000031   # Decision: ADR-001
    label: "IDs over paths"
producido_por:
  - target_id: task_01JZ000000000000000001  # la Task que lo produjo (log)
    label: "P0 repo scaffold"
escrito_por: human
respaldado_por: human

derived:
  managed_by: atlas-context-engine
  cached: false
---

# README de atlas-os

Artifact que documenta el repositorio del prototipo P0. El contenido vive en `/README.md`;
este KO lo representa dentro del grafo para poder relacionarlo (qué Concepts expresa, qué Task
lo produjo) y rastrear su estado de publicación.
