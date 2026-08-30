---
name: adr
description: Create a new Architecture Decision Record in docs/adr/ with the next number, from the template, and register it in the index. Use when the user asks for an ADR or when a significant, hard-to-reverse decision is taken.
argument-hint: "<title in Spanish> [--status Aceptada]"
---

## When an ADR is warranted

Only for decisions that are costly to reverse, affect several parts of the system, or that someone would ask "why?" about in two years. Routine choices go in the feature plan, not in an ADR.

## Steps

1. Run `python3 "$CLAUDE_PROJECT_DIR/.claude/skills/adr/new-adr.py" "<title>" [--slug english-slug] [--status Propuesta|Aceptada]`. It computes the next number, copies `docs/adr/template.md`, and appends the row to `docs/adr/README.md`. It prints the file path.
2. Fill every section in **Spanish prose with English identifiers** (see `CLAUDE.md` → Language): Contexto, Opciones consideradas (with ventajas / inconvenientes for each), Decisión, Consecuencias. Keep it to about half a page; link related ADRs as `ADR-NNNN`.
3. Status is `Propuesta` unless the user has already accepted the decision in the conversation; then `Aceptada`. If the decision depends on a tax criterion, add *verificar con asesor*.
4. If the ADR supersedes an earlier one, set the old one's status to `Reemplazada por NNNN` (both in the file and in the index) — never edit the old ADR's body.
5. If the decision closes an item in `docs/decision-roadmap.md` or `docs/specification.md` §14, update those too.
6. Do not commit or push unless the user asks.
