#!/usr/bin/env python3
"""Print MCP execute_sql payloads for batches 00-31 (for agent automation)."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
exec_dir = root / "docs" / "samples" / "_sql" / "_exec"
project_id = "gkyrsdciednwopqomqkp"

for i in range(32):
    payload = json.loads((exec_dir / f"mcp_{i:02d}.json").read_text(encoding="utf-8"))
    out = {"project_id": project_id, "query": payload["query"]}
    (exec_dir / f"_mcp_payload_{i:02d}.json").write_text(
        json.dumps(out, ensure_ascii=False), encoding="utf-8"
    )
print("wrote 32 payload files")
