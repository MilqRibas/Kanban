import json
from pathlib import Path

samples = Path(r"c:\Users\sxgru\OneDrive\Documentos\Projetos\Kanban\docs\samples")
rows = json.loads((samples / "sender-updates.json").read_text(encoding="utf-8"))
non = [r for r in rows if r["sender_player_id"] != "1092502"]
out = samples / "_sql"
BATCH = 100
for i in range(0, len(non), BATCH):
    chunk = non[i : i + BATCH]
    payload = json.dumps(
        [{"e": r["external_transaction_id"], "s": r["sender_player_id"]} for r in chunk],
        separators=(",", ":"),
    )
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
    )
    path = out / f"nm_{i // BATCH:02d}.sql"
    path.write_text(sql, encoding="utf-8")
    print(path.name, len(sql), len(chunk))
print("non_mkt", len(non), "batches", (len(non) + BATCH - 1) // BATCH)
