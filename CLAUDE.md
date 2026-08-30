# CLAUDE.md

Project context. It contains no tasks: instructions arrive through the conversation.

## What this is

Personal investment portfolio manager, single user, 20+ year horizon. It records transactions, computes the monthly contribution from target weights, tracks a separate speculative bucket, and prepares the data for the Spanish income tax return (Renta).

**It never executes orders.** Every trade is placed manually on the platform and recorded here.

User: Spanish tax resident. Planned integrations: MyInvestor (fund statements) and Interactive Brokers (Flex Query). Cash is recorded by hand.

## Documents

- `docs/specification.md` — full functional and technical specification. The reference.
- `docs/business-rules.md` — domain rules and Spanish tax mechanics the app implements.
- `plan-financiero.md` — the user's personal investment plan. **Private, git-ignored, never in the repo.** Docs reference it as "rule N of the plan" or "P1/P2/P3".
- `.specify/memory/constitution.md` — project constitution (Spec Kit). Principles every spec, plan and task must respect.
- `specs/NNN-<name>/` — per-feature Spec Kit artefacts (`spec.md`, `plan.md`, `tasks.md`, …).

## Spec-driven development (GitHub Spec Kit)

The project follows [GitHub Spec Kit](https://github.com/github/spec-kit). Scaffolding lives in `.specify/`; the skills are installed under `.claude/skills/speckit-*`.

- Flow per feature: `/speckit-specify` → `/speckit-clarify` (optional) → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`. `/speckit-constitution` amends the constitution; `/speckit-analyze` and `/speckit-checklist` are quality gates.
- `docs/specification.md` is the **product-level** specification (the whole system). Spec Kit specs are **feature-level** slices derived from it; when they conflict, update `docs/specification.md` and the constitution first.
- **Spec Kit does not create git branches** (feature state is tracked in the git-ignored `.specify/feature.json`). Branches follow git flow: one spec `specs/NNN-<name>/` ↔ one branch `feature/NNN-<name>` created by hand from `develop`.
- **Spec Kit artefacts (constitution, specs, plans, tasks) are documents: Spanish prose, English identifiers**, like everything under `docs/`. Templates under `.specify/templates/` stay untouched in English.
- `.specify/feature.json` and `.claude/settings.local.json` are git-ignored; everything else under `.specify/` and `.claude/skills/` is committed.

## Language

- **Everything technical is in English**: code, identifiers, comments, commit messages, branch names, file names, infrastructure, this file.
- **Documents under `docs/` are in Spanish** (prose). Identifiers, field names and code inside them stay in English.
- Conversation with the user is in Spanish.

## Portfolio nomenclature

Two books. They never mix in any calculation, view or metric.

| Book | Spanish name | Contents | Main metric |
|---|---|---|---|
| `core` | Cartera principal / núcleo | Four asset classes: `equity` (RV), `fixed_income` (RF), `gold`, `crypto` | Deviation from target weights |
| `bucket` | Cubo especulativo | Small, separate account for speculating, tinkering and learning. Rich tracking: theses, charts, comparisons against the index | Performance vs. index |

Target weights apply **across the whole core**. The bucket is a *budget* (a fixed share of the monthly contribution), never an allocation. Total net worth = core + bucket + cash held in the investment accounts, always shown broken down. Bank cash (the emergency cushion) is out of scope (ADR-0004).

## Stack

| Layer | Choice |
|---|---|
| Frontend | Static SPA with Vite (Svelte or Solid), served from S3 through CloudFront |
| Backend | Lambda with Function URL (no API Gateway) |
| Data | DynamoDB, provisioned capacity within the always-free tier |
| Auth | Cognito with MFA, single user. The Lambda validates the JWT |
| Scheduling | EventBridge Scheduler |
| Email | SES |
| Secrets | SSM Parameter Store standard tier (free), not Secrets Manager |
| Infrastructure | Terraform |
| Domain | Own subdomain (value lives in `terraform.tfvars`, outside the repo), CNAME to CloudFront, ACM certificate in us-east-1 |

**Cost constraint:** the project must stay inside the AWS always-free tier indefinitely. Before introducing a new service, verify it is free at this scale.

## Domain traps

Errors that go unnoticed for years. Details in `docs/business-rules.md`.

1. **A transfer between funds is NOT a sell followed by a buy.** It keeps the original acquisition date and cost. Modelling it as sell+buy silently breaks taxation.
2. **Lots, never aggregated positions.** The current position is a derived query, not a stored field. FIFO needs lot-level detail.
3. **Money in decimal, never floating point.** Fund units are fractional with many decimals.
4. **Always store the original amount, currency and the ECB exchange rate of the value date.** Converting to EUR and discarding the original loses information the tax agency requires.
5. **No tax calculation may depend on market prices.** Prices are informational. Taxation comes exclusively from the ledger.
6. **Corporate actions are first-class transactions** with their own lot-transformation logic. No manual patches on the database.
7. **The own ledger is the source of truth.** Broker statements are for reconciliation, not for feeding the system.

## Design principles

- **Every derived value must be recomputable** from the ledger.
- **Nothing hard-coded that should be configurable**: thresholds, target weights, frequencies, recipients.
- **Fail safe**: if a price source goes down, show the last known value with its age marked. Never interpolate or estimate silently.
- **Manual entry is never removed.** Automatic import is convenience; the system must be fully functional without any automatic source.
- **Compartmentalisation**: core and bucket never mix in calculations or metrics. The bucket appears in total net worth, never in the core's target-weight calculation.
- **20-year survival over technical elegance**: few dependencies, open formats, data exportable at any time.

## Code conventions

### Git

- **Git flow with plain git commands**: `main` (production), `develop` (integration), `feature/*`, `fix/*`, `release/*`, `hotfix/*`. Merges with `--no-ff`. The `git-flow` extension is not used.
- **Pull requests are mandatory.** No direct push to `main` or `develop`.
- **Conventional Commits**, brief, imperative, in English, subject line only whenever possible:
  - `feat(ledger): add fund transfer event`
  - `fix(fifo): fix lot ordering on equal dates`
  - `test(tax): cover the two-month rule`
- Atomic commits: one conceptual change per commit.
- **No AI tool may appear as co-author or be mentioned in commit messages, bodies, footers or PR descriptions.**
- Ask the user before installing tools, extensions or packages, and before committing or pushing.

### Environments

- `dev` (branch `develop`) and `prod` (branch `main`), with fully separate infrastructure stacks and a suffix on every resource.
- **Build once, promote.** The artefact deployed to production is the same one validated in dev.
- **Production data never in dev.** Synthetic data generator in the repository.

### Tests

Priority by damage if they fail:

1. FIFO engine and lot transformations per corporate action
2. Currency conversion by value date
3. Two-month rule
4. Monthly contribution split
5. Statement parsers (contract tests against anonymised sample files versioned in the repo)

Mandatory edge cases: several lots with the same date, fractions, reverse split with cash-in-lieu, repurchase exactly at the two-month boundary, partial transfer.

### Logging

| Level | Use |
|---|---|
| `ERROR` | Needs intervention: failed import, reconciliation mismatch |
| `WARN` | Degradation: price source down, stale price, threshold nearly hit |
| `INFO` | Business events: transaction recorded, contribution computed, email sent |
| `DEBUG` | Execution detail, disabled in production |

- Structured JSON logs with `request_id` to correlate across Lambdas.
- **Never log amounts, positions, balances or account identifiers.** CloudWatch is less protected than the database.
- Retention: 30 days in production, 7 in dev.

### Security

- **Never store broker credentials.** The only secret is the read-only IBKR Flex token, in SSM Parameter Store as a `SecureString`.
- Private S3, served only through CloudFront with Origin Access Control.
- Least-privilege IAM: one role per Lambda.
- **No third-party analytics, no external CDNs, no remote fonts.** Everything from the own origin. Strict CSP.
- Validation always on the backend. The frontend is convenience, not a security control.
- Committed lockfile, `npm audit` in CI, explicit dependency budget: every new package needs a justification.

### Infrastructure

- Terraform for every AWS resource. Nothing created by hand in the console.
- Remote state in S3 with locking.
- `terraform plan` on the PR, `apply` only after approval.

## Documentation

- ADRs in `docs/adr/` (status Propuesta / Aceptada / Reemplazada) for relevant architecture decisions.
- Data schema documented in the repository, including the lot-transformation logic for every corporate action type.
- Every recorded corporate action keeps its documentary source (issuer URL or PDF).

## Phases

Order matters: the Phase 1 data model must support Phase 5 from day one.

0. Validation (access, statement formats, scraping feasibility)
1. **Ledger** — data model, transaction entry, positions, FIFO, transfers, corporate actions
2. Monthly contribution — split, deviations, thresholds
3. Bucket — theses, open positions, metrics against the index, charts
4. Automation — scheduled Lambdas, emails, prices
5. Tax engine — consolidated FIFO, currency, two-month rule, aggregated output
