#!/usr/bin/env python3
"""Create a new ADR from the template and register it in docs/adr/README.md.

Usage: new-adr.py "<title in Spanish>" [--slug english-slug] [--status Propuesta|Aceptada]
Prints the created file path.
"""
import argparse
import datetime as dt
import os
import re
import sys
import unicodedata

root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
adr_dir = os.path.join(root, "docs", "adr")
index = os.path.join(adr_dir, "README.md")

p = argparse.ArgumentParser()
p.add_argument("title")
p.add_argument("--slug")
p.add_argument("--status", default="Propuesta")
a = p.parse_args()

numbers = []
for name in os.listdir(adr_dir):
    m = re.match(r"^(\d{4})-.*\.md$", name)
    if m:
        numbers.append(int(m.group(1)))
with open(index, encoding="utf-8") as f:
    for m in re.finditer(r"^\| \[?(\d{4})\]?", f.read(), re.M):
        numbers.append(int(m.group(1)))
number = max(numbers, default=0) + 1
nnnn = f"{number:04d}"

def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:60]

slug = a.slug or slugify(a.title)
filename = f"{nnnn}-{slug}.md"
path = os.path.join(adr_dir, filename)
if os.path.exists(path):
    sys.exit(f"exists: {path}")

today = dt.date.today().isoformat()
with open(os.path.join(adr_dir, "template.md"), encoding="utf-8") as f:
    body = f.read()
body = body.replace("ADR-NNNN — Título", f"ADR-{nnnn} — {a.title}")
body = body.replace("**Estado:** Propuesta (AAAA-MM-DD).", f"**Estado:** {a.status} ({today}).")
with open(path, "w", encoding="utf-8") as f:
    f.write(body)

with open(index, encoding="utf-8") as f:
    lines = f.read().split("\n")
row = f"| [{nnnn}]({filename}) | {a.title} | {a.status} |"
last = max(i for i, l in enumerate(lines) if l.startswith("| [") or re.match(r"^\| \d{4} ", l))
lines.insert(last + 1, row)
with open(index, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(path)
