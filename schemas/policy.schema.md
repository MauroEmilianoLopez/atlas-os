# Schema — Policy

Las Policies son reglas del sistema escritas como datos legibles por humanos Y agentes.
Un agente lee las policies que lo gobiernan ANTES de actuar.

Referencia de dominio: RFC-001.1 §6 (Policy Model), RFC-002 §9.

---

## Principio

- Una Policy = un archivo Markdown en `execution/policies/`.
- Frontmatter declarativo (lo que el motor de Policy parsea) + cuerpo en prosa (el porqué).
- Pocas, versionadas. El cuerpo legible es lo que las mantiene mantenibles a 10 años.

---

## Forma

```yaml
id:       policy_01JZ000000000000000001
type:     policy
title:    "Creación de relaciones por agentes"
lifecycle: living
created:  2026-06-29T12:00:00Z

# --- declarativo: lo que el motor aplica ---
subject:   agent            # a qué/quién aplica: agent | task | <tipo de KO>
condition: "crea relación fuerte"
effect:                     # uno o más efectos
  - allow:           [deriva_de, trata_sobre]
    requires:        evidencia      # deriva_de obligatorio (falsabilidad)
  - require_approval: [contradice, decide_sobre, se_apoya_en]
    approver:        human
```

Cuerpo Markdown: la justificación legible — qué riesgo mitiga, por qué existe.

---

## Tipos de Policy (RFC-001.1 §6.3)

- permission         — qué puede leer/escribir un agente o task
- approval           — qué requiere human-in-the-loop
- expiry             — qué caduca y cuándo
- auto-promotion     — qué conocimiento se promueve sin aprobación
- relation-creation  — qué aristas puede crear un agente sin aprobación
- visibility/isolation — qué no puede leer cierto agente (defensa anti-trifecta-letal)

---

## Reglas

1. El frontmatter declarativo es la regla aplicable; la prosa es obligatoria (el porqué).
2. Una Policy `gobierna` (relación) a un Agent / tipo de Task / tipo de KO.
3. Cambiar una regla = editar la Policy, no el código ni el RFC.
