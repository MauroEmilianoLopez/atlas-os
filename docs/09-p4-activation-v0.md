# P4 — Activation v0 (structural component)

La primera implementación del **Modelo de Activación** de RFC-001.2, y su conexión al Context
Engine. Calcula qué tan "importante estructuralmente" es cada Knowledge Object, y lo usa para
priorizar qué entra al contexto cuando hay presupuesto limitado.

---

## Qué hace P4

- Calcula el **componente estructural** de la activación para cada KO, desde el índice de P2.
- Asigna una de tres **bandas**: `ACTIVO`, `REACTIVABLE`, `FRIO` (RFC-001.2 §2.3).
- Cachea el resultado en `.atlas/cache/activation.json` (derivado, regenerable, no versionado).
- Comando `atlas:activation` que calcula, cachea y muestra el ranking.
- **Enchufa la activación al Context Engine**: con `--rank`, bajo presupuesto el traversal conserva
  los vecinos de mayor activación en vez del orden determinista por id.
- Los **pesos son datos** (`.atlas/activation-weights.json`, opcional), recalibrables sin tocar
  código (RFC-001.2 §5.3).

## Qué NO hace v0 (deliberadamente, y por qué)

- **No calcula el componente volátil** (recencia de acceso, uso reciente en Tasks, ediciones).
  Ese componente necesita señales de uso reales que todavía no existen: no hay runtime de Tasks
  registrando accesos. Inventar recencia sería falsa precisión. v0 es honesto: **solo estructural**.
- **No aplica decaimiento temporal** (es propio del volátil).
- **No dispara compresión ni archivado automático.** RFC-001.2 recomienda un período de "solo
  observación": calcular y medir la activación antes de dejar que gobierne transiciones destructivas.
  v0 respeta eso — la activación informa el ranking del contexto, nada más.

---

## El componente estructural

Se compone de señales que **no decaen por reloj** (solo por evento), todas legibles del índice hoy
(RFC-001.2 §3.2). Fórmula conceptual (los pesos por defecto están entre paréntesis; son datos):

```
structural =
    human_endorsement    (40)   # respaldado_por: human — la señal más fuerte y durable
  + human_validation     (15)   # validado_por: human
  + centrality × min(deg, cap)  # (6 por relación, cap 5) — con TOPE anti-popularidad
  + active_intent_link   (20)   # conectado a un Intent activo
  + active_initiative_link (12) # conectado a una Initiative activa
  + tension_bonus        (10)   # tiene un `contradice` sin resolver (anti confirmation bias)

  → normalizado a 0..100
  → PISO de importancia: si está endorsed/validated y quedó por debajo de 30, se sube a 30
    (lo estructuralmente importante nunca se sepulta)
```

### Las tres bandas
- **ACTIVO** (`score ≥ hot_threshold`, default 50): entra al contexto casi sin costo.
- **REACTIVABLE**: score bajo PERO estructuralmente importante (endorsed/validated). Frío pero
  "vale la pena traer de vuelta" — el mecanismo anti-olvido de conocimiento profundo.
- **FRIO**: bajo y sin importancia estructural. La mayoría del conocimiento sano vive acá.

---

## Mecanismos anti-sesgo implementados (RFC-001.2 §7)

| Sesgo | Mecanismo en v0 |
|---|---|
| Recency bias | No hay componente volátil dominando; la estructura (respaldo, importancia) manda. |
| Popularity bias | Tope en la centralidad (`centrality_cap`): un hub no monopoliza activación. |
| Confirmation bias | Bonus de tensión: un `contradice` sin resolver *sube* la activación. |
| Pérdida de conocimiento profundo | Piso de importancia + banda REACTIVABLE. |

(El "overfitting al trabajo actual" se ataca vía el aporte de Initiative activa, que en el modelo
completo decae al cerrarse la Initiative; en v0 se refleja como flag de lifecycle.)

---

## Cómo correr

```bash
npm run atlas:index         # la activación necesita el índice de P2
npm run atlas:activation    # calcula, cachea y muestra el ranking
npm run atlas:activation -- --band REACTIVABLE   # filtrar por banda
npm run atlas:activation -- --json               # resultado completo en JSON
```

Ejemplo de salida (vault de ejemplo):

```text
Atlas activation computed (structural component only).
Objects scored: 13
Bands — ACTIVO: 9  REACTIVABLE: 4  FRIO: 0
Cached: vault-prototype/.atlas/cache/activation.json

Ranking (structural_score):
   97  [ACTIVO     ] decision: ADR-001 — Usar IDs estables...
   84  [ACTIVO     ] initiative: Atlas OS
   82  [ACTIVO     ] concept: Context Engine
   ...
   40  [REACTIVABLE] actor: Nick Milo
   40  [REACTIVABLE] technology: Markdown
```

### Enchufado al Context Engine

```bash
# sin ranking: bajo presupuesto conserva vecinos por orden determinista (id)
npm run atlas:context -- context-engine --hops 1 --budget 3

# con ranking: bajo presupuesto conserva los vecinos de MAYOR activación
npm run atlas:context -- context-engine --hops 1 --budget 3 --rank
```

Con presupuesto 3 (semilla + 2), `--rank` conserva ADR-001 (97) y Atlas OS (84) y descarta los de
menor score; sin `--rank` conserva los que ordenan primero por id. Ese es el pago inmediato de P4:
bajo presión de presupuesto, el contexto guarda lo que importa, no lo arbitrario.

### Recalibrar pesos (opcional)
Crear `vault-prototype/.atlas/activation-weights.json` con las claves a sobrescribir; el resto usa
los defaults. Los pesos son datos, no código (RFC-001.2 §5.3).

---

## Cambio en P2 que P4 requirió

RFC-001.2 dice que el **respaldo humano** es la señal de activación más fuerte, pero P2 no la
capturaba: las relaciones escalares con valor `"human"` (p. ej. `respaldado_por: human`) se
descartaban, porque una arista no puede apuntar a un nodo inexistente "human" sin romper la
integridad del grafo. P4 corrigió esto en el indexer: ahora `objects.json` lleva dos flags
booleanos por KO — `endorsed_by_human` y `validated_by_human` — recuperados del frontmatter. Es la
forma correcta de registrar procedencia humana sin ensuciar el grafo con nodos falsos. (Este es un
ejemplo de por qué construir P4 destapó un hueco real de P2, no solo una conveniencia.)

---

## Limitaciones actuales

- Solo componente estructural; sin volátil, sin decaimiento (ver arriba).
- Sin período de observación formalizado: v0 no archiva nada, pero tampoco tiene aún las métricas
  de salud de RFC-001.2 §9 (conocimiento importante-pero-frío, etc.) como comando. Trabajo futuro.
- El aporte de Initiative activa no decae por evento todavía (no hay cierre de Initiative modelado
  en runtime); se aproxima con el lifecycle actual.
- El ranking en el contexto usa el `structural_score` tal cual; cuando exista el volátil, el
  ranking usará la activación total.

---

## Tests

```bash
npm test     # 56 tests (P1: 20, P2: 13, P3: 14, P4: +9)
```

Cobertura P4 (activation.test.ts + 1 en context.test.ts): componente declarado estructural, el
respaldo humano domina, piso de importancia, tope de centralidad, bonus de tensión, link a Intent
activo, asignación de bandas, determinismo; y que el Context Engine conserva los vecinos de mayor
activación bajo presupuesto cuando se le pasa el ranking.
