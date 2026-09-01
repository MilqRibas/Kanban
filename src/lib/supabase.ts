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
     * Usa navigator.locks quando disponível; em timeout/abort executa sem lock
     * para evitar deadlock (AbortError) sem desabilitar o lock em todas as abas.
     * Ver: supabase-js#2013, #2111
     */
    lock: async (name, acquireTimeout, fn) => {
      if (typeof navigator === 'undefined' || !navigator.locks?.request) {
        return fn()
      }
      const timeout = acquireTimeout ?? 5000
      try {
        return await navigator.locks.request(
          name,
          { signal: AbortSignal.timeout(timeout) },
          async () => fn(),
        )
      } catch {
        return fn()
      }
    },
  },
})

export const BOARD_ID = 'board-1'
