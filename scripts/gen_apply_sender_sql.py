import json
from pathlib import Path

samples = Path(r"c:\Users\sxgru\OneDrive\Documentos\Projetos\Kanban\docs\samples")
rows = json.loads((samples / "sender-updates.json").read_text(encoding="utf-8"))
out = samples / "_sql"
out.mkdir(exist_ok=True)

BATCH = 500
for i in range(0, len(rows), BATCH):
    chunk = rows[i : i + BATCH]
    payload = json.dumps(
        [{"e": r["external_transaction_id"], "s": r["sender_player_id"]} for r in chunk],
        separators=(",", ":"),
        ensure_ascii=True,
    )
    # Escape single quotes for SQL string literal
    payload_sql = payload.replace("'", "''")
    sql = f"""WITH data AS (
  SELECT e AS external_transaction_id, s AS sender_player_id
  FROM jsonb_to_recordset('{payload_sql}'::jsonb) AS x(e text, s text)
)
UPDATE public.campaign_transactions t
SET sender_player_id = d.sender_player_id
FROM data d
WHERE t.board_id = 'board-1'
  AND t.external_transaction_id = d.external_transaction_id
  AND (t.sender_player_id IS DISTINCT FROM d.sender_player_id);
"""
    path = out / f"apply_{i // BATCH:02d}.sql"
    path.write_text(sql, encoding="utf-8")
    print(path.name, len(sql), "rows", len(chunk))
