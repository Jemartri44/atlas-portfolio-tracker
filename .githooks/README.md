# Git hooks

Versioned hooks, enabled per clone with:

```bash
git config core.hooksPath .githooks
```

| Hook | What it does |
|---|---|
| `commit-msg` | Rejects messages that are not Conventional Commits (English, <= 72 chars) or that mention an AI tool |
| `pre-commit` | Runs `gitleaks` on the staged changes and Biome on the staged files it handles; either failure aborts the commit |

## `pre-commit`

1. **`gitleaks git --staged`** with the default rules plus `.gitleaks.toml` (picked up from the repository root). The project rule `atlas-console-device-token` matches the console device token `atlasdt1.<token_id>.<secret>` (ADR-0033, `docs/api.md` §2.1); a `token_id` alone is public and is allowed.
2. **`biome check`** (the rules of `npm run lint`) on the staged `.js/.jsx/.mjs/.cjs/.ts/.tsx/.mts/.cts/.json/.jsonc/.css/.html/.graphql/.gql` files, using `node_modules/.bin/biome`. With none staged (e.g. a Markdown-only commit), Biome does not run. Biome reads the working copy: if a staged file also has unstaged edits, the hook says so and checks that copy.

On failure: `npm run format` applies the formatting and safe lint fixes (then `git add` them); `npm run lint` checks the whole repository; other lint errors are fixed by hand.

A missing tool warns and does not block: `gitleaks` not installed, or Biome not installed because `npm ci` was not run.

Emergency only: `git commit --no-verify` skips both checks. CI still runs `npm run lint`.

The same message rules are enforced for the coding assistant through `.claude/settings.json` → `.claude/hooks/check-git-commit.py`.
