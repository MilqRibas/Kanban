import json
from pathlib import Path

samples = Path(r"c:\Users\sxgru\OneDrive\Documentos\Projetos\Kanban\docs\samples")
rows = json.loads((samples / "sender-updates.json").read_text(encoding="utf-8"))
out = samples / "_sql"
out.mkdir(exist_ok=True)

# Tiny batches for MCP (~80 rows ~5k)
BATCH = 80
for i in range(0, len(rows), BATCH):
    chunk = rows[i : i + BATCH]
    payload = json.dumps(
        [{"e": r["external_transaction_id"], "s": r["sender_player_id"]} for r in chunk],
        separators=(",", ":"),
        ensure_ascii=True,
    ).replace("'", "''")
    sql = (
        "WITH data AS (\n"
        "  SELECT e AS external_transaction_id, s AS sender_player_id\n"
        f"  FROM jsonb_to_recordset('{payload}'::jsonb) AS x(e text, s text)\n"
        ")\n"
        "UPDATE public.campaign_transactions t\n"
        "SET sender_player_id = d.sender_player_id\n"
        "FROM data d\n"
        "WHERE t.board_id = 'board-1'\n"
        "  AND t.external_transaction_id = d.external_transaction_id\n"
        "  AND (t.sender_player_id IS DISTINCT FROM d.sender_player_id);\n"
        "SELECT count(*)::int AS with_sender\n"
        "FROM public.campaign_transactions\n"
        "WHERE board_id = 'board-1' AND sender_player_id IS NOT NULL;"
    )
    path = out / f"mcp_{i // BATCH:02d}.sql"
    path.write_text(sql, encoding="utf-8")
    print(f"{path.name}\t{len(sql)}\t{len(chunk)}")

print("TOTAL", len(rows), "batches", (len(rows) + BATCH - 1) // BATCH)
