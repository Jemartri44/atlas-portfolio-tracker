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

# A command may chain several `git commit` invocations (and other commands with
# their own heredocs, e.g. `gh pr create --body`). Each invocation is validated on
# its own: it runs from `git commit` to the next unquoted `&&`, `||`, `;`, `|` or
# newline; quoted strings and $(cat <<'EOF' ... EOF) blocks are kept intact.
SEGMENT = re.compile(
    r"git\s+commit\b(?:\$\(cat\s+<<'?EOF'?\n.*?\nEOF\n?\)|\"(?:[^\"\\]|\\.)*\"|'[^']*'|[^&|;\n\"'$])*",
    re.S,
)
MSG = re.compile(r"(?:-m|--message)(?:=|\s+)(?:\"((?:[^\"\\]|\\.)*)\"|'([^']*)'|(\S+))")
HEREDOC = re.compile(r"<<'?EOF'?\n(.*?)\nEOF", re.S)


def messages_of(segment: str) -> list[str]:
    msgs = []
    for m in MSG.finditer(segment):
        value = next(g for g in m.groups() if g is not None)
        if value.startswith("$(cat"):
            continue  # body comes from the heredoc below
        msgs.append(value)
    for m in HEREDOC.finditer(segment):
        msgs.append(m.group(1))
    return msgs


root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
validator = os.path.join(root, ".githooks", "lib", "validate-commit-message.sh")

for seg in SEGMENT.finditer(command):
    messages = messages_of(seg.group(0))
    if not messages:
        continue  # --amend --no-edit, -F, or interactive: nothing to validate here.
    if len(messages) > 1:
        print("commit hook: use a single subject line (one -m); bodies only when strictly necessary", file=sys.stderr)
        sys.exit(2)
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
