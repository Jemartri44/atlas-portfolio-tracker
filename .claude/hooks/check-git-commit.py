#!/usr/bin/env python3
"""PreToolUse hook: validate `git commit -m` messages issued by the assistant.

Reads the tool call JSON on stdin. Exit 2 blocks the call and returns stderr
to the assistant; exit 0 allows it. Uses the same rules as .githooks.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if payload.get("tool_name") != "Bash":
    sys.exit(0)

command = (payload.get("tool_input") or {}).get("command", "")
if not re.search(r"\bgit\s+commit\b", command):
    sys.exit(0)

# Collect every -m/--message argument (double-quoted, single-quoted or bare).
messages = []
for m in re.finditer(r"(?:-m|--message)(?:=|\s+)(?:\"((?:[^\"\\]|\\.)*)\"|'([^']*)'|(\S+))", command):
    messages.append(next(g for g in m.groups() if g is not None))

# Heredoc bodies: -m "$(cat <<'EOF' ... EOF)"
for m in re.finditer(r"<<'?EOF'?\n(.*?)\nEOF", command, re.S):
    messages.append(m.group(1))

if not messages:
    # --amend --no-edit, -F, or interactive: nothing to validate here.
    sys.exit(0)

if len(messages) > 1:
    print("commit hook: use a single subject line (one -m); bodies only when strictly necessary", file=sys.stderr)
    sys.exit(2)

root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
validator = os.path.join(root, ".githooks", "lib", "validate-commit-message.sh")
with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as f:
    f.write(messages[0] + "\n")
    path = f.name
try:
    result = subprocess.run(["bash", validator, path], capture_output=True, text=True)
finally:
    os.unlink(path)

if result.returncode != 0:
    print(result.stderr.strip(), file=sys.stderr)
    sys.exit(2)
sys.exit(0)
