(() => {
  'use strict';

  const STORAGE_KEY = 'poker_traffic_projection_v2';
  const LEGACY_STORAGE_KEY = 'poker_traffic_projection_v1';

  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const DS = {
    board: '#070d13',
    elevated: '#111a25',
    card: '#212e3e',
    surface: '#1a2533',
    input: '#16212e',
    border: '#33455a',
    text: '#f1f6fb',
    secondary: '#a8b9cb',
    muted: '#7d90a4',
    accent: '#39bcff',
    accentBright: '#6bd0ff',
    success: '#5ce68f',
    gold: '#f59e0b',
    danger: '#fb8585',
  };

  const DONUT_PALETTE = [DS.accent, DS.accentBright, DS.gold, DS.danger, DS.success, '#a78bfa', '#fb923c', '#818cf8'];

  const DEFAULT_PARAMS = {
    totalRev: 3310000,
    adSpend: 42831,
    adRev: 166730,
    targetRev: 3500000,
    decayPct: 12,
    efficiencyPct: 100,
    model: 'organic_decay',
  };

  function createDefaultWidgets() {
    return [
      {
        id: 'waterfall',
        kind: 'builtin',
        builtinType: 'waterfall',
        title: 'Ponte de Faturamento (Ano Atual → Meta)',
        subtitle: 'Como a queda de rake impacta a operação e quanto o tráfego pago precisa compensar',
        visible: true,
        width: 'full',
      },
      {
        id: 'models',
        kind: 'builtin',
        builtinType: 'models',
        title: 'Comparativo dos 3 Modelos',
        subtitle: 'Mesma meta e ROAS, diferentes premissas de retenção',
        visible: true,
        width: 'full',
      },
      {
        id: 'sensitivity',
        kind: 'builtin',
        builtinType: 'sensitivity',
        title: 'Sensibilidade: Quanto Investir se o ROAS Mudar?',
        subtitle: 'Simulação de investimento total e adicional caso a escala altere o retorno sobre mídia',
        visible: true,
        width: 'full',
        levels: [70, 80, 90, 100, 110, 120],
      },
    ];
  }

  const DEFAULT_TRACKER_YEAR = 2027;

  function getCalendarWeeksForYear(year) {
    const safeYear = Number(year) || DEFAULT_TRACKER_YEAR;
    const byMonth = Array.from({ length: 12 }, () => []);
    const pad2 = (n) => String(n).padStart(2, '0');
    const fmtD = (dt) => `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}`;
    const fmtFull = (dt) => `${fmtD(dt)}/${dt.getFullYear()}`;

    const jan1 = new Date(safeYear, 0, 1);
    const dayOfWeek = jan1.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
    const daysToMon = (8 - dayOfWeek) % 7;
    const mon = new Date(safeYear, 0, 1 + daysToMon);

    let firstStart = null;
    let lastEnd = null;

    while (mon.getFullYear() === safeYear) {
      const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
      if (!firstStart) firstStart = fmtFull(mon);
      lastEnd = fmtFull(sun);
      byMonth[mon.getMonth()].push(`${fmtD(mon)} – ${fmtD(sun)}`);
      mon.setDate(mon.getDate() + 7);
    }

    byMonth.spanLabel = firstStart && lastEnd ? `${firstStart} a ${lastEnd}` : String(safeYear);
    return byMonth;
  }

  function createEmptyWeek() {
    return { spend: '', adRev: '', organicRev: '' };
  }

  function createEmptyMonthly(year = DEFAULT_TRACKER_YEAR) {
    const cal = getCalendarWeeksForYear(year);
    return cal.map((weekRanges) => ({
      weeks: weekRanges.map(() => createEmptyWeek()),
    }));
  }

  function normalizeMonthly(rawMonthly, year = DEFAULT_TRACKER_YEAR) {
    const cal = getCalendarWeeksForYear(year);
    if (!Array.isArray(rawMonthly) || rawMonthly.length !== 12) {
      return createEmptyMonthly(year);
    }
    return cal.map((weekRanges, mIdx) => {
      const entry = rawMonthly[mIdx];
      const count = weekRanges.length;

      if (entry && Array.isArray(entry.weeks) && entry.weeks.length > 0) {
        const weeks = [];
        for (let i = 0; i < count; i++) {
          const w = entry.weeks[i];
          weeks.push({
            spend: w && w.spend !== undefined ? String(w.spend) : '',
            adRev: w && w.adRev !== undefined ? String(w.adRev) : '',
            organicRev: w && w.organicRev !== undefined ? String(w.organicRev) : '',
          });
        }
        return { weeks };
      }

      // Migrate legacy flat month values into Semana 1
      const weeks = weekRanges.map(() => createEmptyWeek());
      if (entry && (entry.spend || entry.adRev || entry.organicRev)) {
        weeks[0] = {
          spend: entry.spend !== undefined ? String(entry.spend) : '',
          adRev: entry.adRev !== undefined ? String(entry.adRev) : '',
          organicRev: entry.organicRev !== undefined ? String(entry.organicRev) : '',
        };
      }
      return { weeks };
    });
  }

  const DEFAULT_SEASONALITY_CURVE = [
    { rake: 16251.40, note: 'Alta temporada' },
    { rake: 10721.68, note: 'Baixa / Carnaval' },
    { rake: 13907.22, note: 'Retomada' },
    { rake: 15947.57, note: 'Série Abril' },
    { rake: 17064.56, note: 'Série Maio' },
    { rake: 20228.13, note: 'Pico / Série Junho' },
    { rake: 16170.75, note: 'Alta temporada' },
    { rake: 16271.70, note: 'Série Agosto' },
    { rake: 11965.91, note: 'Baixa temporada' },
    { rake: 14230.95, note: 'Retomada' },
    { rake: 15275.99, note: 'Estimado (média)' },
    { rake: 15275.99, note: 'Estimado (média)' },
  ];

  function createDefaultSeasonality() {
    return {
      intensity: 100,
      syncTracker: true,
      chartView: 'combo',
      months: DEFAULT_SEASONALITY_CURVE.map((item) => ({ ...item })),
    };
  }

  function normalizeSeasonality(raw) {
    const def = createDefaultSeasonality();
    if (!raw || typeof raw !== 'object') return def;
    const months = Array.isArray(raw.months) && raw.months.length === 12
      ? raw.months.map((m, idx) => ({
          rake: m && m.rake !== undefined && Number.isFinite(Number(m.rake)) ? Number(m.rake) : def.months[idx].rake,
          note: m && typeof m.note === 'string' ? m.note : def.months[idx].note,
        }))
      : def.months;
    const chartView = ['combo', 'bars', 'line', 'area'].includes(raw.chartView)
      ? raw.chartView
      : 'combo';
    return {
      intensity: Number.isFinite(Number(raw.intensity)) ? Math.min(200, Math.max(0, Number(raw.intensity))) : 100,
      syncTracker: typeof raw.syncTracker === 'boolean' ? raw.syncTracker : true,
      chartView,
      months,
    };
  }

  function createDefaultKpiCardsForTab(tabKey) {
    if (tabKey === 'simulator') {
      return [
        { id: 'kpi_sim_add', mode: 'metric', metricKey: 'sim_additional_spend', label: 'Investimento Adicional Necessário', customSub: '', accent: 'emerald', visible: true },
        { id: 'kpi_sim_tot', mode: 'metric', metricKey: 'sim_total_spend', label: 'Investimento Total (Próximo Ano)', customSub: '', accent: 'default', visible: true },
        { id: 'kpi_sim_rake', mode: 'metric', metricKey: 'sim_required_ad_rev', label: 'Rake Necessário (Tráfego Pago)', customSub: '', accent: 'default', visible: true },
        { id: 'kpi_sim_roas', mode: 'metric', metricKey: 'sim_projected_roas', label: 'ROAS Projetado', customSub: '', accent: 'default', visible: true },
      ];
    }
    if (tabKey === 'seasonality') {
      return [
        { id: 'kpi_sea_tot', mode: 'metric', metricKey: 'sea_total_budget', label: 'Orçamento Total Projetado', customSub: '', accent: 'emerald', visible: true },
        { id: 'kpi_sea_peak', mode: 'metric', metricKey: 'sea_peak_month', label: 'Mês de Maior Investimento', customSub: '', accent: 'default', visible: true },
        { id: 'kpi_sea_low', mode: 'metric', metricKey: 'sea_low_month', label: 'Mês de Menor Investimento', customSub: '', accent: 'default', visible: true },
        { id: 'kpi_sea_day', mode: 'metric', metricKey: 'sea_daily_range', label: 'Faixa de Verba Diária', customSub: '', accent: 'default', visible: true },
      ];
    }
    return [
      { id: 'kpi_trk_rev', mode: 'metric', metricKey: 'trk_real_total_rev', label: 'Faturamento Acumulado (Real)', customSub: '', accent: 'default', visible: true },
      { id: 'kpi_trk_spd', mode: 'metric', metricKey: 'trk_real_spend', label: 'Investido em Tráfego (Real)', customSub: '', accent: 'default', visible: true },
      { id: 'kpi_trk_roas', mode: 'metric', metricKey: 'trk_real_roas', label: 'ROAS Real Acumulado', customSub: '', accent: 'default', visible: true },
      { id: 'kpi_trk_rem', mode: 'metric', metricKey: 'trk_remaining_weekly_spend', label: 'Verba Sugerida / Semana Restante', customSub: '', accent: 'emerald', visible: true },
    ];
  }

  function createDefaultKpiCards() {
    return {
      simulator: createDefaultKpiCardsForTab('simulator'),
      seasonality: createDefaultKpiCardsForTab('seasonality'),
      tracker: createDefaultKpiCardsForTab('tracker'),
    };
  }

  function normalizeKpiCards(raw) {
    const def = createDefaultKpiCards();
    if (!raw || typeof raw !== 'object') return def;
    const result = {};
    ['simulator', 'seasonality', 'tracker'].forEach((tab) => {
      result[tab] = Array.isArray(raw[tab]) && raw[tab].length > 0
        ? raw[tab].map((c, idx) => ({
            id: c.id || `kpi_${tab}_${idx}`,
            mode: c.mode === 'manual' ? 'manual' : 'metric',
            metricKey: c.metricKey || 'sim_total_spend',
            label: typeof c.label === 'string' ? c.label : 'Indicador',
            manualValue: typeof c.manualValue === 'string' ? c.manualValue : '—',
            customSub: typeof c.customSub === 'string' ? c.customSub : '',
            accent: ['default', 'emerald', 'blue', 'gold', 'rose'].includes(c.accent) ? c.accent : 'default',
            visible: typeof c.visible === 'boolean' ? c.visible : true,
          }))
        : def[tab];
    });
    return result;
  }

  let state = loadState();

  // Tracker UI state
  const expandedMonths = new Set();
  let trackerChartMode = 'weekly';
  let trackerChartStyle = 'line';
  let lastTrackerStructureSig = '';

  // Modal transient drafts
  let editorDraft = null;
  let activeKpiManageTab = 'simulator';
  let kpiEditorDraft = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const trackerYear = Number(parsed.trackerYear) || DEFAULT_TRACKER_YEAR;
        const cleanedWidgets = Array.isArray(parsed.widgets)
          ? parsed.widgets.filter((w) => w.id !== 'clubs' && w.builtinType !== 'clubs')
          : [];
        return {
          params: { ...DEFAULT_PARAMS, ...(parsed.params || {}) },
          trackerYear,
          monthly: normalizeMonthly(parsed.monthly, trackerYear),
          seasonality: normalizeSeasonality(parsed.seasonality),
          kpiCards: normalizeKpiCards(parsed.kpiCards),
          widgets: cleanedWidgets.length > 0
            ? cleanedWidgets
            : createDefaultWidgets(),
        };
      }
      // Migrate from v1 if available
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        return {
          params: { ...DEFAULT_PARAMS, ...(parsed.params || {}) },
          trackerYear: DEFAULT_TRACKER_YEAR,
          monthly: normalizeMonthly(parsed.monthly, DEFAULT_TRACKER_YEAR),
          seasonality: createDefaultSeasonality(),
          kpiCards: createDefaultKpiCards(),
          widgets: createDefaultWidgets(),
        };
      }
    } catch (_) {
      // ignore storage errors
    }
    return {
      params: { ...DEFAULT_PARAMS },
      trackerYear: DEFAULT_TRACKER_YEAR,
      monthly: createEmptyMonthly(DEFAULT_TRACKER_YEAR),
      seasonality: createDefaultSeasonality(),
      kpiCards: createDefaultKpiCards(),
      widgets: createDefaultWidgets(),
    };
  }

  const AUTH_SESSION_KEY = 'poker_dashboard_auth_pin_v1';
  const cloudSync = {
    enabled: false,
    pushTimer: null,
    isPulling: false,
  };

  function getAuthHeader() {
    try {
      const pin = sessionStorage.getItem(AUTH_SESSION_KEY);
      return pin ? { 'x-app-password': pin } : {};
    } catch (_) {
      return {};
    }
  }

  function setCloudStatus(mode, text) {
    const badge = document.getElementById('cloudStatusBadge');
    const refreshBtn = document.getElementById('btnCloudRefresh');
    if (badge) {
      badge.className = `cloud-pill cloud-${mode}`;
      badge.textContent = text;
    }
    if (refreshBtn) {
      refreshBtn.hidden = !cloudSync.enabled;
    }
  }

  function hydrateStateFromRemote(parsed) {
    if (!parsed || typeof parsed !== 'object') return;
    const trackerYear = Number(parsed.trackerYear) || DEFAULT_TRACKER_YEAR;
    const cleanedWidgets = Array.isArray(parsed.widgets)
      ? parsed.widgets.filter((w) => w.id !== 'clubs' && w.builtinType !== 'clubs')
      : [];

    state = {
      params: { ...DEFAULT_PARAMS, ...(parsed.params || {}) },
      trackerYear,
      monthly: normalizeMonthly(parsed.monthly, trackerYear),
      seasonality: normalizeSeasonality(parsed.seasonality),
      kpiCards: normalizeKpiCards(parsed.kpiCards),
      widgets: cleanedWidgets.length > 0 ? cleanedWidgets : createDefaultWidgets(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // ignore
    }
    lastTrackerStructureSig = '';
    renderAll();
  }

  async function pushStateToCloud() {
    if (!cloudSync.enabled) return;
    setCloudStatus('saving', 'Salvando nuvem...');
    try {
      const resp = await fetch('/api/trafego-state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ data: state }),
      });

      if (resp.status === 401) {
        document.getElementById('modalAuthGate').hidden = false;
        setCloudStatus('error', 'Sessão expirada');
        return;
      }

      if (!resp.ok) {
        setCloudStatus('error', 'Erro ao salvar');
        return;
      }

      const now = new Date();
      const hhmm = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setCloudStatus('synced', `☁ Sincronizado · ${hhmm}`);
    } catch (_) {
      setCloudStatus('error', 'Sem conexão');
    }
  }

  function scheduleCloudPush() {
    if (!cloudSync.enabled || cloudSync.isPulling) return;
    clearTimeout(cloudSync.pushTimer);
    setCloudStatus('saving', 'Salvando nuvem...');
    cloudSync.pushTimer = setTimeout(() => {
      pushStateToCloud();
    }, 750);
  }

  async function pullStateFromCloud(seedIfEmpty = false) {
    if (typeof window === 'undefined' || window.location.protocol === 'file:') {
      setCloudStatus('local', 'Modo Local');
      return;
    }

    cloudSync.isPulling = true;
    try {
      const resp = await fetch('/api/trafego-state', {
        method: 'GET',
        headers: {
          ...getAuthHeader(),
        },
      });

      if (resp.status === 404 || resp.status === 503) {
        cloudSync.enabled = false;
        setCloudStatus('local', 'Modo Local');
        return;
      }

      if (resp.status === 401) {
        cloudSync.enabled = true;
        document.getElementById('modalAuthGate').hidden = false;
        setCloudStatus('local', 'Bloqueado');
        return;
      }

      if (!resp.ok) {
        setCloudStatus('error', 'Erro na nuvem');
        return;
      }

      const json = await resp.json();
      cloudSync.enabled = true;
      document.getElementById('modalAuthGate').hidden = true;

      if (json && json.data && Object.keys(json.data).length > 0) {
        hydrateStateFromRemote(json.data);
        const dt = json.updatedAt ? new Date(json.updatedAt) : new Date();
        const hhmm = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setCloudStatus('synced', `☁ Sincronizado · ${hhmm}`);
      } else if (seedIfEmpty) {
        await pushStateToCloud();
      } else {
        setCloudStatus('synced', '☁ Conectado');
      }
    } catch (_) {
      cloudSync.enabled = false;
      setCloudStatus('local', 'Modo Local');
    } finally {
      cloudSync.isPulling = false;
    }
  }

  function exportJsonBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-painel-poker-${state.trackerYear}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJsonBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        hydrateStateFromRemote(parsed);
        saveState();
      } catch (_) {
        alert('Arquivo JSON inválido. Selecione um backup exportado por este painel.');
      }
    };
    reader.readAsText(file);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const badge = document.getElementById('badgeSaveStatus');
      if (badge) {
        badge.textContent = cloudSync.enabled ? 'Sincronizando...' : 'Salvo agora';
        clearTimeout(saveState._t);
        saveState._t = setTimeout(() => {
          badge.textContent = cloudSync.enabled ? 'Sincronizado na nuvem' : 'Salvo automaticamente';
        }, 1400);
      }
    } catch (_) {
      // ignore storage errors
    }
    scheduleCloudPush();
  }

  // ==================== HELPERS & FORMATTERS ====================
  const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const fmtBRL = (val, decimals = 0) => {
    if (!Number.isFinite(val)) return '—';
    return val.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatMoneyInput = (val, decimals = 2) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const parseMoneyInput = (raw) => {
    if (raw == null) return NaN;
    let s = String(raw).trim();
    if (!s) return NaN;
    s = s.replace(/[R$\s]/gi, '');
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  const fmtCompactBRL = (val) => {
    if (!Number.isFinite(val)) return '—';
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (abs >= 1_000_000) {
      return `${sign}R$ ${(abs / 1_000_000).toFixed(2).replace('.', ',')}M`;
    }
    if (abs >= 1_000) {
      return `${sign}R$ ${(abs / 1_000).toFixed(1).replace('.', ',')}k`;
    }
    return fmtBRL(val, 0);
  };

  const fmtNum = (val, decimals = 2) => {
    if (!Number.isFinite(val)) return '—';
    return val.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const fmtCustomVal = (val, format, compact = false) => {
    if (!Number.isFinite(val)) return '—';
    if (format === 'brl') return compact ? fmtCompactBRL(val) : fmtBRL(val, 0);
    if (format === 'pct') return `${fmtNum(val, 1)}%`;
    if (format === 'x') return `${fmtNum(val, 2)}x`;
    if (compact && Math.abs(val) >= 1000) {
      if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(2).replace('.', ',')}M`;
      return `${(val / 1_000).toFixed(1).replace('.', ',')}k`;
    }
    return fmtNum(val, Number.isInteger(val) ? 0 : 1);
  };

  // ==================== CORE FINANCIAL ENGINE ====================
  function computeModel(params, modelKey = params.model, customRoas = null) {
    const totalRev = Math.max(0, Number(params.totalRev) || 0);
    const adSpend = Math.max(1, Number(params.adSpend) || 1);
    const adRev = Math.max(0, Number(params.adRev) || 0);
    const targetRev = Math.max(0, Number(params.targetRev) || 0);
    const decayPct = Math.min(95, Math.max(0, Number(params.decayPct) || 0));
    const efficiencyPct = Math.max(10, Number(params.efficiencyPct) || 100);

    const baseRoas = adRev / adSpend;
    const projectedRoas = customRoas !== null ? customRoas : baseRoas * (efficiencyPct / 100);
    const safeRoas = Math.max(0.01, projectedRoas);

    const decayFactor = 1 - decayPct / 100;
    const currentOrganicRev = Math.max(0, totalRev - adRev);

    let projectedBaseRev = 0;
    let decayLoss = 0;
    let requiredAdRevTotal = 0;
    let incrementalAdRevNeeded = 0;
    let requiredTotalSpend = 0;
    let additionalSpend = 0;
    const projectedOrganicOnlyRev = currentOrganicRev * decayFactor;

    if (modelKey === 'organic_decay') {
      decayLoss = currentOrganicRev * (decayPct / 100);
      projectedBaseRev = projectedOrganicOnlyRev;
      requiredAdRevTotal = Math.max(0, targetRev - projectedOrganicOnlyRev);
      incrementalAdRevNeeded = requiredAdRevTotal;
      requiredTotalSpend = requiredAdRevTotal / safeRoas;
      additionalSpend = requiredTotalSpend - adSpend;
    } else if (modelKey === 'total_decay') {
      decayLoss = totalRev * (decayPct / 100);
      projectedBaseRev = totalRev * decayFactor;
      incrementalAdRevNeeded = Math.max(0, targetRev - projectedBaseRev);
      additionalSpend = incrementalAdRevNeeded / safeRoas;
      requiredTotalSpend = adSpend + additionalSpend;
      requiredAdRevTotal = adRev * decayFactor + incrementalAdRevNeeded;
    } else {
      decayLoss = totalRev * (decayPct / 100);
      projectedBaseRev = totalRev * decayFactor;
      incrementalAdRevNeeded = Math.max(0, targetRev - projectedBaseRev);
      requiredTotalSpend = incrementalAdRevNeeded / safeRoas;
      additionalSpend = requiredTotalSpend - adSpend;
      requiredAdRevTotal = adRev * decayFactor + incrementalAdRevNeeded;
    }

    const spendMultiplier = requiredTotalSpend / adSpend;
    const netMediaContribution = requiredAdRevTotal - requiredTotalSpend;

    return {
      modelKey,
      totalRev,
      adSpend,
      adRev,
      targetRev,
      decayPct,
      baseRoas,
      projectedRoas: safeRoas,
      currentOrganicRev,
      projectedOrganicOnlyRev,
      projectedBaseRev,
      decayLoss,
      requiredAdRevTotal,
      incrementalAdRevNeeded,
      requiredTotalSpend,
      additionalSpend,
      monthlyTotalSpend: requiredTotalSpend / 12,
      monthlyAdditionalSpend: additionalSpend / 12,
      spendMultiplier,
      netMediaContribution,
    };
  }

  // ==================== MASTER RENDER ====================
  function renderAll() {
    syncInputsFromState();
    const res = computeModel(state.params);
    renderWidgetsGrid(res);
    renderSeasonality(res);
    renderTracker(res);
    renderAllKpis(res);
  }

  function syncInputsFromState() {
    const p = state.params;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) {
        el.value = val;
      }
    };
    const setMoney = (id, val) => {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el) {
        el.value = formatMoneyInput(val, 2);
      }
    };

    setMoney('inputTotalRev', p.totalRev);
    setMoney('inputAdSpend', p.adSpend);
    setMoney('inputAdRev', p.adRev);
    setMoney('inputTargetRev', p.targetRev);
    setVal('sliderDecay', p.decayPct);
    setVal('sliderEfficiency', p.efficiencyPct);

    const baseRoas = (p.adRev || 0) / Math.max(1, p.adSpend || 1);
    const projRoas = baseRoas * ((p.efficiencyPct || 100) / 100);

    document.getElementById('labelDecayVal').textContent = `${fmtNum(p.decayPct, 1)}%`;
    document.getElementById('labelEfficiencyVal').textContent = `${p.efficiencyPct}% (${fmtNum(projRoas, 2)}x)`;

    document.querySelectorAll('input[name="calcModel"]').forEach((radio) => {
      radio.checked = radio.value === p.model;
    });
  }

  // ==================== CUSTOMIZABLE KPI CARDS ENGINE ====================
  function buildLiveKpiContext(resOpt = null) {
    const res = resOpt || computeModel(state.params);
    const sea = computeSeasonality(res);
    const trk = computeTrackerData(res);
    return { res, sea, trk };
  }

  function getKpiMetricCatalog(ctx) {
    const { res, sea, trk } = ctx;
    const { totals, totalYearWeeks, weeklyExpectedOrganic } = trk;

    const addSign = res.additionalSpend >= 0 ? '+' : '';
    const rakeDisplay = res.modelKey === 'organic_decay' ? res.requiredAdRevTotal : res.incrementalAdRevNeeded;
    const peakSign = sea.peak.indexPct >= 0 ? '+' : '';
    const lowSign = sea.low.indexPct >= 0 ? '+' : '';
    const ratio = sea.low.budget > 0 ? sea.peak.budget / sea.low.budget : 1;

    const pctTarget = res.targetRev > 0 ? (totals.cumRealTotal / res.targetRev) * 100 : 0;
    const pctSpend = res.requiredTotalSpend > 0 ? (totals.cumRealSpend / res.requiredTotalSpend) * 100 : 0;
    const remainingWeeks = Math.max(0, totalYearWeeks - totals.filledWeeksTotal);

    let remWeeklyVal = 'Ano concluído';
    let remWeeklyMeta = totals.cumRealTotal >= res.targetRev
      ? `Meta superada em ${fmtBRL(totals.cumRealTotal - res.targetRev)}`
      : `Faltaram ${fmtBRL(res.targetRev - totals.cumRealTotal)} para a meta`;

    if (remainingWeeks > 0) {
      const avgOrgPerWeek = totals.filledWeeksTotal > 0 ? totals.cumRealOrganic / totals.filledWeeksTotal : weeklyExpectedOrganic;
      const projectedRemainingOrganic = avgOrgPerWeek * remainingWeeks;
      const remainingTotalGap = Math.max(0, res.targetRev - totals.cumRealTotal);
      const remainingAdRevNeeded = Math.max(0, remainingTotalGap - projectedRemainingOrganic);
      const activeRoas = totals.realRoas !== null && totals.realRoas > 0.2 ? totals.realRoas : res.projectedRoas;
      const remainingSpendNeeded = remainingAdRevNeeded / activeRoas;
      const suggestedPerWeek = remainingSpendNeeded / remainingWeeks;
      const approxMonthly = suggestedPerWeek * (totalYearWeeks / 12);
      remWeeklyVal = fmtBRL(suggestedPerWeek);
      remWeeklyMeta = `~${fmtBRL(approxMonthly)}/mês · ${remainingWeeks} sem. restantes (ROAS ${fmtNum(activeRoas, 2)}x)`;
    }

    return [
      // Simulador
      {
        key: 'sim_additional_spend',
        group: 'Simulador',
        name: 'Investimento Adicional Necessário',
        value: `${addSign}${fmtBRL(res.additionalSpend)}`,
        meta: `${addSign}${fmtBRL(res.monthlyAdditionalSpend)}/mês além dos ${fmtBRL(res.adSpend / 12)}/mês atuais`,
      },
      {
        key: 'sim_total_spend',
        group: 'Simulador',
        name: 'Investimento Total (Próximo Ano)',
        value: fmtBRL(res.requiredTotalSpend),
        meta: `${fmtBRL(res.monthlyTotalSpend)}/mês (${fmtNum(res.spendMultiplier, 2)}x o orçamento atual)`,
      },
      {
        key: 'sim_required_ad_rev',
        group: 'Simulador',
        name: 'Rake Necessário (Tráfego Pago)',
        value: fmtBRL(rakeDisplay),
        meta: res.modelKey === 'organic_decay'
          ? `Queda orgânica de -${fmtCompactBRL(res.decayLoss)} (${fmtNum(res.decayPct, 1)}%)`
          : `Gap após queda de -${fmtCompactBRL(res.decayLoss)} na operação`,
      },
      {
        key: 'sim_projected_roas',
        group: 'Simulador',
        name: 'ROAS Projetado',
        value: `${fmtNum(res.projectedRoas, 2)}x`,
        meta: `ROAS histórico: ${fmtNum(res.baseRoas, 2)}x · ROI: ${fmtNum((res.projectedRoas - 1) * 100, 0)}%`,
      },
      {
        key: 'sim_monthly_spend',
        group: 'Simulador',
        name: 'Orçamento Mensal Médio',
        value: fmtBRL(res.monthlyTotalSpend),
        meta: `Adicional mensal: ${addSign}${fmtBRL(res.monthlyAdditionalSpend)}/mês`,
      },
      {
        key: 'sim_weekly_spend',
        group: 'Simulador',
        name: 'Orçamento Semanal Médio',
        value: fmtBRL(res.requiredTotalSpend / totalYearWeeks),
        meta: `Baseado em ${totalYearWeeks} semanas em ${trk.trackerYear}`,
      },
      {
        key: 'sim_net_media_profit',
        group: 'Simulador',
        name: 'Lucro Líquido de Mídia',
        value: fmtBRL(res.netMediaContribution),
        meta: `Rake tráfego (${fmtCompactBRL(res.requiredAdRevTotal)}) − mídia (${fmtCompactBRL(res.requiredTotalSpend)})`,
      },
      {
        key: 'sim_decay_loss',
        group: 'Simulador',
        name: 'Impacto da Queda Anual (Churn)',
        value: `-${fmtBRL(res.decayLoss)}`,
        meta: `Queda configurada de ${fmtNum(res.decayPct, 1)}% ao ano`,
      },
      {
        key: 'sim_target_rev',
        group: 'Simulador',
        name: 'Meta de Faturamento Total',
        value: fmtBRL(res.targetRev),
        meta: `Crescimento de ${fmtNum(((res.targetRev / Math.max(1, res.totalRev)) - 1) * 100, 1)}% vs ano atual`,
      },
      {
        key: 'sim_net_after_media',
        group: 'Simulador',
        name: 'Faturamento Líquido Pós-Mídia',
        value: fmtBRL(res.targetRev - res.requiredTotalSpend),
        meta: `Meta total descontando toda a verba de tráfego`,
      },
      {
        key: 'sim_spend_multiplier',
        group: 'Simulador',
        name: 'Multiplicador de Verba',
        value: `${fmtNum(res.spendMultiplier, 2)}x`,
        meta: `De ${fmtBRL(res.adSpend)} para ${fmtBRL(res.requiredTotalSpend)}`,
      },

      // Sazonalidade / Projeção de Investimento
      {
        key: 'sea_total_budget',
        group: 'Projeção de Investimento',
        name: 'Orçamento Total Projetado',
        value: fmtBRL(sea.totalBudget),
        meta: `Média linear: ${fmtBRL(sea.linearMonthly)}/mês · ROAS ${fmtNum(res.projectedRoas, 2)}x`,
      },
      {
        key: 'sea_peak_month',
        group: 'Projeção de Investimento',
        name: 'Mês de Maior Investimento',
        value: `${sea.peak.name} · ${fmtBRL(sea.peak.budget)}`,
        meta: `${peakSign}${fmtNum(sea.peak.indexPct, 1)}% vs média (${fmtBRL(sea.peak.weeklyBudget)}/sem)`,
      },
      {
        key: 'sea_low_month',
        group: 'Projeção de Investimento',
        name: 'Mês de Menor Investimento',
        value: `${sea.low.name} · ${fmtBRL(sea.low.budget)}`,
        meta: `${lowSign}${fmtNum(sea.low.indexPct, 1)}% vs média (${fmtBRL(sea.low.weeklyBudget)}/sem)`,
      },
      {
        key: 'sea_daily_range',
        group: 'Projeção de Investimento',
        name: 'Faixa de Verba Diária',
        value: `${fmtBRL(sea.minDaily)} – ${fmtBRL(sea.maxDaily)}`,
        meta: `Média anual: ${fmtBRL(sea.avgDaily)}/dia em campanhas`,
      },
      {
        key: 'sea_amplitude',
        group: 'Projeção de Investimento',
        name: 'Amplitude Pico vs. Vale',
        value: `${fmtNum(ratio, 2)}x`,
        meta: `${sea.peak.name} (${fmtCompactBRL(sea.peak.budget)}) vs ${sea.low.name} (${fmtCompactBRL(sea.low.budget)})`,
      },

      // Acompanhamento Semanal
      {
        key: 'trk_real_total_rev',
        group: 'Acompanhamento Semanal',
        name: 'Faturamento Acumulado (Real)',
        value: fmtBRL(totals.cumRealTotal),
        meta: `${fmtNum(pctTarget, 1)}% da meta anual (${totals.filledWeeksTotal}/${totalYearWeeks} semanas lançadas)`,
      },
      {
        key: 'trk_real_spend',
        group: 'Acompanhamento Semanal',
        name: 'Investido em Tráfego (Real)',
        value: fmtBRL(totals.cumRealSpend),
        meta: `${fmtNum(pctSpend, 1)}% da verba planejada (${fmtBRL(res.requiredTotalSpend)})`,
      },
      {
        key: 'trk_real_roas',
        group: 'Acompanhamento Semanal',
        name: 'ROAS Real Acumulado',
        value: totals.realRoas !== null ? `${fmtNum(totals.realRoas, 2)}x` : '—',
        meta: `Meta projetada: ${fmtNum(res.projectedRoas, 2)}x`,
      },
      {
        key: 'trk_remaining_weekly_spend',
        group: 'Acompanhamento Semanal',
        name: 'Verba Sugerida / Semana Restante',
        value: remWeeklyVal,
        meta: remWeeklyMeta,
      },
      {
        key: 'trk_real_ad_rev',
        group: 'Acompanhamento Semanal',
        name: 'Rake Tráfego Acumulado (Real)',
        value: fmtBRL(totals.cumRealAdRev),
        meta: `Meta anual tráfego: ${fmtBRL(res.requiredAdRevTotal)}`,
      },
      {
        key: 'trk_real_organic_rev',
        group: 'Acompanhamento Semanal',
        name: 'Rake Base Orgânica (Real)',
        value: fmtBRL(totals.cumRealOrganic),
        meta: `${totals.filledWeeksTotal} semana(s) lançadas no ano`,
      },
      {
        key: 'trk_remaining_rev',
        group: 'Acompanhamento Semanal',
        name: 'Falta para Meta Anual',
        value: fmtBRL(Math.max(0, res.targetRev - totals.cumRealTotal)),
        meta: `${remainingWeeks} semanas restantes em ${trk.trackerYear}`,
      },
    ];
  }

  function resolveKpiCardDisplay(card, catalog) {
    if (card.mode === 'manual') {
      return {
        label: card.label || 'Card Personalizado',
        value: card.manualValue || '—',
        meta: card.customSub || '',
      };
    }
    const found = catalog.find((m) => m.key === card.metricKey) || catalog[0];
    return {
      label: card.label || found.name,
      value: found.value,
      meta: card.customSub ? card.customSub : found.meta,
    };
  }

  function renderAllKpis(resOpt = null) {
    const ctx = buildLiveKpiContext(resOpt);
    const catalog = getKpiMetricCatalog(ctx);
    ['simulator', 'seasonality', 'tracker'].forEach((tabKey) => {
      renderKpiGridForTab(tabKey, catalog);
    });
  }

  function renderKpiGridForTab(tabKey, catalog) {
    const grid = document.getElementById(`kpiGrid-${tabKey}`);
    const countEl = document.getElementById(`kpiCount-${tabKey}`);
    if (!grid) return;

    const allCards = (state.kpiCards && state.kpiCards[tabKey]) || [];
    const visibleCards = allCards.filter((c) => c.visible);

    if (countEl) {
      countEl.textContent = `${visibleCards.length} de ${allCards.length}`;
    }

    if (visibleCards.length === 0) {
      grid.innerHTML = `
        <div class="kpi-empty-bar">
          <span>Nenhum card de indicador está ativo nesta aba.</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-primary btn-sm" data-empty-kpi-add="${tabKey}">+ Novo Card</button>
            <button type="button" class="btn btn-secondary btn-sm" data-empty-kpi-manage="${tabKey}">⚙ Ativar Cards</button>
          </div>
        </div>
      `;
      grid.querySelector('[data-empty-kpi-add]')?.addEventListener('click', () => openKpiEditorModal(tabKey, null));
      grid.querySelector('[data-empty-kpi-manage]')?.addEventListener('click', () => openManageKpisModal(tabKey));
      return;
    }

    grid.innerHTML = visibleCards.map((card, visIdx) => {
      const disp = resolveKpiCardDisplay(card, catalog);
      const accentCls = card.accent && card.accent !== 'default' ? `kpi-accent-${card.accent}` : '';
      return `
        <article class="kpi-card ${accentCls}" data-kpi-id="${escapeHtml(card.id)}">
          <div class="kpi-card-top">
            <div class="kpi-label">${escapeHtml(disp.label)}</div>
            <div class="kpi-card-actions">
              <button type="button" class="icon-btn" data-kpi-act="left" title="Mover para esquerda" ${visIdx === 0 ? 'disabled' : ''}>←</button>
              <button type="button" class="icon-btn" data-kpi-act="right" title="Mover para direita" ${visIdx === visibleCards.length - 1 ? 'disabled' : ''}>→</button>
              <button type="button" class="icon-btn" data-kpi-act="edit" title="Editar card">✎</button>
              <button type="button" class="icon-btn icon-btn-danger" data-kpi-act="hide" title="Remover card da tela">✕</button>
            </div>
          </div>
          <div class="kpi-value">${escapeHtml(disp.value)}</div>
          ${disp.meta ? `<div class="kpi-meta">${escapeHtml(disp.meta)}</div>` : ''}
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.kpi-card[data-kpi-id]').forEach((el) => {
      const id = el.getAttribute('data-kpi-id');
      el.querySelectorAll('[data-kpi-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-kpi-act');
          if (act === 'left') moveVisibleKpiCard(tabKey, id, -1);
          if (act === 'right') moveVisibleKpiCard(tabKey, id, 1);
          if (act === 'edit') openKpiEditorModal(tabKey, id);
          if (act === 'hide') hideKpiCard(tabKey, id);
        });
      });
    });
  }

  function moveVisibleKpiCard(tabKey, cardId, delta) {
    const list = state.kpiCards[tabKey] || [];
    const visIds = list.filter((c) => c.visible).map((c) => c.id);
    const pos = visIds.indexOf(cardId);
    const swapPos = pos + delta;
    if (pos < 0 || swapPos < 0 || swapPos >= visIds.length) return;

    const idxA = list.findIndex((c) => c.id === visIds[pos]);
    const idxB = list.findIndex((c) => c.id === visIds[swapPos]);
    const tmp = list[idxA];
    list[idxA] = list[idxB];
    list[idxB] = tmp;

    saveState();
    renderAllKpis();
  }

  function moveAbsoluteKpiCard(tabKey, cardId, delta) {
    const list = state.kpiCards[tabKey] || [];
    const idx = list.findIndex((c) => c.id === cardId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const tmp = list[idx];
    list[idx] = list[target];
    list[target] = tmp;

    saveState();
    renderAllKpis();
    renderManageKpisList();
  }

  function hideKpiCard(tabKey, cardId) {
    const card = (state.kpiCards[tabKey] || []).find((c) => c.id === cardId);
    if (!card) return;
    card.visible = false;
    saveState();
    renderAllKpis();
  }

  function deleteKpiCard(tabKey, cardId) {
    state.kpiCards[tabKey] = (state.kpiCards[tabKey] || []).filter((c) => c.id !== cardId);
    saveState();
    renderAllKpis();
  }

  // ==================== MANAGE KPI CARDS MODAL ====================
  function openManageKpisModal(tabKey) {
    activeKpiManageTab = tabKey;
    const tabNames = {
      simulator: 'Simulador & Projeção',
      seasonality: 'Projeção de Investimento',
      tracker: 'Acompanhamento Semanal',
    };
    document.getElementById('modalManageKpisTitle').textContent =
      `Gerenciar Cards — ${tabNames[tabKey] || ''}`;
    renderManageKpisList();
    document.getElementById('modalManageKpis').hidden = false;
  }

  function renderManageKpisList() {
    const listEl = document.getElementById('manageKpisList');
    const cards = state.kpiCards[activeKpiManageTab] || [];
    const catalog = getKpiMetricCatalog(buildLiveKpiContext());

    if (cards.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted)">Nenhum card cadastrado nesta aba. Clique em "+ Novo Card" ou "Restaurar Cards Padrão".</div>`;
      return;
    }

    listEl.innerHTML = cards.map((card, idx) => {
      const disp = resolveKpiCardDisplay(card, catalog);
      return `
        <div class="manage-item ${card.visible ? '' : 'is-hidden'}" data-mk-id="${escapeHtml(card.id)}">
          <div class="manage-item-left">
            <input type="checkbox" data-mk-toggle="${escapeHtml(card.id)}" ${card.visible ? 'checked' : ''} />
            <div class="manage-item-info">
              <strong>
                ${escapeHtml(disp.label)}
                <span class="tag ${card.mode === 'manual' ? 'tag-blue' : 'tag-green'}">${card.mode === 'manual' ? 'Manual' : 'Ao Vivo'}</span>
              </strong>
              <span>${escapeHtml(disp.value)}${disp.meta ? ` · ${escapeHtml(disp.meta)}` : ''}</span>
            </div>
          </div>
          <div class="manage-item-controls">
            <button type="button" class="icon-btn" data-mk-act="up" title="Subir" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="icon-btn" data-mk-act="down" title="Descer" ${idx === cards.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="icon-btn" data-mk-act="edit" title="Editar">✎</button>
            <button type="button" class="icon-btn icon-btn-danger" data-mk-act="delete" title="Excluir card">🗑</button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('input[data-mk-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-mk-toggle');
        const c = (state.kpiCards[activeKpiManageTab] || []).find((item) => item.id === id);
        if (c) {
          c.visible = cb.checked;
          saveState();
          renderAllKpis();
          renderManageKpisList();
        }
      });
    });

    listEl.querySelectorAll('.manage-item').forEach((row) => {
      const id = row.getAttribute('data-mk-id');
      row.querySelectorAll('[data-mk-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-mk-act');
          if (act === 'up') moveAbsoluteKpiCard(activeKpiManageTab, id, -1);
          if (act === 'down') moveAbsoluteKpiCard(activeKpiManageTab, id, 1);
          if (act === 'edit') {
            closeModal('modalManageKpis');
            openKpiEditorModal(activeKpiManageTab, id);
          }
          if (act === 'delete') {
            deleteKpiCard(activeKpiManageTab, id);
            renderManageKpisList();
          }
        });
      });
    });
  }

  // ==================== KPI CARD EDITOR MODAL ====================
  function populateKpiMetricSelect(selectedKey) {
    const select = document.getElementById('kpiEdMetric');
    const catalog = getKpiMetricCatalog(buildLiveKpiContext());
    const groups = ['Simulador', 'Projeção de Investimento', 'Acompanhamento Semanal'];

    select.innerHTML = groups.map((grp) => {
      const items = catalog.filter((m) => m.group === grp);
      return `
        <optgroup label="${escapeHtml(grp)}">
          ${items.map((m) => `<option value="${m.key}" ${m.key === selectedKey ? 'selected' : ''}>${escapeHtml(m.name)} (${escapeHtml(m.value)})</option>`).join('')}
        </optgroup>
      `;
    }).join('');
  }

  function openKpiEditorModal(tabKey, cardId) {
    const existing = cardId ? (state.kpiCards[tabKey] || []).find((c) => c.id === cardId) : null;
    const defaultMetricByTab = {
      simulator: 'sim_monthly_spend',
      seasonality: 'sea_amplitude',
      tracker: 'trk_real_ad_rev',
    };
    const catalog = getKpiMetricCatalog(buildLiveKpiContext());

    if (!existing) {
      const defMetricKey = defaultMetricByTab[tabKey] || 'sim_total_spend';
      const metaObj = catalog.find((m) => m.key === defMetricKey) || catalog[0];
      kpiEditorDraft = {
        isNew: true,
        tabKey,
        id: `kpi_${Date.now()}`,
        mode: 'metric',
        metricKey: metaObj.key,
        label: metaObj.name,
        manualValue: 'R$ 0',
        customSub: '',
        accent: 'default',
        visible: true,
      };
    } else {
      kpiEditorDraft = { ...existing, tabKey, isNew: false };
    }

    document.getElementById('modalKpiEditorTitle').textContent = kpiEditorDraft.isNew
      ? 'Adicionar Novo Card'
      : 'Editar Card';

    populateKpiMetricSelect(kpiEditorDraft.metricKey);
    document.getElementById('kpiEdLabel').value = kpiEditorDraft.label || '';
    document.getElementById('kpiEdValue').value = kpiEditorDraft.manualValue || '';
    document.getElementById('kpiEdSub').value = kpiEditorDraft.customSub || '';
    document.getElementById('btnDeleteKpiInModal').hidden = kpiEditorDraft.isNew;

    syncKpiEditorModeUi();
    syncKpiAccentButtons();
    updateKpiEditorPreview();

    document.getElementById('modalKpiEditor').hidden = false;
  }

  function syncKpiEditorModeUi() {
    if (!kpiEditorDraft) return;
    const isManual = kpiEditorDraft.mode === 'manual';
    document.querySelectorAll('[data-kpi-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-kpi-mode') === kpiEditorDraft.mode);
    });
    document.getElementById('kpiEditorMetricSection').hidden = isManual;
    document.getElementById('kpiEditorManualSection').hidden = !isManual;
    document.getElementById('kpiEdSubHint').hidden = isManual;
  }

  function syncKpiAccentButtons() {
    if (!kpiEditorDraft) return;
    document.querySelectorAll('#kpiEdAccentPicker .accent-opt').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-accent') === kpiEditorDraft.accent);
    });
  }

  function updateKpiEditorPreview() {
    if (!kpiEditorDraft) return;
    const catalog = getKpiMetricCatalog(buildLiveKpiContext());
    const disp = resolveKpiCardDisplay(kpiEditorDraft, catalog);
    const accentCls = kpiEditorDraft.accent && kpiEditorDraft.accent !== 'default'
      ? `kpi-accent-${kpiEditorDraft.accent}`
      : '';
    document.getElementById('kpiEdPreview').innerHTML = `
      <article class="kpi-card ${accentCls}" style="box-shadow:none">
        <div class="kpi-label">${escapeHtml(disp.label)}</div>
        <div class="kpi-value">${escapeHtml(disp.value)}</div>
        ${disp.meta ? `<div class="kpi-meta">${escapeHtml(disp.meta)}</div>` : ''}
      </article>
    `;
  }

  function saveKpiEditor() {
    if (!kpiEditorDraft) return;
    const { tabKey, isNew } = kpiEditorDraft;
    const cleanCard = {
      id: kpiEditorDraft.id,
      mode: kpiEditorDraft.mode,
      metricKey: kpiEditorDraft.metricKey,
      label: (document.getElementById('kpiEdLabel').value || '').trim() || 'Indicador',
      manualValue: (document.getElementById('kpiEdValue').value || '').trim() || '—',
      customSub: (document.getElementById('kpiEdSub').value || '').trim(),
      accent: kpiEditorDraft.accent || 'default',
      visible: true,
    };

    state.kpiCards[tabKey] = state.kpiCards[tabKey] || [];
    if (isNew) {
      state.kpiCards[tabKey].push(cleanCard);
    } else {
      const idx = state.kpiCards[tabKey].findIndex((c) => c.id === cleanCard.id);
      if (idx >= 0) state.kpiCards[tabKey][idx] = cleanCard;
    }

    saveState();
    closeModal('modalKpiEditor');
    kpiEditorDraft = null;
    renderAllKpis();
  }

  // ==================== DYNAMIC WIDGETS GRID ====================
  function renderWidgetsGrid(res) {
    const grid = document.getElementById('widgetsGrid');
    const visibleWidgets = state.widgets.filter((w) => w.visible);
    const totalCount = state.widgets.length;

    const countEl = document.getElementById('widgetCountLabel');
    if (countEl) {
      countEl.textContent = `${visibleWidgets.length} de ${totalCount} visíveis`;
    }

    if (visibleWidgets.length === 0) {
      grid.innerHTML = `
        <div class="empty-widgets-state">
          <p>Nenhum gráfico está ativo no painel no momento.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
            <button type="button" class="btn btn-primary" id="btnEmptyAdd">+ Adicionar Gráfico</button>
            <button type="button" class="btn btn-secondary" id="btnEmptyManage">⚙ Ativar Blocos</button>
          </div>
        </div>
      `;
      document.getElementById('btnEmptyAdd')?.addEventListener('click', () => openChartEditor(null));
      document.getElementById('btnEmptyManage')?.addEventListener('click', openManageModal);
      return;
    }

    grid.innerHTML = '';

    visibleWidgets.forEach((widget, visIdx) => {
      const card = document.createElement('section');
      card.className = `panel widget-card width-${widget.width === 'half' ? 'half' : 'full'}`;
      card.setAttribute('data-widget-id', widget.id);

      const extraHeaderBadge = widget.builtinType === 'waterfall'
        ? `<span class="pill">Lucro líq. mídia: ${fmtBRL(res.netMediaContribution)}</span>`
        : widget.kind === 'custom'
          ? `<span class="badge">Personalizado</span>`
          : '';

      card.innerHTML = `
        <div class="panel-header">
          <div>
            <h2>${escapeHtml(widget.title)}</h2>
            ${widget.subtitle ? `<p class="panel-desc">${escapeHtml(widget.subtitle)}</p>` : ''}
          </div>
          <div class="panel-header-right">
            ${extraHeaderBadge}
            ${widget.kind === 'custom' && widget.chartType !== 'donut' ? `
            <div class="segmented widget-chart-type" role="group" aria-label="Tipo de visualização">
              <button type="button" class="seg-btn ${(widget.chartType || 'bar') === 'bar' ? 'active' : ''}" data-w-chart="bar">Barras</button>
              <button type="button" class="seg-btn ${widget.chartType === 'line' ? 'active' : ''}" data-w-chart="line">Linha</button>
              <button type="button" class="seg-btn ${widget.chartType === 'area' ? 'active' : ''}" data-w-chart="area">Área</button>
              <button type="button" class="seg-btn ${widget.chartType === 'hbar' ? 'active' : ''}" data-w-chart="hbar">H.Barras</button>
            </div>` : ''}
            <div class="widget-actions">
              <button type="button" class="icon-btn" data-w-act="up" title="Mover para cima" ${visIdx === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="icon-btn" data-w-act="down" title="Mover para baixo" ${visIdx === visibleWidgets.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="icon-btn" data-w-act="width" title="${widget.width === 'half' ? 'Expandir para largura total' : 'Reduzir para meia largura'}">⇔</button>
              <button type="button" class="icon-btn" data-w-act="edit" title="Editar gráfico">✎</button>
              <button type="button" class="icon-btn icon-btn-danger" data-w-act="hide" title="${widget.kind === 'custom' ? 'Ocultar gráfico' : 'Remover do painel'}">✕</button>
            </div>
          </div>
        </div>
        <div class="widget-body"></div>
      `;

      const body = card.querySelector('.widget-body');

      if (widget.kind === 'builtin') {
        if (widget.builtinType === 'waterfall') {
          body.innerHTML = `<div class="chart-box">${buildWaterfallSvg(res)}</div>`;
        } else if (widget.builtinType === 'models') {
          renderModelsBody(body);
        } else if (widget.builtinType === 'sensitivity') {
          renderSensitivityBody(body, res, widget.levels || [70, 80, 90, 100, 110, 120]);
        }
      } else {
        body.innerHTML = buildCustomChartHtml(widget);
      }

      // Wire card action buttons
      card.querySelectorAll('[data-w-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-w-act');
          if (act === 'up') moveVisibleWidget(widget.id, -1);
          if (act === 'down') moveVisibleWidget(widget.id, 1);
          if (act === 'width') toggleWidgetWidth(widget.id);
          if (act === 'edit') openChartEditor(widget.id);
          if (act === 'hide') hideWidget(widget.id);
        });
      });

      card.querySelectorAll('[data-w-chart]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const nextType = btn.getAttribute('data-w-chart');
          const idx = state.widgets.findIndex((w) => w.id === widget.id);
          if (idx === -1) return;
          state.widgets[idx].chartType = nextType;
          saveState();
          renderAll();
        });
      });

      grid.appendChild(card);
    });
  }

  function moveVisibleWidget(widgetId, delta) {
    const visibleIds = state.widgets.filter((w) => w.visible).map((w) => w.id);
    const pos = visibleIds.indexOf(widgetId);
    const swapPos = pos + delta;
    if (pos < 0 || swapPos < 0 || swapPos >= visibleIds.length) return;

    const idxA = state.widgets.findIndex((w) => w.id === visibleIds[pos]);
    const idxB = state.widgets.findIndex((w) => w.id === visibleIds[swapPos]);
    const tmp = state.widgets[idxA];
    state.widgets[idxA] = state.widgets[idxB];
    state.widgets[idxB] = tmp;

    saveState();
    renderAll();
  }

  function moveWidgetAbsolute(widgetId, delta) {
    const idx = state.widgets.findIndex((w) => w.id === widgetId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= state.widgets.length) return;
    const tmp = state.widgets[idx];
    state.widgets[idx] = state.widgets[target];
    state.widgets[target] = tmp;
    saveState();
    renderAll();
    renderManageList();
  }

  function toggleWidgetWidth(widgetId) {
    const w = state.widgets.find((item) => item.id === widgetId);
    if (!w) return;
    w.width = w.width === 'half' ? 'full' : 'half';
    saveState();
    renderAll();
  }

  function hideWidget(widgetId) {
    const w = state.widgets.find((item) => item.id === widgetId);
    if (!w) return;
    w.visible = false;
    saveState();
    renderAll();
  }

  function deleteCustomWidget(widgetId) {
    state.widgets = state.widgets.filter((w) => !(w.id === widgetId && w.kind === 'custom'));
    saveState();
    renderAll();
  }

  // ==================== BUILT-IN WIDGET RENDERERS ====================
  function buildWaterfallSvg(res) {
    const steps = [];

    if (res.modelKey === 'organic_decay') {
      steps.push({ label: 'Faturamento\nAtual', start: 0, end: res.totalRev, delta: res.totalRev, type: 'base' });
      steps.push({ label: 'Tráfego\nAno 1', start: res.totalRev, end: res.currentOrganicRev, delta: -res.adRev, type: 'neutral-neg' });
      steps.push({ label: `Queda Base\n(-${fmtNum(res.decayPct, 1)}%)`, start: res.currentOrganicRev, end: res.projectedOrganicOnlyRev, delta: -res.decayLoss, type: 'neg' });
      steps.push({ label: 'Novo Tráfego\nAno 2', start: res.projectedOrganicOnlyRev, end: res.projectedOrganicOnlyRev + res.requiredAdRevTotal, delta: res.requiredAdRevTotal, type: 'pos' });
      steps.push({ label: 'Meta\nAno 2', start: 0, end: res.targetRev, delta: res.targetRev, type: 'target' });
    } else {
      steps.push({ label: 'Faturamento\nAtual', start: 0, end: res.totalRev, delta: res.totalRev, type: 'base' });
      steps.push({ label: `Queda Operação\n(-${fmtNum(res.decayPct, 1)}%)`, start: res.totalRev, end: res.projectedBaseRev, delta: -res.decayLoss, type: 'neg' });
      steps.push({ label: 'Base Projetada\nSem Extra', start: 0, end: res.projectedBaseRev, delta: res.projectedBaseRev, type: 'subtotal' });
      steps.push({ label: 'Tráfego Extra\nNecessário', start: res.projectedBaseRev, end: res.projectedBaseRev + res.incrementalAdRevNeeded, delta: res.incrementalAdRevNeeded, type: 'pos' });
      steps.push({ label: 'Meta\nAno 2', start: 0, end: res.targetRev, delta: res.targetRev, type: 'target' });
    }

    const W = 760;
    const H = 265;
    const pad = { top: 34, right: 20, bottom: 52, left: 68 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const maxVal = Math.max(res.totalRev, res.targetRev, ...steps.map((s) => Math.max(s.start, s.end)), 1) * 1.12;
    const yScale = (v) => pad.top + plotH - (v / maxVal) * plotH;

    const colorMap = {
      base: DS.accentBright,
      subtotal: '#64748b',
      'neutral-neg': '#f59e0b',
      neg: DS.danger,
      pos: '#39bcff',
      target: '#6bd0ff',
    };

    const colW = plotW / steps.length;
    const barW = Math.min(82, colW * 0.56);

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico ponte de faturamento">`;

    for (let i = 0; i <= 4; i++) {
      const val = (maxVal / 4) * i;
      const y = yScale(val);
      svg += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${DS.border}" stroke-dasharray="3 4" />`;
      svg += `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="${DS.muted}" font-size="11" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCompactBRL(val)}</text>`;
    }

    steps.forEach((s, idx) => {
      const cx = pad.left + colW * idx + colW / 2;
      const x = cx - barW / 2;
      const yTop = yScale(Math.max(s.start, s.end));
      const yBot = yScale(Math.min(s.start, s.end));
      const h = Math.max(3, yBot - yTop);
      const fill = colorMap[s.type] || DS.accentBright;

      if (idx > 0) {
        const prev = steps[idx - 1];
        if (s.type !== 'subtotal') {
          const prevCx = pad.left + colW * (idx - 1) + colW / 2;
          const connY = yScale(prev.end);
          svg += `<line x1="${prevCx + barW / 2}" y1="${connY}" x2="${x}" y2="${connY}" stroke="#475c70" stroke-dasharray="3 3" stroke-width="1.2" />`;
        }
      }

      svg += `<rect x="${x}" y="${yTop}" width="${barW}" height="${h}" rx="6" fill="${fill}" fill-opacity="${s.type === 'target' ? '0.92' : '0.85'}" />`;

      const signPrefix = s.type === 'pos' ? '+' : '';
      const valText = `${signPrefix}${fmtCompactBRL(s.delta)}`;
      svg += `<text x="${cx}" y="${Math.max(16, yTop - 8)}" text-anchor="middle" fill="${s.type === 'neg' ? '#fda4af' : DS.text}" font-size="11.5" font-weight="700" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${valText}</text>`;

      const lines = s.label.split('\n');
      lines.forEach((line, li) => {
        svg += `<text x="${cx}" y="${H - pad.bottom + 18 + li * 14}" text-anchor="middle" fill="${DS.secondary}" font-size="11">${escapeHtml(line)}</text>`;
      });
    });

    svg += '</svg>';
    return svg;
  }

  function renderModelsBody(container) {
    const models = [
      { key: 'organic_decay', name: 'Base orgânica cai + renovação', badge: 'Conservador' },
      { key: 'total_decay', name: 'Operação inteira cai + extra', badge: 'Mais conservador' },
      { key: 'ltv_retention', name: 'Com retenção (LTV) Ano 1', badge: 'Otimista' },
    ];

    container.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th class="num">Adicional</th>
              <th class="num">Total/Ano</th>
              <th class="num">Total/Mês</th>
              <th class="num">Escala</th>
            </tr>
          </thead>
          <tbody>
            ${models.map((m) => {
              const r = computeModel(state.params, m.key);
              const active = state.params.model === m.key;
              const addSign = r.additionalSpend >= 0 ? '+' : '';
              return `
                <tr class="${active ? 'row-active' : ''}" data-select-model="${m.key}" style="cursor:pointer" title="Clique para ativar este modelo">
                  <td>
                    <div style="font-weight:600">${m.name}</div>
                    <span class="tag ${m.key === 'ltv_retention' ? 'tag-blue' : m.key === 'total_decay' ? 'tag-gold' : 'tag-green'}">${m.badge}</span>
                  </td>
                  <td class="num ${r.additionalSpend > 0 ? 'text-pos' : ''}">${addSign}${fmtBRL(r.additionalSpend)}</td>
                  <td class="num">${fmtBRL(r.requiredTotalSpend)}</td>
                  <td class="num">${fmtBRL(r.monthlyTotalSpend)}</td>
                  <td class="num">${fmtNum(r.spendMultiplier, 2)}x</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('tr[data-select-model]').forEach((row) => {
      row.addEventListener('click', () => {
        state.params.model = row.getAttribute('data-select-model');
        saveState();
        renderAll();
      });
    });
  }

  function renderSensitivityBody(container, res, levels) {
    const cleanLevels = (Array.isArray(levels) && levels.length > 0 ? levels : [70, 80, 90, 100, 110, 120])
      .map((n) => Math.max(20, Math.min(200, Number(n) || 100)));

    const rows = cleanLevels.map((eff) => {
      const diff = eff - 100;
      const label = diff === 0
        ? 'ROAS mantido (Atual)'
        : diff < 0
          ? `Queda de ROAS (${diff}%)`
          : `Melhora de ROAS (+${diff}%)`;
      const roas = res.baseRoas * (eff / 100);
      const calc = computeModel(state.params, state.params.model, roas);
      return { label, eff, roas, calc };
    });

    const W = 760;
    const H = 220;
    const pad = { top: 28, right: 20, bottom: 42, left: 68 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const maxSpend = Math.max(...rows.map((r) => r.calc.requiredTotalSpend), res.adSpend, 1) * 1.18;
    const yScale = (v) => pad.top + plotH - (v / maxSpend) * plotH;
    const colW = plotW / rows.length;
    const barW = Math.min(72, colW * 0.56);

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sensibilidade de investimento por ROAS">`;

    for (let i = 0; i <= 4; i++) {
      const v = (maxSpend / 4) * i;
      const y = yScale(v);
      svg += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${DS.border}" stroke-dasharray="3 4" />`;
      svg += `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="${DS.muted}" font-size="11" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCompactBRL(v)}</text>`;
    }

    rows.forEach((row, idx) => {
      const cx = pad.left + colW * idx + colW / 2;
      const x = cx - barW / 2;
      const isSelected = Math.abs(state.params.efficiencyPct - row.eff) <= 2;

      const totalSpend = row.calc.requiredTotalSpend;
      const basePart = Math.min(res.adSpend, totalSpend);
      const extraPart = Math.max(0, totalSpend - res.adSpend);

      const yBaseTop = yScale(basePart);
      const yBottom = yScale(0);
      const yTotalTop = yScale(totalSpend);

      svg += `<rect x="${x}" y="${yBaseTop}" width="${barW}" height="${Math.max(2, yBottom - yBaseTop)}" rx="3" fill="${DS.accentBright}" fill-opacity="0.85" />`;

      if (extraPart > 0) {
        const extraFill = isSelected ? '#6bd0ff' : (row.eff < 100 ? '#f59e0b' : '#39bcff');
        svg += `<rect x="${x}" y="${yTotalTop}" width="${barW}" height="${Math.max(2, yBaseTop - yTotalTop)}" rx="4" fill="${extraFill}" fill-opacity="${isSelected ? '0.98' : '0.78'}" />`;
      }

      if (isSelected) {
        svg += `<rect x="${x - 3}" y="${yTotalTop - 3}" width="${barW + 6}" height="${yBottom - yTotalTop + 6}" rx="6" fill="none" stroke="${DS.text}" stroke-width="1.5" stroke-dasharray="4 3" />`;
      }

      svg += `<text x="${cx}" y="${Math.max(15, yTotalTop - 8)}" text-anchor="middle" fill="${DS.text}" font-size="11" font-weight="700" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCompactBRL(totalSpend)}</text>`;
      svg += `<text x="${cx}" y="${H - pad.bottom + 17}" text-anchor="middle" fill="${isSelected ? '#6bd0ff' : DS.secondary}" font-size="11" font-weight="${isSelected ? '700' : '400'}">${fmtNum(row.roas, 2)}x</text>`;
      svg += `<text x="${cx}" y="${H - pad.bottom + 31}" text-anchor="middle" fill="${DS.muted}" font-size="10">${row.eff}%</text>`;
    });

    svg += `<rect x="${pad.left}" y="6" width="10" height="10" rx="2" fill="${DS.accentBright}" />`;
    svg += `<text x="${pad.left + 15}" y="15" fill="${DS.secondary}" font-size="11">Verba atual (${fmtCompactBRL(res.adSpend)})</text>`;
    svg += `<rect x="${pad.left + 175}" y="6" width="10" height="10" rx="2" fill="#39bcff" />`;
    svg += `<text x="${pad.left + 190}" y="15" fill="${DS.secondary}" font-size="11">Investimento adicional necessário</text>`;
    svg += '</svg>';

    container.innerHTML = `
      <div class="chart-box chart-box-sm">${svg}</div>
      <div class="table-wrap mt-12">
        <table class="data-table">
          <thead>
            <tr>
              <th>Cenário de ROAS</th>
              <th class="num">ROAS</th>
              <th class="num">Investimento Total</th>
              <th class="num">Investimento Adicional</th>
              <th class="num">Verba Mensal</th>
              <th class="num">Lucro Líq. Mídia</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const isSelected = Math.abs(state.params.efficiencyPct - row.eff) <= 2;
              const addSign = row.calc.additionalSpend >= 0 ? '+' : '';
              return `
                <tr class="${isSelected ? 'row-active' : ''}" data-set-eff="${row.eff}" style="cursor:pointer" title="Clique para simular este ROAS">
                  <td>
                    <strong>${row.label}</strong>
                    ${isSelected ? '<span class="tag tag-green" style="margin-left:6px">Selecionado</span>' : ''}
                  </td>
                  <td class="num">${fmtNum(row.roas, 2)}x</td>
                  <td class="num">${fmtBRL(row.calc.requiredTotalSpend)}</td>
                  <td class="num ${row.calc.additionalSpend > 0 ? 'text-pos' : ''}">${addSign}${fmtBRL(row.calc.additionalSpend)}</td>
                  <td class="num">${fmtBRL(row.calc.monthlyTotalSpend)}</td>
                  <td class="num">${fmtBRL(row.calc.netMediaContribution)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('tr[data-set-eff]').forEach((tr) => {
      tr.addEventListener('click', () => {
        state.params.efficiencyPct = Number(tr.getAttribute('data-set-eff'));
        saveState();
        renderAll();
      });
    });
  }

  // ==================== CUSTOM CHART RENDERERS (BAR / HBAR / LINE / DONUT) ====================
  function buildCustomChartHtml(chart) {
    const items = (chart.data || []).filter((d) => String(d.label || '').trim() !== '' || Number(d.value) > 0);
    if (items.length === 0) {
      return `<div class="chart-box chart-box-sm" style="display:grid;place-items:center;color:var(--text-dim)">Sem itens de dados. Clique em ✎ para adicionar.</div>`;
    }

    const type = chart.chartType || 'bar';
    const color = chart.color || '#39bcff';
    const format = chart.format || 'brl';

    if (type === 'donut') {
      return buildDonutChartHtml(items, format);
    }
    if (type === 'hbar') {
      return `<div class="chart-box chart-box-sm">${buildHBarSvg(items, color, format)}</div>`;
    }
    if (type === 'line' || type === 'area') {
      return `<div class="chart-box chart-box-sm">${buildLineSvg(items, color, format, type === 'area')}</div>`;
    }
    return `<div class="chart-box chart-box-sm">${buildVBarSvg(items, color, format)}</div>`;
  }

  function buildVBarSvg(items, color, format) {
    const W = 720;
    const H = 230;
    const pad = { top: 30, right: 20, bottom: 40, left: 68 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const maxVal = Math.max(...items.map((d) => Math.max(0, Number(d.value) || 0)), 1) * 1.16;
    const yScale = (v) => pad.top + plotH - (v / maxVal) * plotH;
    const colW = plotW / items.length;
    const barW = Math.min(72, colW * 0.58);

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    for (let i = 0; i <= 4; i++) {
      const val = (maxVal / 4) * i;
      const y = yScale(val);
      svg += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${DS.border}" stroke-dasharray="3 4" />`;
      svg += `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="${DS.muted}" font-size="11" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCustomVal(val, format, true)}</text>`;
    }

    items.forEach((item, idx) => {
      const val = Math.max(0, Number(item.value) || 0);
      const cx = pad.left + colW * idx + colW / 2;
      const x = cx - barW / 2;
      const y = yScale(val);
      const h = Math.max(3, yScale(0) - y);
      const shortLabel = String(item.label || '').slice(0, 14);

      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${color}" fill-opacity="0.86" />`;
      svg += `<text x="${cx}" y="${Math.max(15, y - 8)}" text-anchor="middle" fill="${DS.text}" font-size="11" font-weight="700" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCustomVal(val, format, true)}</text>`;
      svg += `<text x="${cx}" y="${H - 14}" text-anchor="middle" fill="${DS.secondary}" font-size="11">${escapeHtml(shortLabel)}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  function buildHBarSvg(items, color, format) {
    const rowH = 38;
    const pad = { top: 14, right: 86, bottom: 14, left: 136 };
    const W = 720;
    const H = Math.max(160, pad.top + pad.bottom + items.length * rowH);
    const plotW = W - pad.left - pad.right;
    const maxVal = Math.max(...items.map((d) => Math.max(0, Number(d.value) || 0)), 1);

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    items.forEach((item, idx) => {
      const val = Math.max(0, Number(item.value) || 0);
      const y = pad.top + idx * rowH;
      const barH = 22;
      const barW = Math.max(4, (val / maxVal) * plotW);
      const shortLabel = String(item.label || '').slice(0, 20);

      svg += `<text x="${pad.left - 10}" y="${y + 15}" text-anchor="end" fill="${DS.secondary}" font-size="11.5">${escapeHtml(shortLabel)}</text>`;
      svg += `<rect x="${pad.left}" y="${y}" width="${plotW}" height="${barH}" rx="5" fill="${DS.input}" />`;
      svg += `<rect x="${pad.left}" y="${y}" width="${barW}" height="${barH}" rx="5" fill="${color}" fill-opacity="0.86" />`;
      svg += `<text x="${pad.left + barW + 8}" y="${y + 15}" fill="${DS.text}" font-size="11" font-weight="700" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCustomVal(val, format, true)}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  function buildLineSvg(items, color, format, withArea = true) {
    const W = 720;
    const H = 230;
    const pad = { top: 30, right: 28, bottom: 38, left: 68 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const maxVal = Math.max(...items.map((d) => Math.max(0, Number(d.value) || 0)), 1) * 1.16;
    const xScale = (i) => items.length === 1 ? pad.left + plotW / 2 : pad.left + (plotW / (items.length - 1)) * i;
    const yScale = (v) => pad.top + plotH - (v / maxVal) * plotH;

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    for (let i = 0; i <= 4; i++) {
      const val = (maxVal / 4) * i;
      const y = yScale(val);
      svg += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${DS.border}" stroke-dasharray="3 4" />`;
      svg += `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="${DS.muted}" font-size="11" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCustomVal(val, format, true)}</text>`;
    }

    const pts = items.map((d, i) => ({
      x: xScale(i),
      y: yScale(Math.max(0, Number(d.value) || 0)),
      val: Math.max(0, Number(d.value) || 0),
      label: String(d.label || '').slice(0, 14),
    }));

    if (pts.length >= 2) {
      const lineStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
      if (withArea) {
        const areaStr = `${pts[0].x},${yScale(0)} ${lineStr} ${pts[pts.length - 1].x},${yScale(0)}`;
        svg += `<polygon points="${areaStr}" fill="${color}" fill-opacity="0.16" />`;
      }
      svg += `<polyline points="${lineStr}" fill="none" stroke="${color}" stroke-width="3" />`;
    }

    pts.forEach((p) => {
      svg += `<circle cx="${p.x}" cy="${p.y}" r="4.8" fill="${color}" stroke="${DS.board}" stroke-width="1.8" />`;
      svg += `<text x="${p.x}" y="${Math.max(15, p.y - 10)}" text-anchor="middle" fill="${DS.text}" font-size="11" font-weight="700" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCustomVal(p.val, format, true)}</text>`;
      svg += `<text x="${p.x}" y="${H - 12}" text-anchor="middle" fill="${DS.secondary}" font-size="11">${escapeHtml(p.label)}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  function buildDonutChartHtml(items, format) {
    const total = items.reduce((acc, d) => acc + Math.max(0, Number(d.value) || 0), 0) || 1;
    const cx = 95;
    const cy = 95;
    const r = 68;
    const circ = 2 * Math.PI * r;

    let offset = 0;
    let arcs = '';
    const legendRows = [];

    items.forEach((item, idx) => {
      const val = Math.max(0, Number(item.value) || 0);
      const pct = (val / total) * 100;
      const segLen = (val / total) * circ;
      const strokeColor = DONUT_PALETTE[idx % DONUT_PALETTE.length];

      arcs += `
        <circle
          cx="${cx}" cy="${cy}" r="${r}"
          fill="none"
          stroke="${strokeColor}"
          stroke-width="24"
          stroke-dasharray="${segLen} ${circ - segLen}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 ${cx} ${cy})"
        />
      `;
      offset += segLen;

      legendRows.push(`
        <div class="donut-legend-row">
          <div class="donut-legend-left">
            <span class="donut-dot" style="background:${strokeColor}"></span>
            <span>${escapeHtml(item.label || `Item ${idx + 1}`)}</span>
          </div>
          <span class="donut-legend-val">${fmtCustomVal(val, format, true)} (${fmtNum(pct, 1)}%)</span>
        </div>
      `);
    });

    const svg = `
      <svg viewBox="0 0 190 190" style="max-width:190px;margin:0 auto" role="img">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${DS.input}" stroke-width="24" />
        ${arcs}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${DS.muted}" font-size="10.5">Total</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="${DS.text}" font-size="13" font-weight="700" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCustomVal(total, format, true)}</text>
      </svg>
    `;

    return `
      <div class="donut-layout">
        <div>${svg}</div>
        <div class="donut-legend">${legendRows.join('')}</div>
      </div>
    `;
  }

  // ==================== MANAGE WIDGETS MODAL ====================
  function openManageModal() {
    renderManageList();
    document.getElementById('modalManage').hidden = false;
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  function renderManageList() {
    const list = document.getElementById('manageWidgetsList');
    list.innerHTML = state.widgets.map((w, idx) => `
      <div class="manage-item ${w.visible ? '' : 'is-hidden'}" data-m-id="${w.id}">
        <div class="manage-item-left">
          <input type="checkbox" data-m-toggle="${w.id}" ${w.visible ? 'checked' : ''} aria-label="Exibir ${escapeHtml(w.title)}" />
          <div class="manage-item-info">
            <strong>
              ${escapeHtml(w.title)}
              <span class="tag ${w.kind === 'custom' ? 'tag-blue' : 'tag-green'}">${w.kind === 'custom' ? 'Personalizado' : 'Padrão'}</span>
            </strong>
            <span>${escapeHtml(w.subtitle || (w.width === 'half' ? 'Meia largura' : 'Largura total'))}</span>
          </div>
        </div>
        <div class="manage-item-controls">
          <button type="button" class="icon-btn" data-m-act="up" title="Subir" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn" data-m-act="down" title="Descer" ${idx === state.widgets.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn" data-m-act="width" title="Alternar largura (100% / 50%)">${w.width === 'half' ? '½' : '1'}</button>
          <button type="button" class="icon-btn" data-m-act="edit" title="Editar">✎</button>
          ${w.kind === 'custom' ? `<button type="button" class="icon-btn icon-btn-danger" data-m-act="delete" title="Excluir gráfico">🗑</button>` : ''}
        </div>
      </div>
    `).join('');

    list.querySelectorAll('input[data-m-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-m-toggle');
        const w = state.widgets.find((item) => item.id === id);
        if (w) {
          w.visible = cb.checked;
          saveState();
          renderAll();
          renderManageList();
        }
      });
    });

    list.querySelectorAll('.manage-item').forEach((row) => {
      const id = row.getAttribute('data-m-id');
      row.querySelectorAll('[data-m-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-m-act');
          if (act === 'up') moveWidgetAbsolute(id, -1);
          if (act === 'down') moveWidgetAbsolute(id, 1);
          if (act === 'width') {
            toggleWidgetWidth(id);
            renderManageList();
          }
          if (act === 'edit') {
            closeModal('modalManage');
            openChartEditor(id);
          }
          if (act === 'delete') {
            deleteCustomWidget(id);
            renderManageList();
          }
        });
      });
    });
  }

  // ==================== CHART BUILDER / EDITOR MODAL ====================
  const CHART_TEMPLATES = {
    invest_return: {
      title: 'Investimento vs Retorno (Tráfego Pago)',
      subtitle: 'Comparativo entre a verba aplicada e o rake gerado no ano atual e na meta',
      chartType: 'bar',
      format: 'brl',
      color: '#39bcff',
      data: [
        { label: 'Invest. Atual', value: 42831 },
        { label: 'Rake Atual', value: 166730 },
        { label: 'Invest. Ano 2', value: 188536 },
        { label: 'Rake Ano 2', value: 733922 },
      ],
    },
    quarterly: {
      title: 'Metas Trimestrais de Rake',
      subtitle: 'Distribuição da meta de R$ 3,5M ao longo dos 4 trimestres',
      chartType: 'bar',
      format: 'brl',
      color: DS.accentBright,
      data: [
        { label: '1º Tri', value: 820000 },
        { label: '2º Tri', value: 860000 },
        { label: '3º Tri', value: 900000 },
        { label: '4º Tri', value: 920000 },
      ],
    },
    channels: {
      title: 'Participação por Origem do Rake',
      subtitle: 'Divisão entre base orgânica e tráfego pago projetado para a meta',
      chartType: 'donut',
      format: 'brl',
      color: '#39bcff',
      data: [
        { label: 'Base Orgânica', value: 2766078 },
        { label: 'Tráfego Pago (Meta Ano 2)', value: 733922 },
      ],
    },
    multi_year: {
      title: 'Projeção de Faturamento (3 Anos)',
      subtitle: 'Evolução anual de rake com expansão gradual de tráfego pago',
      chartType: 'line',
      format: 'brl',
      color: '#f59e0b',
      data: [
        { label: 'Ano Atual', value: 3310000 },
        { label: 'Ano 2 (Meta)', value: 3500000 },
        { label: 'Ano 3 (Alvo)', value: 3900000 },
        { label: 'Ano 4 (Alvo)', value: 4400000 },
      ],
    },
  };

  function openChartEditor(widgetId) {
    const existing = widgetId ? state.widgets.find((w) => w.id === widgetId) : null;

    if (!existing) {
      // Creating a brand-new custom chart
      editorDraft = {
        isNew: true,
        id: `custom_${Date.now()}`,
        kind: 'custom',
        title: 'Novo Gráfico',
        subtitle: 'Personalize os itens abaixo conforme a sua operação',
        visible: true,
        width: 'full',
        chartType: 'bar',
        format: 'brl',
        color: '#39bcff',
        data: [
          { label: 'Item 1', value: 150000 },
          { label: 'Item 2', value: 240000 },
          { label: 'Item 3', value: 310000 },
        ],
      };
    } else {
      editorDraft = JSON.parse(JSON.stringify(existing));
      editorDraft.isNew = false;
    }

    const isCustom = editorDraft.kind === 'custom';
    const isSensitivity = editorDraft.builtinType === 'sensitivity';

    document.getElementById('modalEditorTitle').textContent = editorDraft.isNew
      ? 'Adicionar Novo Gráfico'
      : `Editar: ${editorDraft.title}`;
    document.getElementById('modalEditorSubtitle').textContent = isCustom
      ? 'Escolha o tipo de gráfico, formato, cor e os dados que deseja exibir'
      : 'Personalize título, subtítulo, largura e parâmetros deste bloco';

    document.getElementById('editorTemplatesBar').hidden = !isCustom;
    document.getElementById('edCustomSection').hidden = !isCustom;
    document.getElementById('edPreviewSection').hidden = !isCustom;
    document.getElementById('edSensitivitySection').hidden = !isSensitivity;
    document.getElementById('btnDeleteWidgetInModal').hidden = !(isCustom && !editorDraft.isNew);

    document.getElementById('edTitle').value = editorDraft.title || '';
    document.getElementById('edSubtitle').value = editorDraft.subtitle || '';
    document.getElementById('edWidth').value = editorDraft.width === 'half' ? 'half' : 'full';

    if (isSensitivity) {
      const lvls = Array.isArray(editorDraft.levels) ? editorDraft.levels : [70, 80, 90, 100, 110, 120];
      document.getElementById('edSensitivityLevels').value = lvls.join(', ');
    }

    if (isCustom) {
      document.getElementById('edChartType').value = editorDraft.chartType || 'bar';
      document.getElementById('edFormat').value = editorDraft.format || 'brl';
      syncColorSwatches(editorDraft.color || '#39bcff');
      renderEditorDataRows();
      updateEditorPreview();
    }

    document.getElementById('modalChartEditor').hidden = false;
  }

  function syncColorSwatches(selectedColor) {
    document.querySelectorAll('#edColorSwatches .swatch').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-color') === selectedColor);
    });
  }

  function renderEditorDataRows() {
    const container = document.getElementById('edDataRows');
    const rows = editorDraft.data || [];

    container.innerHTML = rows.map((row, idx) => `
      <div class="data-row-item" data-row-idx="${idx}">
        <input type="text" class="text-input" data-dr-field="label" value="${escapeHtml(row.label)}" placeholder="Nome / Rótulo" />
        <input type="number" step="any" data-dr-field="value" value="${row.value}" placeholder="Valor" />
        <button type="button" class="icon-btn icon-btn-danger" data-dr-remove="${idx}" title="Remover item" ${rows.length <= 1 ? 'disabled' : ''}>✕</button>
      </div>
    `).join('');

    container.querySelectorAll('.data-row-item').forEach((el) => {
      const idx = Number(el.getAttribute('data-row-idx'));
      el.querySelector('[data-dr-field="label"]').addEventListener('input', (e) => {
        editorDraft.data[idx].label = e.target.value;
        updateEditorPreview();
      });
      el.querySelector('[data-dr-field="value"]').addEventListener('input', (e) => {
        editorDraft.data[idx].value = Number(e.target.value) || 0;
        updateEditorPreview();
      });
      el.querySelector('[data-dr-remove]').addEventListener('click', () => {
        if (editorDraft.data.length > 1) {
          editorDraft.data.splice(idx, 1);
          renderEditorDataRows();
          updateEditorPreview();
        }
      });
    });
  }

  function updateEditorPreview() {
    if (!editorDraft || editorDraft.kind !== 'custom') return;
    document.getElementById('edPreviewChart').innerHTML = buildCustomChartHtml(editorDraft);
  }

  function saveChartEditor() {
    if (!editorDraft) return;

    editorDraft.title = (document.getElementById('edTitle').value || '').trim() || 'Gráfico sem título';
    editorDraft.subtitle = (document.getElementById('edSubtitle').value || '').trim();
    editorDraft.width = document.getElementById('edWidth').value === 'half' ? 'half' : 'full';

    if (editorDraft.builtinType === 'sensitivity') {
      const raw = document.getElementById('edSensitivityLevels').value || '';
      const parsed = raw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 20 && n <= 200);
      if (parsed.length > 0) {
        editorDraft.levels = parsed;
      }
    }

    const toStore = { ...editorDraft };
    delete toStore.isNew;

    if (editorDraft.isNew) {
      state.widgets.push(toStore);
    } else {
      const idx = state.widgets.findIndex((w) => w.id === toStore.id);
      if (idx >= 0) {
        state.widgets[idx] = toStore;
      }
    }

    saveState();
    closeModal('modalChartEditor');
    editorDraft = null;
    renderAll();
  }

  // ==================== TAB 2: SEASONAL INVESTMENT PROJECTION ====================
  function getDaysInMonth(year, monthIdx) {
    return new Date(year, monthIdx + 1, 0).getDate();
  }

  function computeSeasonality(res) {
    const sea = state.seasonality || createDefaultSeasonality();
    const intensity = Math.min(200, Math.max(0, Number(sea.intensity) || 0));
    const trackerYear = Number(state.trackerYear) || DEFAULT_TRACKER_YEAR;
    const calWeeks = getCalendarWeeksForYear(trackerYear);

    const totalBudget = Math.max(0, res.requiredTotalSpend);
    const totalAdRev = Math.max(0, res.requiredAdRevTotal);
    const linearMonthly = totalBudget / 12;

    const rawRakes = sea.months.map((m) => Math.max(0, Number(m.rake) || 0));
    const sumRawRake = rawRakes.reduce((a, b) => a + b, 0);
    const avgRawRake = sumRawRake > 0 ? sumRawRake / 12 : 1;

    const rawWeights = rawRakes.map((val) => {
      const rawIdx = sumRawRake > 0 ? val / avgRawRake : 1;
      return Math.max(0.05, 1 + (rawIdx - 1) * (intensity / 100));
    });
    const sumWeights = rawWeights.reduce((a, b) => a + b, 0) || 12;

    const months = MONTHS.map((name, idx) => {
      const entry = sea.months[idx] || DEFAULT_SEASONALITY_CURVE[idx];
      const rawRake = rawRakes[idx];
      const share = rawWeights[idx] / sumWeights;
      const budget = totalBudget * share;
      const numWeeks = calWeeks[idx].length || 4;
      const days = getDaysInMonth(trackerYear, idx);
      const weeklyBudget = budget / numWeeks;
      const dailyBudget = budget / days;
      const expectedAdRev = totalAdRev * share;
      const vsLinear = budget - linearMonthly;
      const indexPct = (share * 12 - 1) * 100;

      let tier = { label: 'Média', cls: 'badge', color: DS.accentBright };
      if (indexPct >= 10) tier = { label: 'Pico Série', cls: 'tag tag-green', color: DS.accent };
      else if (indexPct >= 3) tier = { label: 'Alta', cls: 'tag tag-blue', color: DS.accentBright };
      else if (indexPct <= -10) tier = { label: 'Baixa', cls: 'tag tag-red', color: DS.danger };
      else if (indexPct <= -3) tier = { label: 'Moderada', cls: 'tag tag-gold', color: DS.gold };

      return {
        idx,
        name,
        rawRake,
        note: entry.note || '',
        share,
        indexPct,
        budget,
        numWeeks,
        days,
        weeklyBudget,
        dailyBudget,
        expectedAdRev,
        vsLinear,
        tier,
      };
    });

    const sortedByBudget = [...months].sort((a, b) => b.budget - a.budget);
    const peak = sortedByBudget[0];
    const low = sortedByBudget[sortedByBudget.length - 1];
    const sortedByDaily = [...months].sort((a, b) => a.dailyBudget - b.dailyBudget);

    return {
      intensity,
      syncTracker: Boolean(sea.syncTracker),
      totalBudget,
      totalAdRev,
      linearMonthly,
      sumRawRake,
      months,
      peak,
      low,
      minDaily: sortedByDaily[0]?.dailyBudget || 0,
      maxDaily: sortedByDaily[sortedByDaily.length - 1]?.dailyBudget || 0,
      avgDaily: totalBudget / (getDaysInMonth(trackerYear, 1) === 29 ? 366 : 365),
    };
  }

  function renderSeasonality(res) {
    const sea = computeSeasonality(res);

    // Sync controls
    const slider = document.getElementById('sliderSeasonalityIntensity');
    if (slider && document.activeElement !== slider) slider.value = sea.intensity;
    const chk = document.getElementById('chkSyncSeasonalTracker');
    if (chk) chk.checked = sea.syncTracker;

    const intensityDesc = sea.intensity === 0
      ? '0% (Linear)'
      : sea.intensity === 100
        ? '100% (Proporcional)'
        : sea.intensity > 100
          ? `${sea.intensity}% (Agressivo em séries)`
          : `${sea.intensity}% (Suavizado)`;
    document.getElementById('labelSeasonalityIntensity').textContent = intensityDesc;

    const ratio = sea.low.budget > 0 ? sea.peak.budget / sea.low.budget : 1;
    document.getElementById('pillSeasonalAmplitude').textContent =
      `Pico ${fmtNum(ratio, 2)}x maior que o vale (${sea.peak.name} vs ${sea.low.name})`;

    const seaView = (state.seasonality && state.seasonality.chartView) || 'combo';
    document.querySelectorAll('[data-sea-chart-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-sea-chart-view') === seaView);
    });

    renderSeasonalityChart(sea);
    renderSeasonalityTable(sea);
    renderAllKpis(res);
  }

  function renderSeasonalityChart(sea) {
    const container = document.getElementById('chartSeasonality');
    const view = (state.seasonality && state.seasonality.chartView) || 'combo';
    const showBars = view === 'combo' || view === 'bars';
    const showBudgetLine = view === 'line' || view === 'area';
    const showArea = view === 'area';
    const showHistory = view === 'combo' || view === 'line' || view === 'area';

    const W = 920;
    const H = 290;
    const pad = { top: 36, right: 72, bottom: 42, left: 72 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const maxBudget = Math.max(...sea.months.map((m) => m.budget), sea.linearMonthly, 1) * 1.18;
    const maxRake = Math.max(...sea.months.map((m) => m.rawRake), 1) * 1.18;

    const yBudget = (v) => pad.top + plotH - (v / maxBudget) * plotH;
    const yRake = (v) => pad.top + plotH - (v / maxRake) * plotH;
    const colW = plotW / 12;
    const barW = Math.min(44, colW * 0.58);

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva sazonal de investimento e rake">`;

    for (let i = 0; i <= 4; i++) {
      const bVal = (maxBudget / 4) * i;
      const rVal = (maxRake / 4) * i;
      const y = yBudget(bVal);
      svg += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${DS.border}" stroke-dasharray="3 4" />`;
      svg += `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="${DS.muted}" font-size="10.5" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCompactBRL(bVal)}</text>`;
      svg += `<text x="${W - pad.right + 10}" y="${y + 4}" text-anchor="start" fill="${DS.gold}" fill-opacity="0.8" font-size="10" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCompactBRL(rVal)}</text>`;
    }

    const yLin = yBudget(sea.linearMonthly);
    svg += `<line x1="${pad.left}" y1="${yLin}" x2="${W - pad.right}" y2="${yLin}" stroke="${DS.accentBright}" stroke-width="1.5" stroke-dasharray="6 4" stroke-opacity="0.75" />`;

    const budgetPts = [];
    const rakePts = [];
    sea.months.forEach((m, idx) => {
      const cx = pad.left + colW * idx + colW / 2;
      const x = cx - barW / 2;
      const yTop = yBudget(m.budget);
      const h = Math.max(3, yBudget(0) - yTop);
      budgetPts.push({ x: cx, y: yTop, m });
      rakePts.push({ x: cx, y: yRake(m.rawRake), m });

      if (showBars) {
        const fill = m.indexPct <= -10 ? DS.danger : m.indexPct >= 10 ? DS.accent : DS.accentBright;
        svg += `<rect x="${x}" y="${yTop}" width="${barW}" height="${h}" rx="5" fill="${fill}" fill-opacity="0.82"><title>${m.name}: Orçamento ${fmtBRL(m.budget)} (${m.indexPct >= 0 ? '+' : ''}${fmtNum(m.indexPct, 1)}%) | Rake base: ${fmtBRL(m.rawRake, 2)}</title></rect>`;
        svg += `<text x="${cx}" y="${Math.max(22, yTop - 7)}" text-anchor="middle" fill="${DS.text}" font-size="10" font-weight="700" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCompactBRL(m.budget)}</text>`;
      }

      svg += `<text x="${cx}" y="${H - 14}" text-anchor="middle" fill="${DS.secondary}" font-size="11">${m.name}</text>`;
    });

    if (showArea && budgetPts.length >= 2) {
      const lineStr = budgetPts.map((p) => `${p.x},${p.y}`).join(' ');
      const areaStr = `${budgetPts[0].x},${yBudget(0)} ${lineStr} ${budgetPts[budgetPts.length - 1].x},${yBudget(0)}`;
      svg += `<polygon points="${areaStr}" fill="${DS.accent}" fill-opacity="0.18" />`;
    }

    if (showBudgetLine && budgetPts.length >= 2) {
      const lineStr = budgetPts.map((p) => `${p.x},${p.y}`).join(' ');
      svg += `<polyline points="${lineStr}" fill="none" stroke="${DS.accent}" stroke-width="2.8" />`;
      budgetPts.forEach((p) => {
        svg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${DS.accentBright}" stroke="${DS.board}" stroke-width="1.4"><title>${p.m.name}: ${fmtBRL(p.m.budget)}</title></circle>`;
        if (!showBars) {
          svg += `<text x="${p.x}" y="${Math.max(22, p.y - 9)}" text-anchor="middle" fill="${DS.text}" font-size="10" font-weight="700" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCompactBRL(p.m.budget)}</text>`;
        }
      });
    }

    if (showHistory) {
      const lineStr = rakePts.map((p) => `${p.x},${p.y}`).join(' ');
      svg += `<polyline points="${lineStr}" fill="none" stroke="${DS.gold}" stroke-width="2.4" />`;
      rakePts.forEach((p) => {
        svg += `<rect x="${p.x - 3.5}" y="${p.y - 3.5}" width="7" height="7" rx="1.5" fill="${DS.gold}" stroke="${DS.board}" stroke-width="1.2"><title>${p.m.name} — Rake histórico: ${fmtBRL(p.m.rawRake, 2)}</title></rect>`;
      });
    }

    let legendX = pad.left;
    if (showBars || showBudgetLine || showArea) {
      svg += `<rect x="${legendX}" y="8" width="10" height="10" rx="2" fill="${DS.accent}" />`;
      svg += `<text x="${legendX + 15}" y="17" fill="${DS.secondary}" font-size="11">Orçamento Mensal Projetado</text>`;
      legendX += 210;
    }
    if (showHistory) {
      svg += `<line x1="${legendX}" y1="13" x2="${legendX + 20}" y2="13" stroke="${DS.gold}" stroke-width="2.4" />`;
      svg += `<text x="${legendX + 26}" y="17" fill="${DS.secondary}" font-size="11">Curva Histórica de Rake</text>`;
      legendX += 190;
    }
    svg += `<line x1="${legendX}" y1="13" x2="${legendX + 20}" y2="13" stroke="${DS.accentBright}" stroke-width="1.6" stroke-dasharray="5 3" />`;
    svg += `<text x="${legendX + 26}" y="17" fill="${DS.secondary}" font-size="11">Média linear (${fmtCompactBRL(sea.linearMonthly)})</text>`;

    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderSeasonalityTable(sea) {
    const tbody = document.querySelector('#tableSeasonality tbody');
    const tfoot = document.querySelector('#tableSeasonality tfoot');

    if (tbody.children.length !== 12) {
      tbody.innerHTML = sea.months.map((m) => `
        <tr data-sea-row="${m.idx}">
          <td>
            <div class="month-cell-stack">
              <strong>${m.name}</strong>
              <span data-sea-col="tier"></span>
            </div>
          </td>
          <td><input type="text" class="note-input" data-sea-m="${m.idx}" data-sea-field="note" placeholder="Ex: Série..." /></td>
          <td class="num"><input type="number" class="tracker-input" data-sea-m="${m.idx}" data-sea-field="rake" min="0" step="100" /></td>
          <td class="num" data-sea-col="indexPct"></td>
          <td class="num" data-sea-col="share"></td>
          <td class="num budget-highlight" data-sea-col="budget"></td>
          <td class="num" data-sea-col="weeklyBudget"></td>
          <td class="num" data-sea-col="dailyBudget"></td>
          <td class="num" data-sea-col="expectedAdRev"></td>
          <td class="num" data-sea-col="vsLinear"></td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-sea-m]').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const idx = Number(e.target.getAttribute('data-sea-m'));
          const field = e.target.getAttribute('data-sea-field');
          if (field === 'rake') {
            state.seasonality.months[idx].rake = Math.max(0, Number(e.target.value) || 0);
          } else {
            state.seasonality.months[idx].note = e.target.value;
          }
          saveState();
          const currentRes = computeModel(state.params);
          renderSeasonality(currentRes);
          if (state.seasonality.syncTracker) {
            renderTracker(currentRes);
          }
        });
      });
    }

    sea.months.forEach((m) => {
      const tr = tbody.querySelector(`tr[data-sea-row="${m.idx}"]`);
      if (!tr) return;

      const tierEl = tr.querySelector('[data-sea-col="tier"]');
      tierEl.textContent = m.tier.label;
      tierEl.className = m.tier.cls;

      const noteInp = tr.querySelector('input[data-sea-field="note"]');
      if (noteInp && document.activeElement !== noteInp) noteInp.value = m.note;

      const rakeInp = tr.querySelector('input[data-sea-field="rake"]');
      if (rakeInp && document.activeElement !== rakeInp) rakeInp.value = Number(m.rawRake.toFixed(2));

      const idxSign = m.indexPct >= 0 ? '+' : '';
      const idxEl = tr.querySelector('[data-sea-col="indexPct"]');
      idxEl.textContent = `${idxSign}${fmtNum(m.indexPct, 1)}%`;
      idxEl.className = `num ${m.indexPct >= 3 ? 'text-pos' : m.indexPct <= -3 ? 'text-neg' : 'text-muted'}`;

      tr.querySelector('[data-sea-col="share"]').textContent = `${fmtNum(m.share * 100, 1)}%`;
      tr.querySelector('[data-sea-col="budget"]').textContent = fmtBRL(m.budget);
      tr.querySelector('[data-sea-col="weeklyBudget"]').innerHTML = `${fmtBRL(m.weeklyBudget)}<span class="diff-sub">${m.numWeeks} sem</span>`;
      tr.querySelector('[data-sea-col="dailyBudget"]').textContent = fmtBRL(m.dailyBudget);
      tr.querySelector('[data-sea-col="expectedAdRev"]').textContent = fmtBRL(m.expectedAdRev);

      const linSign = m.vsLinear >= 0 ? '+' : '';
      const linEl = tr.querySelector('[data-sea-col="vsLinear"]');
      linEl.textContent = `${linSign}${fmtBRL(m.vsLinear)}`;
      linEl.className = `num ${m.vsLinear >= 0 ? 'text-pos' : 'text-neg'}`;
    });

    tfoot.innerHTML = `
      <tr>
        <td colspan="2">Total Anual</td>
        <td class="num">${fmtBRL(sea.sumRawRake)}</td>
        <td class="num text-muted">100%</td>
        <td class="num">100,0%</td>
        <td class="num budget-highlight">${fmtBRL(sea.totalBudget)}</td>
        <td class="num">${fmtBRL(sea.totalBudget / 52)}</td>
        <td class="num">${fmtBRL(sea.avgDaily)}</td>
        <td class="num">${fmtBRL(sea.totalAdRev)}</td>
        <td class="num text-muted">R$ 0</td>
      </tr>
    `;
  }

  function exportSeasonalityCsv() {
    const res = computeModel(state.params);
    const sea = computeSeasonality(res);
    const lines = [
      'Mes;Serie_Nota;Rake_Historico_Base;Indice_Pct;Participacao_Ano_Pct;Orcamento_Mes;Semanas;Verba_Semanal;Verba_Diaria;Rake_Esperado_Trafego;Diferenca_vs_Linear',
    ];

    sea.months.forEach((m) => {
      lines.push([
        m.name,
        String(m.note || '').replace(/;/g, ','),
        m.rawRake.toFixed(2).replace('.', ','),
        m.indexPct.toFixed(1).replace('.', ','),
        (m.share * 100).toFixed(2).replace('.', ','),
        m.budget.toFixed(2).replace('.', ','),
        m.numWeeks,
        m.weeklyBudget.toFixed(2).replace('.', ','),
        m.dailyBudget.toFixed(2).replace('.', ','),
        m.expectedAdRev.toFixed(2).replace('.', ','),
        m.vsLinear.toFixed(2).replace('.', ','),
      ].join(';'));
    });

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projecao-sazonal-investimento-${state.trackerYear}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==================== TAB 3: WEEKLY / MONTHLY TRACKER ====================
  function computeTrackerData(res) {
    const trackerYear = Number(state.trackerYear) || DEFAULT_TRACKER_YEAR;
    const calWeeks = getCalendarWeeksForYear(trackerYear);
    const totalYearWeeks = calWeeks.reduce((sum, arr) => sum + arr.length, 0) || 52;
    const weeklyTargetSpendFlat = res.requiredTotalSpend / totalYearWeeks;
    const weeklyTargetRevFlat = res.targetRev / totalYearWeeks;
    const weeklyExpectedOrganic = (res.targetRev - res.requiredAdRevTotal) / totalYearWeeks;

    const useSeasonal = Boolean(state.seasonality && state.seasonality.syncTracker);
    const sea = useSeasonal ? computeSeasonality(res) : null;

    let cumRealSpend = 0;
    let cumRealAdRev = 0;
    let cumRealOrganic = 0;
    let cumRealTotal = 0;
    let filledWeeksTotal = 0;
    let expectedToDate = 0;
    let cumTargetWeekRunning = 0;
    let globalWeekIdx = 0;

    const allWeeksFlat = [];

    const monthsData = MONTHS.map((name, mIdx) => {
      const weekRanges = calWeeks[mIdx];
      const mObj = state.monthly[mIdx] || { weeks: weekRanges.map(() => createEmptyWeek()) };
      const numWeeks = weekRanges.length;

      const monthTargetSpend = useSeasonal
        ? sea.months[mIdx].budget
        : weeklyTargetSpendFlat * numWeeks;
      const monthTargetRev = useSeasonal
        ? sea.months[mIdx].expectedAdRev + weeklyExpectedOrganic * numWeeks
        : weeklyTargetRevFlat * numWeeks;
      const weekTargetSpend = monthTargetSpend / numWeeks;
      const weekTargetRev = monthTargetRev / numWeeks;

      let mSpend = 0;
      let mAdRev = 0;
      let mOrg = 0;
      let mTotal = 0;
      let mFilledWeeks = 0;

      const weeksComputed = weekRanges.map((dateRange, wIdx) => {
        const w = mObj.weeks[wIdx] || createEmptyWeek();
        const hasAny = w.spend !== '' || w.adRev !== '' || w.organicRev !== '';
        const spend = w.spend === '' ? 0 : Math.max(0, Number(w.spend) || 0);
        const adRev = w.adRev === '' ? 0 : Math.max(0, Number(w.adRev) || 0);
        const organicRev = w.organicRev === '' ? 0 : Math.max(0, Number(w.organicRev) || 0);
        const totalReal = adRev + organicRev;

        cumTargetWeekRunning += weekTargetRev;

        if (hasAny) {
          filledWeeksTotal++;
          mFilledWeeks++;
          expectedToDate += weekTargetRev;
          mSpend += spend;
          mAdRev += adRev;
          mOrg += organicRev;
          mTotal += totalReal;
          cumRealSpend += spend;
          cumRealAdRev += adRev;
          cumRealOrganic += organicRev;
          cumRealTotal += totalReal;
        }

        const weekRoas = spend > 0 ? adRev / spend : null;
        const weekDiff = hasAny ? totalReal - weekTargetRev : null;

        const wInfo = {
          mIdx,
          wIdx,
          globalIdx: globalWeekIdx++,
          monthName: name,
          dateRange,
          label: `${name} S${wIdx + 1} (${dateRange})`,
          entry: w,
          hasAny,
          spend,
          adRev,
          organicRev,
          totalReal,
          weekRoas,
          weekDiff,
          metaSpend: weekTargetSpend,
          metaRev: weekTargetRev,
          cumTarget: cumTargetWeekRunning,
          cumReal: hasAny ? cumRealTotal : null,
        };
        allWeeksFlat.push(wInfo);
        return wInfo;
      });

      const monthRoas = mSpend > 0 ? mAdRev / mSpend : null;
      const proratedTargetRev = weekTargetRev * mFilledWeeks;
      const monthDiff = mFilledWeeks > 0 ? mTotal - proratedTargetRev : null;

      return {
        idx: mIdx,
        name,
        numWeeks,
        filledWeeks: mFilledWeeks,
        hasAny: mFilledWeeks > 0,
        metaSpend: monthTargetSpend,
        metaRev: monthTargetRev,
        spend: mSpend,
        adRev: mAdRev,
        organicRev: mOrg,
        totalReal: mTotal,
        monthRoas,
        diffVsTarget: monthDiff,
        isPartial: mFilledWeeks > 0 && mFilledWeeks < numWeeks,
        cumTarget: cumTargetWeekRunning,
        cumReal: mFilledWeeks > 0 ? cumRealTotal : null,
        weeks: weeksComputed,
      };
    });

    const realRoas = cumRealSpend > 0 ? cumRealAdRev / cumRealSpend : null;

    return {
      trackerYear,
      spanLabel: calWeeks.spanLabel || String(trackerYear),
      totalYearWeeks,
      weeklyTargetSpend: weeklyTargetSpendFlat,
      weeklyTargetRev: weeklyTargetRevFlat,
      weeklyExpectedOrganic,
      monthsData,
      allWeeksFlat,
      totals: {
        cumRealSpend,
        cumRealAdRev,
        cumRealOrganic,
        cumRealTotal,
        expectedToDate,
        realRoas,
        filledWeeksTotal,
      },
    };
  }

  function renderTracker(res) {
    const data = computeTrackerData(res);
    const { trackerYear, spanLabel, weeklyTargetRev, monthsData, allWeeksFlat, totals } = data;

    const yearLabelEl = document.getElementById('labelTrackerYear');
    if (yearLabelEl) yearLabelEl.textContent = `${trackerYear} · ${spanLabel}`;
    const yearSelectEl = document.getElementById('selectTrackerYear');
    if (yearSelectEl && yearSelectEl.value !== String(trackerYear)) {
      yearSelectEl.value = String(trackerYear);
    }

    renderWeeklyAccordionTable(monthsData, weeklyTargetRev, res, totals);
    renderTrackerChart(monthsData, allWeeksFlat, res.targetRev);
    renderAllKpis(res);
  }

  function renderWeeklyAccordionTable(monthsData, weeklyTargetRev, res, totals) {
    const tbody = document.querySelector('#tableMonthly tbody');
    const tfoot = document.querySelector('#tableMonthly tfoot');

    const sig = `${state.trackerYear}|` + monthsData
      .map((m) => `${m.idx}:${expandedMonths.has(m.idx) ? 1 : 0}:${m.numWeeks}`)
      .join('|');

    if (sig !== lastTrackerStructureSig || tbody.children.length === 0) {
      lastTrackerStructureSig = sig;
      const htmlParts = [];

      monthsData.forEach((m) => {
        const isOpen = expandedMonths.has(m.idx);
        htmlParts.push(`
          <tr class="month-row ${isOpen ? 'is-expanded' : ''}" data-m-row="${m.idx}" title="Clique para abrir ou fechar as semanas de ${m.name}">
            <td>
              <div class="month-toggle-cell">
                <span class="chevron" aria-hidden="true">▸</span>
                <strong>${m.name}</strong>
                <span class="week-progress-pill" data-m-col="weekPill"></span>
              </div>
            </td>
            <td class="num text-muted" data-m-col="metaSpend"></td>
            <td class="num text-muted" data-m-col="metaRev"></td>
            <td class="num" data-m-col="spend"></td>
            <td class="num" data-m-col="adRev"></td>
            <td class="num" data-m-col="organicRev"></td>
            <td class="num" data-m-col="totalReal"></td>
            <td class="num" data-m-col="roas"></td>
            <td class="num" data-m-col="diff"></td>
          </tr>
        `);

        if (isOpen) {
          m.weeks.forEach((w) => {
            htmlParts.push(`
              <tr class="week-row" data-w-row="${m.idx}-${w.wIdx}">
                <td>
                  <div class="week-label-cell">
                    <span class="week-branch">└</span>
                    <span>Sem ${w.wIdx + 1}</span>
                    <span class="week-date-pill">${w.dateRange}</span>
                  </div>
                </td>
                <td class="num text-muted" data-w-col="metaSpend"></td>
                <td class="num text-muted" data-w-col="metaRev"></td>
                <td class="num"><input type="number" class="tracker-input" data-m="${m.idx}" data-w="${w.wIdx}" data-field="spend" min="0" step="100" placeholder="0" /></td>
                <td class="num"><input type="number" class="tracker-input" data-m="${m.idx}" data-w="${w.wIdx}" data-field="adRev" min="0" step="100" placeholder="0" /></td>
                <td class="num"><input type="number" class="tracker-input" data-m="${m.idx}" data-w="${w.wIdx}" data-field="organicRev" min="0" step="1000" placeholder="0" /></td>
                <td class="num" data-w-col="totalReal"></td>
                <td class="num" data-w-col="roas"></td>
                <td class="num" data-w-col="diff"></td>
              </tr>
            `);
          });
        }
      });

      tbody.innerHTML = htmlParts.join('');

      // Wire month toggle clicks
      tbody.querySelectorAll('tr.month-row').forEach((tr) => {
        tr.addEventListener('click', () => {
          const mIdx = Number(tr.getAttribute('data-m-row'));
          if (expandedMonths.has(mIdx)) {
            expandedMonths.delete(mIdx);
          } else {
            expandedMonths.add(mIdx);
          }
          renderTracker(computeModel(state.params));
        });
      });

      // Wire weekly inputs
      tbody.querySelectorAll('.tracker-input').forEach((inp) => {
        inp.addEventListener('input', (e) => {
          const mIdx = Number(e.target.getAttribute('data-m'));
          const wIdx = Number(e.target.getAttribute('data-w'));
          const field = e.target.getAttribute('data-field');
          state.monthly[mIdx].weeks[wIdx][field] = e.target.value;
          saveState();
          renderTracker(computeModel(state.params));
        });
      });
    }

    // Update computed values in-place (keeps focus intact while typing)
    monthsData.forEach((m) => {
      const mRow = tbody.querySelector(`tr[data-m-row="${m.idx}"]`);
      if (mRow) {
        const pill = mRow.querySelector('[data-m-col="weekPill"]');
        pill.textContent = `${m.filledWeeks}/${m.numWeeks} sem`;
        pill.className = `week-progress-pill ${m.filledWeeks > 0 ? 'has-data' : ''}`;

        mRow.querySelector('[data-m-col="metaSpend"]').textContent = fmtBRL(m.metaSpend);
        mRow.querySelector('[data-m-col="metaRev"]').textContent = fmtBRL(m.metaRev);
        mRow.querySelector('[data-m-col="spend"]').textContent = m.hasAny ? fmtBRL(m.spend) : '—';
        mRow.querySelector('[data-m-col="adRev"]').textContent = m.hasAny ? fmtBRL(m.adRev) : '—';
        mRow.querySelector('[data-m-col="organicRev"]').textContent = m.hasAny ? fmtBRL(m.organicRev) : '—';
        mRow.querySelector('[data-m-col="totalReal"]').textContent = m.hasAny ? fmtBRL(m.totalReal) : '—';
        mRow.querySelector('[data-m-col="roas"]').textContent = m.monthRoas !== null ? `${fmtNum(m.monthRoas, 2)}x` : '—';

        const diffEl = mRow.querySelector('[data-m-col="diff"]');
        if (m.diffVsTarget === null) {
          diffEl.innerHTML = '—';
          diffEl.className = 'num text-muted';
        } else {
          const sign = m.diffVsTarget >= 0 ? '+' : '';
          const partialNote = m.isPartial ? `<span class="diff-sub">vs ${m.filledWeeks} sem</span>` : '';
          diffEl.innerHTML = `${sign}${fmtBRL(m.diffVsTarget)}${partialNote}`;
          diffEl.className = `num ${m.diffVsTarget >= 0 ? 'text-pos' : 'text-neg'}`;
        }
      }

      if (expandedMonths.has(m.idx)) {
        m.weeks.forEach((w) => {
          const wRow = tbody.querySelector(`tr[data-w-row="${m.idx}-${w.wIdx}"]`);
          if (!wRow) return;
          wRow.querySelector('[data-w-col="metaSpend"]').textContent = fmtBRL(w.metaSpend);
          wRow.querySelector('[data-w-col="metaRev"]').textContent = fmtBRL(w.metaRev);

          ['spend', 'adRev', 'organicRev'].forEach((field) => {
            const inp = wRow.querySelector(`input[data-field="${field}"]`);
            if (inp && document.activeElement !== inp) {
              inp.value = w.entry[field];
            }
          });

          wRow.querySelector('[data-w-col="totalReal"]').textContent = w.hasAny ? fmtBRL(w.totalReal) : '—';
          wRow.querySelector('[data-w-col="roas"]').textContent = w.weekRoas !== null ? `${fmtNum(w.weekRoas, 2)}x` : '—';

          const wDiffEl = wRow.querySelector('[data-w-col="diff"]');
          if (w.weekDiff === null) {
            wDiffEl.textContent = '—';
            wDiffEl.className = 'num text-muted';
          } else {
            const sign = w.weekDiff >= 0 ? '+' : '';
            wDiffEl.textContent = `${sign}${fmtBRL(w.weekDiff)}`;
            wDiffEl.className = `num ${w.weekDiff >= 0 ? 'text-pos' : 'text-neg'}`;
          }
        });
      }
    });

    const totalDiff = totals.filledWeeksTotal > 0 ? totals.cumRealTotal - totals.expectedToDate : null;

    tfoot.innerHTML = `
      <tr>
        <td>Total Ano</td>
        <td class="num">${fmtBRL(res.requiredTotalSpend)}</td>
        <td class="num">${fmtBRL(res.targetRev)}</td>
        <td class="num">${fmtBRL(totals.cumRealSpend)}</td>
        <td class="num">${fmtBRL(totals.cumRealAdRev)}</td>
        <td class="num">${fmtBRL(totals.cumRealOrganic)}</td>
        <td class="num">${fmtBRL(totals.cumRealTotal)}</td>
        <td class="num">${totals.realRoas !== null ? `${fmtNum(totals.realRoas, 2)}x` : '—'}</td>
        <td class="num ${totalDiff === null ? 'text-muted' : totalDiff >= 0 ? 'text-pos' : 'text-neg'}">
          ${totalDiff === null ? '—' : `${totalDiff >= 0 ? '+' : ''}${fmtBRL(totalDiff)}`}
        </td>
      </tr>
    `;
  }

  function renderTrackerChart(monthsData, allWeeksFlat, targetRev) {
    const container = document.getElementById('chartMonthly');
    const W = 920;
    const H = 260;
    const pad = { top: 28, right: 24, bottom: 38, left: 72 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    const isWeekly = trackerChartMode === 'weekly';
    const style = trackerChartStyle || 'line';
    const pointsSource = isWeekly ? allWeeksFlat : monthsData;
    const count = Math.max(2, pointsSource.length);

    const maxCumReal = Math.max(0, ...pointsSource.map((p) => p.cumReal || 0));
    const maxVal = Math.max(targetRev, maxCumReal, 1) * 1.1;

    const xScale = (i) => pad.left + (plotW / (count - 1)) * i;
    const yScale = (v) => pad.top + plotH - (v / maxVal) * plotH;

    document.querySelectorAll('[data-tracker-chart-style]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tracker-chart-style') === style);
    });

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução acumulada">`;

    for (let i = 0; i <= 4; i++) {
      const val = (maxVal / 4) * i;
      const y = yScale(val);
      svg += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${DS.border}" stroke-dasharray="3 4" />`;
      svg += `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="${DS.muted}" font-size="11" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCompactBRL(val)}</text>`;
    }

    const targetPoints = pointsSource.map((p, i) => `${xScale(i)},${yScale(p.cumTarget)}`).join(' ');
    svg += `<polyline points="${targetPoints}" fill="none" stroke="${DS.accentBright}" stroke-width="2.2" stroke-dasharray="6 5" />`;

    const realPts = pointsSource
      .map((p, i) => (p.cumReal !== null ? { x: xScale(i), y: yScale(p.cumReal), val: p.cumReal, label: p.label || p.name } : null))
      .filter(Boolean);

    if (realPts.length > 0) {
      if (style === 'bars') {
        const barW = Math.min(28, (plotW / count) * 0.55);
        realPts.forEach((p) => {
          const h = Math.max(2, yScale(0) - p.y);
          svg += `<rect x="${p.x - barW / 2}" y="${p.y}" width="${barW}" height="${h}" rx="4" fill="${DS.accent}" fill-opacity="0.85"><title>${escapeHtml(p.label)}: ${fmtBRL(p.val)}</title></rect>`;
        });
      } else {
        const lineStr = realPts.map((p) => `${p.x},${p.y}`).join(' ');
        if (realPts.length >= 2 && (style === 'area' || style === 'line')) {
          if (style === 'area' || style === 'line') {
            const areaStr = `${realPts[0].x},${yScale(0)} ${lineStr} ${realPts[realPts.length - 1].x},${yScale(0)}`;
            if (style === 'area' || style === 'line') {
              svg += `<polygon points="${areaStr}" fill="${DS.accent}" fill-opacity="${style === 'area' ? '0.22' : '0.12'}" />`;
            }
          }
          svg += `<polyline points="${lineStr}" fill="none" stroke="${DS.accent}" stroke-width="2.8" />`;
        }
        realPts.forEach((p, idx) => {
          const r = isWeekly ? 3.5 : 4.5;
          svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${DS.accentBright}" stroke="${DS.board}" stroke-width="1.3"><title>${escapeHtml(p.label)}: ${fmtBRL(p.val)}</title></circle>`;
          if (idx === realPts.length - 1) {
            const anchor = p.x > W - 90 ? 'end' : p.x < pad.left + 60 ? 'start' : 'middle';
            svg += `<text x="${p.x}" y="${Math.max(16, p.y - 11)}" text-anchor="${anchor}" fill="${DS.accentBright}" font-size="11.5" font-weight="700" font-family="Inter, ui-sans-serif, system-ui, sans-serif">${fmtCompactBRL(p.val)}</text>`;
          }
        });
      }
    } else {
      svg += `<text x="${pad.left + plotW / 2}" y="${pad.top + plotH / 2}" text-anchor="middle" fill="${DS.muted}" font-size="13">Clique em um mês abaixo para lançar as semanas ou use "Simular 6 Semanas"</text>`;
    }

    if (isWeekly) {
      let runningIdx = 0;
      monthsData.forEach((m) => {
        const x = xScale(runningIdx);
        svg += `<line x1="${x}" y1="${pad.top + plotH}" x2="${x}" y2="${pad.top + plotH + 5}" stroke="${DS.border}" />`;
        svg += `<text x="${x}" y="${H - 12}" text-anchor="start" fill="${DS.secondary}" font-size="10.5">${m.name}</text>`;
        runningIdx += m.numWeeks;
      });
    } else {
      monthsData.forEach((m, i) => {
        svg += `<text x="${xScale(i)}" y="${H - 12}" text-anchor="middle" fill="${DS.secondary}" font-size="11">${m.name}</text>`;
      });
    }

    svg += `<line x1="${pad.left}" y1="12" x2="${pad.left + 20}" y2="12" stroke="${DS.accentBright}" stroke-width="2.2" stroke-dasharray="5 3" />`;
    svg += `<text x="${pad.left + 26}" y="16" fill="${DS.secondary}" font-size="11">Meta Acumulada (${fmtCompactBRL(targetRev)})</text>`;
    svg += `<line x1="${pad.left + 215}" y1="12" x2="${pad.left + 235}" y2="12" stroke="${DS.accent}" stroke-width="3" />`;
    svg += `<text x="${pad.left + 241}" y="16" fill="${DS.secondary}" font-size="11">Realizado Acumulado (${isWeekly ? 'Semanal' : 'Mensal'})</text>`;
    svg += '</svg>';

    container.innerHTML = svg;
  }

// ==================== CSV EXPORT ====================
  function exportMonthlyCsv() {
    const res = computeModel(state.params);
    const { trackerYear, monthsData } = computeTrackerData(res);

    const lines = [
      'Ano;Mes;Semana;Periodo;Meta_Verba;Meta_Rake_Total;Verba_Real;Rake_Trafego_Real;Rake_Base_Organica;Total_Real;ROAS',
    ];

    monthsData.forEach((m) => {
      m.weeks.forEach((w) => {
        const roas = w.weekRoas !== null ? w.weekRoas.toFixed(2).replace('.', ',') : '';
        lines.push([
          trackerYear,
          m.name,
          `Semana ${w.wIdx + 1}`,
          w.dateRange,
          w.metaSpend.toFixed(2).replace('.', ','),
          w.metaRev.toFixed(2).replace('.', ','),
          w.spend.toFixed(2).replace('.', ','),
          w.adRev.toFixed(2).replace('.', ','),
          w.organicRev.toFixed(2).replace('.', ','),
          w.totalReal.toFixed(2).replace('.', ','),
          roas,
        ].join(';'));
      });
    });

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acompanhamento-semanal-${trackerYear}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==================== EVENT WIRING ====================
  function bindEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach((b) => {
          const isAct = b === btn;
          b.classList.toggle('active', isAct);
          b.setAttribute('aria-selected', String(isAct));
        });
        document.querySelectorAll('.tab-panel').forEach((p) => {
          p.classList.toggle('active', p.id === `tab-${target}`);
        });
      });
    });

    // Money inputs (pt-BR: 3.500.000,00)
    const moneyMap = [
      ['inputTotalRev', 'totalRev'],
      ['inputAdSpend', 'adSpend'],
      ['inputAdRev', 'adRev'],
      ['inputTargetRev', 'targetRev'],
    ];

    moneyMap.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const val = parseMoneyInput(el.value);
        if (!Number.isNaN(val)) {
          state.params[key] = Math.max(0, val);
          saveState();
          renderAll();
        }
      });
      el.addEventListener('blur', () => {
        const val = parseMoneyInput(el.value);
        if (!Number.isNaN(val)) {
          state.params[key] = Math.max(0, val);
          el.value = formatMoneyInput(state.params[key], 2);
          saveState();
          renderAll();
        } else {
          el.value = formatMoneyInput(state.params[key], 2);
        }
      });
    });

    // Slider inputs
    const sliderMap = [
      ['sliderDecay', 'decayPct'],
      ['sliderEfficiency', 'efficiencyPct'],
    ];

    sliderMap.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const val = Number(el.value);
        if (!Number.isNaN(val)) {
          state.params[key] = val;
          saveState();
          renderAll();
        }
      });
    });

    // Radio models
    document.querySelectorAll('input[name="calcModel"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          state.params.model = radio.value;
          saveState();
          renderAll();
        }
      });
    });

    // Reset defaults
    document.getElementById('btnResetDefaults').addEventListener('click', () => {
      state.params = { ...DEFAULT_PARAMS };
      saveState();
      renderAll();
    });

    // Widget toolbar buttons
    document.getElementById('btnAddCustomChart').addEventListener('click', () => openChartEditor(null));
    document.getElementById('btnManageWidgets').addEventListener('click', openManageModal);

    // Manage modal buttons
    document.getElementById('btnRestoreLayout').addEventListener('click', () => {
      state.widgets = createDefaultWidgets();
      saveState();
      renderAll();
      renderManageList();
    });

    document.getElementById('btnNewChartFromManage').addEventListener('click', () => {
      closeModal('modalManage');
      openChartEditor(null);
    });

    // Modal close triggers
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
    });

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop && backdrop.id !== 'modalAuthGate') {
          backdrop.hidden = true;
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal('modalManage');
        closeModal('modalChartEditor');
        closeModal('modalManageKpis');
        closeModal('modalKpiEditor');
      }
    });

    // KPI Cards toolbar & modal events
    document.querySelectorAll('[data-kpi-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openKpiEditorModal(btn.getAttribute('data-kpi-add'), null);
      });
    });

    document.querySelectorAll('[data-kpi-manage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openManageKpisModal(btn.getAttribute('data-kpi-manage'));
      });
    });

    document.getElementById('btnRestoreKpis').addEventListener('click', () => {
      state.kpiCards[activeKpiManageTab] = createDefaultKpiCardsForTab(activeKpiManageTab);
      saveState();
      renderAllKpis();
      renderManageKpisList();
    });

    document.getElementById('btnNewKpiFromManage').addEventListener('click', () => {
      closeModal('modalManageKpis');
      openKpiEditorModal(activeKpiManageTab, null);
    });

    document.querySelectorAll('[data-kpi-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!kpiEditorDraft) return;
        kpiEditorDraft.mode = btn.getAttribute('data-kpi-mode');
        syncKpiEditorModeUi();
        updateKpiEditorPreview();
      });
    });

    document.getElementById('kpiEdMetric').addEventListener('change', (e) => {
      if (!kpiEditorDraft) return;
      const newKey = e.target.value;
      const catalog = getKpiMetricCatalog(buildLiveKpiContext());
      const prevMetric = catalog.find((m) => m.key === kpiEditorDraft.metricKey);
      const nextMetric = catalog.find((m) => m.key === newKey);
      kpiEditorDraft.metricKey = newKey;
      // Auto-update title if user hasn't customized it away from the previous metric's default name
      const labelEl = document.getElementById('kpiEdLabel');
      if (nextMetric && (!labelEl.value.trim() || (prevMetric && labelEl.value.trim() === prevMetric.name))) {
        labelEl.value = nextMetric.name;
        kpiEditorDraft.label = nextMetric.name;
      }
      updateKpiEditorPreview();
    });

    document.getElementById('kpiEdLabel').addEventListener('input', (e) => {
      if (!kpiEditorDraft) return;
      kpiEditorDraft.label = e.target.value;
      updateKpiEditorPreview();
    });

    document.getElementById('kpiEdValue').addEventListener('input', (e) => {
      if (!kpiEditorDraft) return;
      kpiEditorDraft.manualValue = e.target.value;
      updateKpiEditorPreview();
    });

    document.getElementById('kpiEdSub').addEventListener('input', (e) => {
      if (!kpiEditorDraft) return;
      kpiEditorDraft.customSub = e.target.value;
      updateKpiEditorPreview();
    });

    document.querySelectorAll('#kpiEdAccentPicker .accent-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!kpiEditorDraft) return;
        kpiEditorDraft.accent = btn.getAttribute('data-accent');
        syncKpiAccentButtons();
        updateKpiEditorPreview();
      });
    });

    document.getElementById('btnSaveKpiEditor').addEventListener('click', saveKpiEditor);

    document.getElementById('btnDeleteKpiInModal').addEventListener('click', () => {
      if (!kpiEditorDraft) return;
      deleteKpiCard(kpiEditorDraft.tabKey, kpiEditorDraft.id);
      closeModal('modalKpiEditor');
      kpiEditorDraft = null;
    });

    // Chart Editor controls
    document.getElementById('edChartType').addEventListener('change', (e) => {
      if (!editorDraft) return;
      editorDraft.chartType = e.target.value;
      updateEditorPreview();
    });

    document.getElementById('edFormat').addEventListener('change', (e) => {
      if (!editorDraft) return;
      editorDraft.format = e.target.value;
      updateEditorPreview();
    });

    document.querySelectorAll('#edColorSwatches .swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!editorDraft) return;
        editorDraft.color = btn.getAttribute('data-color');
        syncColorSwatches(editorDraft.color);
        updateEditorPreview();
      });
    });

    document.getElementById('btnAddDataRow').addEventListener('click', () => {
      if (!editorDraft) return;
      editorDraft.data = editorDraft.data || [];
      editorDraft.data.push({ label: `Item ${editorDraft.data.length + 1}`, value: 100000 });
      renderEditorDataRows();
      updateEditorPreview();
    });

    document.querySelectorAll('#editorTemplatesBar [data-template]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!editorDraft) return;
        const tpl = CHART_TEMPLATES[btn.getAttribute('data-template')];
        if (!tpl) return;
        editorDraft.title = tpl.title;
        editorDraft.subtitle = tpl.subtitle;
        editorDraft.chartType = tpl.chartType;
        editorDraft.format = tpl.format;
        editorDraft.color = tpl.color;
        editorDraft.data = tpl.data.map((d) => ({ ...d }));

        document.getElementById('edTitle').value = editorDraft.title;
        document.getElementById('edSubtitle').value = editorDraft.subtitle;
        document.getElementById('edChartType').value = editorDraft.chartType;
        document.getElementById('edFormat').value = editorDraft.format;
        syncColorSwatches(editorDraft.color);
        renderEditorDataRows();
        updateEditorPreview();
      });
    });

    document.getElementById('btnSaveChartEditor').addEventListener('click', saveChartEditor);

    document.getElementById('btnDeleteWidgetInModal').addEventListener('click', () => {
      if (editorDraft && editorDraft.kind === 'custom') {
        deleteCustomWidget(editorDraft.id);
        closeModal('modalChartEditor');
        editorDraft = null;
      }
    });

    // Tracker chart granularity toggle (Por Semana / Por Mês)
    document.querySelectorAll('[data-chart-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        trackerChartMode = btn.getAttribute('data-chart-mode');
        document.querySelectorAll('[data-chart-mode]').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        renderTracker(computeModel(state.params));
      });
    });

    document.querySelectorAll('[data-tracker-chart-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        trackerChartStyle = btn.getAttribute('data-tracker-chart-style') || 'line';
        document.querySelectorAll('[data-tracker-chart-style]').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        renderTracker(computeModel(state.params));
      });
    });

    document.querySelectorAll('[data-sea-chart-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!state.seasonality) state.seasonality = createDefaultSeasonality();
        state.seasonality.chartView = btn.getAttribute('data-sea-chart-view') || 'combo';
        saveState();
        renderSeasonality(computeModel(state.params));
      });
    });

    // Seasonality controls
    document.getElementById('sliderSeasonalityIntensity').addEventListener('input', (e) => {
      state.seasonality.intensity = Math.min(200, Math.max(0, Number(e.target.value) || 0));
      saveState();
      const currentRes = computeModel(state.params);
      renderSeasonality(currentRes);
      if (state.seasonality.syncTracker) {
        renderTracker(currentRes);
      }
    });

    document.getElementById('chkSyncSeasonalTracker').addEventListener('change', (e) => {
      state.seasonality.syncTracker = Boolean(e.target.checked);
      saveState();
      renderTracker(computeModel(state.params));
    });

    document.getElementById('btnResetSeasonality').addEventListener('click', () => {
      state.seasonality = createDefaultSeasonality();
      saveState();
      const currentRes = computeModel(state.params);
      renderSeasonality(currentRes);
      renderTracker(currentRes);
    });

    document.getElementById('btnExportSeasonalCsv').addEventListener('click', exportSeasonalityCsv);

    // Tracker year selector
    document.getElementById('selectTrackerYear').addEventListener('change', (e) => {
      const nextYear = Number(e.target.value) || DEFAULT_TRACKER_YEAR;
      state.trackerYear = nextYear;
      state.monthly = normalizeMonthly(state.monthly, nextYear);
      lastTrackerStructureSig = '';
      saveState();
      const currentRes = computeModel(state.params);
      renderSeasonality(currentRes);
      renderTracker(currentRes);
    });

    // Expand / Collapse all months
    document.getElementById('btnExpandAllMonths').addEventListener('click', () => {
      for (let i = 0; i < 12; i++) expandedMonths.add(i);
      renderTracker(computeModel(state.params));
    });

    document.getElementById('btnCollapseAllMonths').addEventListener('click', () => {
      expandedMonths.clear();
      renderTracker(computeModel(state.params));
    });

    // Tracker buttons: Simulate first 6 weeks of the selected year
    document.getElementById('btnPrefillDemo').addEventListener('click', () => {
      const res = computeModel(state.params);
      const year = Number(state.trackerYear) || DEFAULT_TRACKER_YEAR;
      const cal = getCalendarWeeksForYear(year);
      const totalWeeks = cal.reduce((s, arr) => s + arr.length, 0) || 52;
      const baseWeekSpend = Math.round(res.requiredTotalSpend / totalWeeks);
      const baseWeekOrg = Math.round((res.targetRev - res.requiredAdRevTotal) / totalWeeks);
      const factors = [
        { s: 0.90, r: 0.94, o: 1.02 },
        { s: 0.96, r: 0.98, o: 1.04 },
        { s: 1.02, r: 1.01, o: 0.99 },
        { s: 1.05, r: 1.05, o: 1.01 },
        { s: 1.00, r: 0.97, o: 0.98 },
        { s: 1.08, r: 1.06, o: 1.02 },
      ];
      state.monthly = createEmptyMonthly(year);
      let placed = 0;
      const touchedMonths = new Set();
      for (let m = 0; m < 12 && placed < factors.length; m++) {
        for (let w = 0; w < state.monthly[m].weeks.length && placed < factors.length; w++) {
          const f = factors[placed++];
          const spend = Math.round(baseWeekSpend * f.s);
          const adRev = Math.round(spend * res.projectedRoas * f.r);
          const org = Math.round(baseWeekOrg * f.o);
          state.monthly[m].weeks[w] = {
            spend: String(spend),
            adRev: String(adRev),
            organicRev: String(org),
          };
          touchedMonths.add(m);
        }
      }
      expandedMonths.clear();
      touchedMonths.forEach((m) => expandedMonths.add(m));
      lastTrackerStructureSig = '';
      saveState();
      renderAll();
    });

    document.getElementById('btnClearTracker').addEventListener('click', () => {
      state.monthly = createEmptyMonthly(state.trackerYear);
      lastTrackerStructureSig = '';
      saveState();
      renderAll();
    });

    document.getElementById('btnExportCsv').addEventListener('click', exportMonthlyCsv);

    // Cloud Sync & JSON Backup controls
    document.getElementById('btnCloudRefresh').addEventListener('click', () => {
      pullStateFromCloud(false);
    });

    document.getElementById('btnExportJson').addEventListener('click', exportJsonBackup);

    document.getElementById('btnImportJson').addEventListener('click', () => {
      document.getElementById('inputImportJsonFile').click();
    });

    document.getElementById('inputImportJsonFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        importJsonBackupFile(file);
        e.target.value = '';
      }
    });

    document.getElementById('formAuthGate').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('inputAuthPassword');
      const errEl = document.getElementById('authErrorMsg');
      const pin = (input.value || '').trim();
      if (!pin) return;

      errEl.hidden = true;
      try {
        sessionStorage.setItem(AUTH_SESSION_KEY, pin);
      } catch (_) {
        // ignore
      }

      const resp = await fetch('/api/trafego-state', {
        method: 'GET',
        headers: { 'x-app-password': pin },
      });

      if (resp.status === 401) {
        try {
          sessionStorage.removeItem(AUTH_SESSION_KEY);
        } catch (_) {
          // ignore
        }
        errEl.hidden = false;
        input.focus();
        input.select();
        return;
      }

      input.value = '';
      await pullStateFromCloud(true);
    });
  }

  bindEvents();
  renderAll();
  pullStateFromCloud(true);
})();
