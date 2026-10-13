#!/usr/bin/env python3
"""Print batch or wave SQL payload for MCP execute_sql. Usage: exec_batch_queries.py [batch|wave] N"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "docs" / "samples" / "_sql" / "_exec"
mode = sys.argv[1] if len(sys.argv) > 1 else "batch"
idx = int(sys.argv[2]) if len(sys.argv) > 2 else 0

if mode == "wave":
    d = json.loads((BASE / f"exec_wave_{idx}.json").read_text(encoding="utf-8"))
else:
    d = json.loads((BASE / f"mcp_{idx:02d}.json").read_text(encoding="utf-8"))

print(json.dumps(d))
