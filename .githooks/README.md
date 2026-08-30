# Git hooks

Versioned hooks, enabled per clone with:

```bash
git config core.hooksPath .githooks
```

| Hook | What it does |
|---|---|
| `commit-msg` | Rejects messages that are not Conventional Commits (English, <= 72 chars) or that mention an AI tool |
| `pre-commit` | Runs `gitleaks` on the staged changes (warns if not installed) |

The same message rules are enforced for the coding assistant through `.claude/settings.json` → `.claude/hooks/check-git-commit.py`.
