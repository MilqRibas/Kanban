import { createClient } from '@supabase/supabase-js'

const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

if (!url || !anonKey) {
  throw new Error(
    'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    /**
     * Evita deadlock do navigator.locks (AbortError / "Failed to fetch")
     * quando writes (ex.: notas) competem com refresh de sessão / realtime.
     * Ver: supabase-js#2013, #2111
     */
    lock: async (_name, _acquireTimeout, fn) => fn(),
  },
})

export const BOARD_ID = 'board-1'
