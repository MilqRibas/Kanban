<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Download,
  ExternalLink,
  Globe,
  Headset,
  KeyRound,
  Puzzle,
  Shield,
} from '@lucide/vue'
import { EXTENSION_META } from '../../types/activationIdentity'
import { lookupActivationPlayer } from '../../services/activationIdentityApi'
import { usePlayer360 } from '../../composables/usePlayer360'
import { formatCurrency } from '../../utils/campaignFormat'

type Inner = 'extension' | 'lookup'

const inner = ref<Inner>('extension')
const player360 = usePlayer360()

const lookupId = ref('')
const lookupLoading = ref(false)
const lookupError = ref<string | null>(null)
const lookupResult = ref<Awaited<
  ReturnType<typeof lookupActivationPlayer>
> | null>(null)

const tabs: { id: Inner; label: string }[] = [
  { id: 'extension', label: 'Extensão' },
  { id: 'lookup', label: 'Consulta rápida' },
]

const incentives = computed(() => {
  const p360 = lookupResult.value?.player360
  if (!p360) return null
  const inc = (p360.incentives ?? {}) as Record<string, unknown>
  const num = (k: string) => {
    const n = Number(inc[k])
    return Number.isFinite(n) ? n : null
  }
  return {
    limite: num('limiteIncentivo'),
    enviado: num('incentivoEnviado'),
    disponivel: num('incentivoDisponivel'),
  }
})

