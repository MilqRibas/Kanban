const crypto = require('crypto');

const ROW_ID = 'default';
const TABLE = 'poker_dashboard_state';

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getSupabaseHeaders(serviceKey) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).replace(/\/+$/, '');
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  const appPassword = process.env.APP_PASSWORD || process.env.TRAFEGO_APP_PASSWORD || '';

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({
      configured: false,
      error: 'Supabase não configurado nas variáveis de ambiente da Vercel.',
    });
  }

  // Optional password gate for protecting company financial projections
  if (appPassword) {
    const provided = req.headers['x-app-password'] || '';
    if (!safeEqual(provided, appPassword)) {
      return res.status(401).json({
        configured: true,
        authRequired: true,
        error: 'Senha de acesso inválida ou não informada.',
      });
    }
  }

  const endpoint = `${supabaseUrl}/rest/v1/${TABLE}`;

  try {
    if (req.method === 'GET') {
      const response = await fetch(
        `${endpoint}?id=eq.${encodeURIComponent(ROW_ID)}&select=data,updated_at`,
        {
          method: 'GET',
          headers: getSupabaseHeaders(serviceKey),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        return res.status(502).json({ error: 'Erro ao ler do Supabase', detail: text });
      }

      const rows = await response.json();
      const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

      return res.status(200).json({
        configured: true,
        authRequired: Boolean(appPassword),
        data: row ? row.data : null,
        updatedAt: row ? row.updated_at : null,
      });
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const payload = body && body.data ? body.data : null;

      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Corpo inválido: esperado { data: { ... } }' });
      }

      const nowIso = new Date().toISOString();
      const response = await fetch(`${endpoint}?on_conflict=id`, {
        method: 'POST',
        headers: {
          ...getSupabaseHeaders(serviceKey),
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify([
          {
            id: ROW_ID,
            data: payload,
            updated_at: nowIso,
          },
        ]),
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(502).json({ error: 'Erro ao salvar no Supabase', detail: text });
      }

      const saved = await response.json();
      const row = Array.isArray(saved) && saved.length > 0 ? saved[0] : null;

      return res.status(200).json({
        ok: true,
        updatedAt: row ? row.updated_at : nowIso,
      });
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    return res.status(500).json({
      error: 'Erro interno na API de sincronização',
      detail: err && err.message ? err.message : String(err),
    });
  }
};
