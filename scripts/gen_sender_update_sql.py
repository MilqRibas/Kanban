import json
from pathlib import Path

samples = Path(r"c:\Users\sxgru\OneDrive\Documentos\Projetos\Kanban\docs\samples")
rows = json.loads((samples / "sender-updates.json").read_text(encoding="utf-8"))
mkt = [r for r in rows if r["sender_player_id"] == "1092502"]
print("updates", len(rows), "mkt", len(mkt))

out = samples / "_sql"
out.mkdir(exist_ok=True)
BATCH = 400
for i in range(0, len(rows), BATCH):
    chunk = rows[i : i + BATCH]
    values = []
    for r in chunk:
        ext = r["external_transaction_id"].replace("'", "''")
        sid = str(r["sender_player_id"]).replace("'", "''")
        values.append(f"('{ext}','{sid}')")
    sql = (
        "UPDATE public.campaign_transactions AS t\n"
        "SET sender_player_id = v.sender_player_id\n"
        "FROM (VALUES\n"
        + ",\n".join(values)
        + "\n) AS v(external_transaction_id, sender_player_id)\n"
        "WHERE t.board_id = 'board-1'\n"
        "  AND t.external_transaction_id = v.external_transaction_id\n"
        "  AND (t.sender_player_id IS DISTINCT FROM v.sender_player_id);\n"
    )
    (out / f"update_sender_{i // BATCH:02d}.sql").write_text(sql, encoding="utf-8")

print("batches", (len(rows) + BATCH - 1) // BATCH)
