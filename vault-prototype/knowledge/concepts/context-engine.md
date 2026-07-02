---
# Concept — idea atómica, atemporal, transferible (capa 4, conocimiento destilado)
id:        ko_01JZ000000000000000010
type:      concept
title:     "Context Engine"
lifecycle: living
created:   2026-06-29T12:00:00Z
aliases:   ["Motor de Contexto"]
tags:      [architecture, ai, retrieval]

# Relaciones fuertes (fuente de verdad del grafo). Apuntan por target_id.
se_apoya_en:
  - target_id: ko_01JZ000000000000000011   # Insight: context-is-not-memory
    label: "Context is not memory"
trata_sobre:
  - target_id: ko_01JZ000000000000000020   # Initiative: 2026-atlas-os
    label: "Atlas OS"
escrito_por: agent_01JZ000000000000000001
respaldado_por: human

derived:
  managed_by: atlas-context-engine
  cached: false
---

# Context Engine

Componente que, dada una **intención de tarea**, ensambla el subgrafo mínimo suficiente para
resolverla. Nunca lee el vault completo: traversa localmente desde unas semillas y expande solo
lo necesario, bajo un presupuesto medido en tokens.

La metáfora correcta no es "buscar en una biblioteca" sino el **sistema de atención del cerebro**:
dado un foco, traer a la conciencia activa solo lo relevante y suprimir el resto.

## Cascada de degradación

1. Grafo fuerte (traversal de relaciones tipadas)
2. Memoria activada (lo "caliente", ligado a Initiatives/Intents activos)
3. Búsqueda semántica (embeddings — grafo débil)
4. Búsqueda textual
5. Pedir aclaración

## Por qué escala

El costo depende del subgrafo relevante, no del tamaño del vault. Un vault de 100k notas y uno
de 1k producen contextos de tamaño similar para la misma tarea. Ver también [[context-is-not-memory]].
