#!/usr/bin/env python3
"""Print MCP batch payloads for manual/agent execution. Usage: python run_mcp_batches.py [start] [end]"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "docs" / "samples" / "_sql" / "_exec"
start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
end = int(sys.argv[2]) if len(sys.argv) > 2 else 31

for i in range(start, end + 1):
    p = BASE / f"mcp_{i:02d}.json"
    d = json.loads(p.read_text(encoding="utf-8"))
    print(json.dumps({"batch": i, "project_id": d["project_id"], "query_len": len(d["query"])}))
