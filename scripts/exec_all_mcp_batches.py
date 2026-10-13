#!/usr/bin/env python3
"""Emit execute_sql payloads for batches 00-31 as newline-delimited JSON."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
exec_dir = root / "docs" / "samples" / "_sql" / "_exec"
project_id = "gkyrsdciednwopqomqkp"

for i in range(32):
    q = (exec_dir / f"_q_{i:02d}.txt").read_text(encoding="utf-8")
    print(json.dumps({"project_id": project_id, "query": q}, ensure_ascii=False))