async function runLookup() {
  const id = lookupId.value.trim()
  if (!id) return
  lookupLoading.value = true
  lookupError.value = null
  lookupResult.value = null
  try {
    lookupResult.value = await lookupActivationPlayer(id)
    if (!lookupResult.value.found) {
      lookupError.value =
        lookupResult.value.message ?? 'Player ID não encontrado na base de dados.'
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha na consulta.'
    if (/crm_activation_lookup|schema cache|does not exist/i.test(msg)) {
      lookupError.value =
        'API de identidade ainda não aplicada no Supabase. Autorize a migration 20261021180000_crm_operational_identity.'
    } else {
      lookupError.value = msg
    }
  } finally {
    lookupLoading.value = false
  }
}

function openFull360() {
  const id = lookupResult.value?.playerId
  if (!id) return
  void player360.open(id)
}
</script>

<template>
  <div class="space-y-3">
    <header class="space-y-1">
      <p class="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
        <Headset :size="14" />
        Ativação de Leads
      </p>
      <h3 class="text-base font-semibold text-text-primary">
        SX B2C Assistant
      </h3>
      <p class="max-w-2xl text-sm text-text-secondary">
        Ferramenta para as <strong class="font-medium text-text-primary">Agentes de Ativação</strong>
        consultarem jogadores no WhatsApp Web, com a mesma base e regras do SX B2C.
        Não é a Central 24h.
      </p>
    </header>

    <div
      class="flex w-full max-w-md gap-1 rounded-xl border border-border-subtle bg-board-elevated/60 p-1"
      role="tablist"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="inner === tab.id"
        class="flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
        :class="
          inner === tab.id
            ? 'bg-accent text-board'
            : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
        "
        @click="inner = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <section
      v-if="inner === 'extension'"
      class="panel-glass space-y-4 rounded-2xl p-4 sm:p-5"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 class="text-sm font-semibold text-text-primary">{{ EXTENSION_META.name }}</h4>
          <p class="text-xs text-text-muted">
            Versão {{ EXTENSION_META.version }} · {{ EXTENSION_META.compatibility }}
          </p>
        </div>
        <span
          class="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100"
        >
          <Puzzle :size="12" />
          Instalação manual (fase de testes)
        </span>
      </div>

      <p class="text-sm text-text-secondary">
        A extensão não se instala sozinha ao abrir esta página. Em máquinas autorizadas,
        carregue o pacote descompactado no Chrome ou Edge (modo desenvolvedor).
      </p>

      <ol class="list-decimal space-y-2 pl-5 text-sm text-text-secondary">
        <li>
          Copie a pasta <code class="text-text-primary">{{ EXTENSION_META.packagePath }}</code>
          do repositório (ou o ZIP liberado pelo time).
        </li>
        <li>
          Gere <code class="text-text-primary">extension/config.js</code> com
          <code class="text-text-primary">node scripts/write-extension-config.mjs</code>
          (ou copie de <code class="text-text-primary">config.example.js</code>).
          Nunca use a service role.
        </li>
        <li>
          Abra <code class="text-text-primary">chrome://extensions</code> ou
          <code class="text-text-primary">edge://extensions</code>, ative
          “Modo do desenvolvedor” e use “Carregar sem compactação”.
        </li>
        <li>Abra o WhatsApp Web, faça login na extensão com a conta SX B2C e teste a consulta.</li>
      </ol>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          <p class="mb-1 inline-flex items-center gap-1.5 font-medium text-text-primary">
            <Shield :size="14" />
            Permissões
          </p>
          <ul class="list-disc space-y-1 pl-4 text-xs text-text-secondary">
            <li>Acesso a web.whatsapp.com (leitura assistida do contato)</li>
            <li>storage (sessão autenticada local)</li>
            <li>Não captura o conteúdo das conversas</li>
          </ul>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
          <p class="mb-1 inline-flex items-center gap-1.5 font-medium text-text-primary">
            <KeyRound :size="14" />
            Segurança
          </p>
          <ul class="list-disc space-y-1 pl-4 text-xs text-text-secondary">
            <li>Auth Supabase da agente (sem chaves admin)</li>
            <li>Vínculos validados no servidor</li>
            <li>Fonte única: banco central SX B2C</li>
          </ul>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <a
          class="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-board-elevated px-3 py-2 text-xs font-medium text-text-primary hover:border-accent/40"
          href="https://www.google.com/chrome/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Globe :size="14" />
          Chrome / Edge
          <ExternalLink :size="12" class="text-text-muted" />
        </a>
        <span
          class="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3 py-2 text-xs text-text-muted"
          title="Pacote no repositório — distribuição corporativa futura"
        >
          <Download :size="14" />
          Pacote: {{ EXTENSION_META.packagePath }}
        </span>
      </div>

      <p class="text-[11px] text-text-muted">
        Atualização (v0.1.1+): em chrome://extensions clique em “Atualizar” na SX B2C Assistant,
        depois recarregue a aba do WhatsApp Web (ou use “Atualizar contato” no painel).
        Suporte: time SX B2C. Chrome Web Store / Edge Add-ons — fase posterior.
      </p>
    </section>

    <section v-else class="panel-glass space-y-3 rounded-2xl p-4 sm:p-5">
      <h4 class="text-sm font-semibold text-text-primary">Consulta por Player ID</h4>
      <p class="text-xs text-text-muted">
        Mesma base do CRM. Requer migration de identidade aplicada no Supabase.
      </p>
      <form class="flex flex-wrap gap-2" @submit.prevent="runLookup">
        <input
          v-model="lookupId"
          type="text"
          inputmode="numeric"
          placeholder="Player ID"
          class="min-w-[10rem] flex-1 rounded-xl border border-white/10 bg-board-elevated px-3 py-2 text-sm text-text-primary"
        />
        <button
          type="submit"
          class="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-board disabled:opacity-50"
          :disabled="lookupLoading || !lookupId.trim()"
        >
          {{ lookupLoading ? 'Consultando…' : 'Consultar' }}
        </button>
      </form>

      <p v-if="lookupError" class="text-sm text-rose-300">{{ lookupError }}</p>

      <div
        v-if="lookupResult?.found"
        class="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="font-mono text-sm font-semibold text-text-primary">
              {{ lookupResult.playerId }}
            </p>
            <p class="text-[11px] text-text-muted">
              Clubes:
              {{
                lookupResult.clubs.length
                  ? lookupResult.clubs.join(', ')
                  : 'sem club_code explícito'
              }}
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-text-primary hover:border-accent/40"
            @click="openFull360"
          >
            Abrir Player 360º
          </button>
        </div>
        <div v-if="incentives" class="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p class="text-text-muted">Limite</p>
            <p class="tabular-nums text-text-primary">
              {{ incentives.limite != null ? formatCurrency(incentives.limite) : '—' }}
            </p>
          </div>
          <div>
            <p class="text-text-muted">Enviado</p>
            <p class="tabular-nums text-text-primary">
              {{ incentives.enviado != null ? formatCurrency(incentives.enviado) : '—' }}
            </p>
          </div>
          <div>
            <p class="text-text-muted">Disponível</p>
            <p class="tabular-nums text-text-primary">
              {{
                incentives.disponivel != null ? formatCurrency(incentives.disponivel) : '—'
              }}
            </p>
          </div>
        </div>
        <p class="text-[11px] text-text-muted">
          Telefones confirmados:
          {{
            lookupResult.phones.length
              ? lookupResult.phones.map((p) => p.phoneE164).join(', ')
              : 'nenhum'
          }}
          · IDs associados:
          {{
            lookupResult.linkedPlayerIds.length
              ? lookupResult.linkedPlayerIds.map((p) => p.playerId).join(', ')
              : 'somente este'
          }}
        </p>
      </div>
    </section>
  </div>
</template>
