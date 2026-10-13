import json
from pathlib import Path

samples = Path(r"c:\Users\sxgru\OneDrive\Documentos\Projetos\Kanban\docs\samples")
rows = json.loads((samples / "sender-updates.json").read_text(encoding="utf-8"))
mkt = [r for r in rows if r["sender_player_id"] == "1092502"]
payload = json.dumps(
    [{"e": r["external_transaction_id"], "s": r["sender_player_id"]} for r in mkt],
    separators=(",", ":"),
)
sql = f"""WITH data AS (
  SELECT e AS external_transaction_id, s AS sender_player_id
  FROM jsonb_to_recordset('{payload}'::jsonb) AS x(e text, s text)
)
UPDATE public.campaign_transactions t
SET sender_player_id = d.sender_player_id
FROM data d
WHERE t.board_id = 'board-1'
  AND t.external_transaction_id = d.external_transaction_id
  AND (t.sender_player_id IS DISTINCT FROM d.sender_player_id);
SELECT count(*) FILTER (WHERE sender_player_id = '1092502')::int AS mkt_gt
FROM public.campaign_transactions WHERE board_id = 'board-1';
"""
out = samples / "_sql" / "mkt_only.sql"
out.write_text(sql, encoding="utf-8")
print("mkt", len(mkt), "sql", len(sql))
