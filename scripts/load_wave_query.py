#!/usr/bin/env python3
import json
import sys
from pathlib import Path

w = int(sys.argv[1])
b = Path(__file__).resolve().parent.parent / "docs" / "samples" / "_sql" / "_exec"
d = json.loads((b / f"exec_wave_{w}.json").read_text(encoding="utf-8"))
sys.stdout.write(d["query"])
