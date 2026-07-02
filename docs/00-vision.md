# Atlas OS — Visión

## Qué es
Atlas es un **Knowledge Operating System AI-first**: un sistema operativo de conocimiento, no
una app de notas ni un "segundo cerebro". Está pensado para durar más de 10 años y ser operado
simultáneamente por un humano, múltiples agentes de IA, y sistemas futuros que todavía no existen.

## Qué problema resuelve
Los sistemas de notas se pudren a escala: el conocimiento se acumula sin integrarse (cementerio de
notas), la organización manual colapsa a las ~1.000 notas, y los agentes de IA no pueden razonar
sobre conocimiento que no declara explícitamente sus relaciones. Atlas separa el **dominio**
(estable, durable) de la **herramienta** (intercambiable), y trata el conocimiento como un grafo
de relaciones tipadas sobre el que humano y agentes razonan, no como un montón de archivos.

## Qué NO es
- No es un vault de Obsidian. Obsidian es solo la primera interfaz humana.
- No es un sistema PKM más. Tiene un plano de ejecución (Tasks), no solo almacenamiento.
- No es un producto. Es una arquitectura + su representación física.

## Los principios no negociables
AI-first · Local-first · Markdown-first · Entity-first · Human-readable · Machine-readable ·
Evolutivo · Modular · Observable · Automatizable · Tool-independent.

## Las tres capas conceptuales del proyecto
1. **Dominio** (RFC-001.x) — qué entidades existen, cómo se relacionan, cómo viven, cómo se ejecutan.
2. **Representación física** (RFC-002) — cómo eso se materializa en Markdown/YAML/Git.
3. **Implementación** (futuro) — el Context Engine / MCP server / agentes que operan sobre lo anterior.

Este repo es el **P0**: el prototipo documental + estructural mínimo que valida la capa 2.
