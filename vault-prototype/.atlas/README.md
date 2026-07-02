# .atlas/

Frontera física entre lo que el humano edita y lo que el sistema genera (RFC-002 §3.2, §11.3).

- `index/` — índice de grafo + mapeo id↔path. Generado por el Context Engine. **Ignorado por Git** (regenerable).
- `cache/` — propiedades derivadas (activation_score, etc.). **Ignorado por Git** (regenerable).

Este README sí se versiona (documenta la carpeta); su contenido generado no.
