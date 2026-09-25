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

1. **`gitleaks git --staged --redact --verbose`** with the default rules plus `.gitleaks.toml` (picked up from the repository root); each finding shows its file, line and rule, with the secret redacted. The project rule `atlas-console-device-token` matches the console device token `atlasdt1.<token_id>.<secret>` (ADR-0033, `docs/api.md` §2.1); a `token_id` alone is public and is allowed.
2. **`biome check`** (the rules of `npm run lint`) on every staged file (added, copied, modified or renamed), using `node_modules/.bin/biome`. Biome decides what it handles, exactly as in `npm run lint`: file types it does not know and paths excluded by `biome.json` are skipped silently, so a Markdown-only commit passes. With nothing staged, Biome does not run. Biome reads the working copy: if a staged file also has unstaged edits, the hook says so and checks that copy.

On failure: `npm run format` applies the formatting and safe lint fixes (then `git add` them); `npm run lint` checks the whole repository; other lint errors are fixed by hand.

A missing tool warns and does not block: `gitleaks` not installed, Biome not installed because `npm ci` was not run, or a Biome that does not start (`biome --version` fails: no `node` on the `PATH`, as when nvm is not loaded in a GUI client, or `node_modules` installed from another platform).

Emergency only: `git commit --no-verify` skips both checks. CI still runs `npm run lint`.

The same message rules are enforced for the coding assistant through `.claude/settings.json` → `.claude/hooks/check-git-commit.py`.
