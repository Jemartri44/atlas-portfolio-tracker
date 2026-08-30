## What

<!-- One paragraph: what changes and why. Link the spec (`specs/NNN-…`) or ADR when relevant. -->

## Constitution checklist

- [ ] **Ledger is the source of truth**: no derived value is stored that cannot be recomputed; no manual patch on data.
- [ ] **Lots & tax**: transfers keep acquisition date/cost; no tax calculation depends on market prices; amounts are decimals serialised as strings.
- [ ] **Compartmentalisation**: core and bucket never mix in a calculation, view or metric.
- [ ] **Configurable**: no threshold, weight, frequency or tax rate hard-coded.
- [ ] **Fail safe**: degraded sources show stale data with its age; nothing is estimated silently.
- [ ] **Dependencies**: any new package is justified here and added to `docs/dependencies.md`.
- [ ] **Tests**: `packages/domain` keeps 100% line and branch coverage; parsers have contract fixtures; tax edge cases covered.
- [ ] **Privacy**: no real amounts, account identifiers, domain or personal data in code, fixtures, logs or this PR.
- [ ] **Docs**: `docs/specification.md`, `docs/data-schema.md`, `docs/business-rules.md` or an ADR updated if behaviour or decisions changed.
- [ ] **Commits**: Conventional Commits, English, atomic, no AI attribution.
