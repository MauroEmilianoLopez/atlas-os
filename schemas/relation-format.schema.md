# Schema — Typed Relation Format

Cómo se representan las relaciones FUERTES (de razonamiento) en Atlas.

Referencia de dominio: RFC-001.1 §3 (ontología), RFC-002 §6 (typed relations).
Decisión P0: las relaciones fuertes apuntan por `target_id`, NUNCA por path/filename.

---

## Principio

- Relaciones FUERTES  → arrays YAML tipados en el frontmatter. Fuente de verdad del grafo.
- Relaciones DÉBILES  → wikilinks `[[...]]` en el cuerpo Markdown. Navegación / descubrimiento.

Un wikilink no tiene tipo ni dirección semántica; por eso no sirve como arista fuerte.

---

## Forma de una relación fuerte

Cada relación es una clave (el verbo) cuyo valor es una lista de objetos:

```yaml
se_apoya_en:
  - target_id: ko_01JZ000000000000000002   # REQUERIDO: a qué KO apunta (su id inmutable)
    label: "Backpressure"                   # opcional: etiqueta legible para humanos (cache del title)
    deriva_de:                              # opcional: evidencia que justifica esta arista (falsabilidad)
      - ko_01JZ000000000000000003
    escrito_por: agent_01JZ000000000000000001  # opcional: quién afirmó la arista (procedencia)
    respaldado_por: human                   # opcional: quién garantiza su veracidad
```

### Forma corta (relaciones simples, sin procedencia)

Cuando una relación la afirmó el humano y no necesita evidencia inline:

```yaml
trata_sobre:
  - target_id: ko_01JZ000000000000000010
    label: "Context Engine"
```

---

## Reglas de procedencia (RFC-001.1 §8.2 — falsabilidad)

- Toda arista fuerte creada por un AGENTE **debe** incluir `deriva_de` (evidencia) o se rechaza.
- `escrito_por`  = quién creó la arista (autoría).
- `respaldado_por` = quién garantiza que es verdad (confianza). Puede ser `human` o un agent_id.
- Aristas de alto riesgo (`contradice`, `decide_sobre`, `se_apoya_en`) creadas por agente
  requieren `validado_por: human` según la policy `agent-relation-creation`.

---

## Verbos disponibles

### Core (uso diario — 8)
deriva_de · se_apoya_en · contradice · trata_sobre · decide_sobre · avanza · escrito_por · respaldado_por

### Extendidas (cuando hacen falta)
generaliza · es_caso_de · compone · es_parte_de · agrupa · pertenece_a · refina · ejemplifica ·
superado_por · atribuido_a · validado_por · destila_a · usa · aplica · produce · expresa ·
precede · causa · ejecutado_por · requiere_contexto · produjo · corrige · gobierna

---

## Por qué `target_id` y no wikilink

Renombrar un archivo NO debe romper el grafo. El `target_id` es estable; el filename cambia.
El Context Engine mantiene el mapeo id↔path. El `label` es un cache legible, puede quedar
desactualizado sin consecuencia (la verdad es el id).
