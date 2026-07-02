# Schema — Common Frontmatter

Todo Knowledge Object (KO) de Atlas comparte un frontmatter base. Este schema describe los
campos comunes, su clase y su dueño. No es un JSON Schema formal todavía (eso vendrá con el
Context Engine); es el contrato legible que humanos y agentes deben respetar.

Referencia de dominio: RFC-002 §5 (YAML Standard).

---

## Clases de campo

Cada campo pertenece a UNA clase, que define quién puede escribirlo:

- **required**     — todo KO lo tiene. Se fija al crear.
- **human**        — opcional, lo gestiona el humano.
- **relations**    — relaciones tipadas (ver relation-format.schema.md). Humano o agente, con procedencia.
- **derived**      — calculado por el Context Engine. NUNCA se edita a mano. En P0 es un placeholder.

---

## Campos comunes

```yaml
# --- required ---
id:         ko_01JZ000000000000000000   # ULID con prefijo legible. INMUTABLE. Es la identidad real.
type:       concept                       # concept|insight|initiative|event|decision|source|artifact|
                                          # actor|technology|intent|prompt|agent|policy
title:      "Título legible"              # idioma/acentos libres. El filename es un slug aparte.
lifecycle:  living                        # fleeting | living | archived  (único estado real, RFC-001.1)
created:    2026-06-29T12:00:00Z          # ISO 8601 UTC. Inmutable.

# --- human (opcional) ---
updated:    2026-06-29T12:00:00Z          # última edición
aliases:    ["Motor de Contexto"]         # nombres alternativos para wikilinks
tags:       [architecture, ai]            # clasificación transversal ligera, NO jerárquica

# --- relations (ver relation-format.schema.md) ---
# Relaciones core: deriva_de, se_apoya_en, contradice, trata_sobre,
#                  decide_sobre, avanza, escrito_por, respaldado_por
# (las extendidas se usan igual, solo cuando hacen falta)

# --- derived (placeholder en P0; el Context Engine lo gestiona) ---
derived:
  managed_by: atlas-context-engine
  cached: false
  # En el futuro aquí vivirán (cacheados, solo-lectura):
  #   activation_score, confidence_level, is_connected,
  #   is_canonical, is_deprecated, is_evergreen, review_required
```

---

## Reglas

1. `id` es la identidad. El filename es solo una clave humana renombrable (RFC-002 §4).
2. El humano nunca escribe nada bajo `derived:`.
3. `lifecycle` es el único estado. Todo lo demás (connected, canonical, etc.) es derivado.
4. Las relaciones fuertes van en YAML (relation-format.schema.md), no como wikilinks.
5. Los wikilinks `[[...]]` en el cuerpo son navegación humana / relaciones débiles, no fuente de verdad.
