'use client';
import { useState, useEffect } from 'react';
import { simulate } from '../../lib/api';

const PROFILES = [
  {
    key: 'conservador',
    label: 'Conservador',
    emoji: '🛡',
    description: '±20% do preço — menor risco de sair do range.',
    active: 'border-emerald-600 bg-emerald-950/40 text-white',
    inactive: 'border-white/[0.07] hover:border-white/[0.14] text-slate-400',
    dot: 'bg-emerald-500',
  },
  {
    key: 'moderado',
    label: 'Moderado',
    emoji: '⚖',
    description: '±10% do preço — equilíbrio fee rate e estabilidade.',
    active: 'border-amber-600 bg-amber-950/40 text-white',
    inactive: 'border-white/[0.07] hover:border-white/[0.14] text-slate-400',
    dot: 'bg-amber-500',
  },
  {
    key: 'agressivo',
    label: 'Agressivo',
    emoji: '⚡',
    description: '±4% do preço — fees máximos, maior risco fora do range.',
    active: 'border-red-600 bg-red-950/40 text-white',
    inactive: 'border-white/[0.07] hover:border-white/[0.14] text-slate-400',
    dot: 'bg-red-500',
  },
];

const SEVERITY_STYLE = {
  critical:    'bg-red-950/50 border-red-800 text-red-400',
  high:        'bg-red-950/30 border-red-900 text-red-400',
  medium:      'bg-amber-950/30 border-amber-900 text-amber-400',
  low:         'bg-white/[0.03] border-white/[0.07] text-slate-400',
  not_viable:  'bg-red-950/60 border-red-700 text-red-300',
};

export default function SimulatorForm({ poolId, poolName, pool: poolProp }) {
  const [capital,  setCapital]  = useState('');
  const [profile,  setProfile]  = useState('moderado');
  const [days,     setDays]     = useState(30);
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [poolData, setPoolData] = useState(poolProp || null);

  useEffect(() => {
    if (poolProp) { setPoolData(poolProp); return; }
    try {
      const stored = sessionStorage.getItem('sim_pool');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.id === poolId || !poolId)) setPoolData(parsed);
      }
    } catch {}
  }, [poolId, poolProp]);

  const displayName = poolData
    ? `${poolData.token0?.symbol}/${poolData.token1?.symbol} · ${poolData.feeTierLabel || ''} · ${poolData.networkName || ''}`
    : (poolName || (poolId ? `${poolId.slice(0, 8)}…` : null));

  async function handleSimulate(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await simulate({
        capitalUSD: parseFloat(capital),
        poolId,
        profile,
        daysToSimulate: days,
        ...(poolData && { poolData }),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const dayLabel = days >= 365 ? '1 ano' : days >= 180 ? '6 meses' : days >= 90 ? '3 meses' : days >= 30 ? '1 mês' : `${days} dias`;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSimulate} className="card space-y-7">

        {/* Pool context */}
        {displayName && (
          <div className="flex items-center gap-2.5 bg-violet-950/30 border border-violet-800/30 rounded-xl px-4 py-3">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" />
            <span className="text-sm text-slate-400">
              Simulando para: <strong className="text-white">{displayName}</strong>
            </span>
            {poolData?.dataSource === 'real' && (
              <span className="ml-auto badge-success shrink-0">dados reais</span>
            )}
          </div>
        )}

        <div>
          <h3 className="text-lg font-bold text-white mb-5">Configurar simulação</h3>

          {/* Capital */}
          <div className="space-y-2 mb-6">
            <label className="stat-label block">Capital a investir</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">$</span>
              <input
                type="number" min="1" max="10000000" step="100" required
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="10.000"
                className="input-field pl-8"
              />
            </div>
            <div className="flex gap-2">
              {[1000, 5000, 10000, 50000].map((v) => (
                <button
                  key={v} type="button"
                  onClick={() => setCapital(String(v))}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-150 ${
                    capital === String(v)
                      ? 'border-violet-600 bg-violet-950/50 text-violet-400'
                      : 'border-white/[0.07] bg-white/[0.03] text-slate-500 hover:border-white/[0.14] hover:text-slate-300'
                  }`}
                >
                  ${v >= 1000 ? `${v / 1000}K` : v}
                </button>
              ))}
            </div>
          </div>

          {/* Profile */}
          <div className="space-y-2 mb-6">
            <label className="stat-label block">Perfil de risco</label>
            <div className="grid grid-cols-3 gap-3">
              {PROFILES.map((p) => (
                <button
                  type="button" key={p.key}
                  onClick={() => setProfile(p.key)}
                  className={`border rounded-xl p-3.5 text-left transition-all duration-150 ${
                    profile === p.key ? p.active : p.inactive
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-lg">{p.emoji}</span>
                    {profile === p.key && <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />}
                  </div>
                  <p className={`font-semibold text-sm ${profile === p.key ? 'text-white' : 'text-slate-300'}`}>
                    {p.label}
                  </p>
                  <p className="text-slate-500 text-xs mt-1 leading-snug">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Horizon */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="stat-label">Horizonte de tempo</label>
              <span className="text-sm font-semibold text-white">{dayLabel}</span>
            </div>
            <input
              type="range" min="1" max="365" value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-700">
              <span>1 dia</span><span>30 dias</span><span>90 dias</span><span>1 ano</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !capital || parseFloat(capital) <= 0}
          className="btn-primary w-full py-3 text-base"
        >
          {loading ? <><span className="spinner-sm" />Calculando…</> : '→ Simular posição'}
        </button>
      </form>

      {error && (
        <div className="card border-red-900/30 bg-red-950/10 text-red-400 text-sm">{error}</div>
      )}

      {result && <SimulationResult result={result} />}
    </div>
  );
}

function SimulationResult({ result }) {
  const { priceRange, scenarios, gasCost, ilScenarios, breakEvenDays, isViable, warnings, gasContext, disclaimer } = result;
  const [activeScenario, setActiveScenario] = useState('esperado');
  const scenario = scenarios[activeScenario];

  const scenarioTabs = [
    { key: 'pior',     label: 'Pior caso',     color: 'text-red-400',     bg: 'bg-red-950/30'    },
    { key: 'esperado', label: 'Esperado',       color: 'text-violet-400',  bg: 'bg-violet-950/30' },
    { key: 'melhor',   label: 'Melhor caso',    color: 'text-emerald-400', bg: 'bg-emerald-950/30'},
  ];

  return (
    <div className="space-y-4 animate-slide-up">

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-amber-950/20 border border-amber-900/25 rounded-xl px-4 py-3 text-xs text-amber-400/80">
        <span className="shrink-0 mt-0.5">⚠</span>
        <span>{disclaimer}</span>
      </div>

      {/* Gas context */}
      {gasContext && (
        <div className={`card flex items-center gap-4 ${
          gasContext.level === 'cheap' ? 'border-emerald-900/30' :
          gasContext.level === 'expensive' ? 'border-amber-900/30' : 'border-white/[0.07]'
        }`}>
          <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center text-xl shrink-0">⛽</div>
          <div>
            <p className="font-semibold text-white">{gasContext.currentGwei} Gwei</p>
            <p className="text-slate-500 text-xs mt-0.5">{gasContext.recommendation}</p>
          </div>
        </div>
      )}

      {/* Not viable */}
      {!isViable && (
        <div className="card border-red-800/60 bg-red-950/20 space-y-1">
          <p className="text-red-400 font-semibold">⚠ Posição provavelmente não rentável</p>
          <p className="text-red-400/70 text-sm">
            O custo de gas é maior que a receita esperada. Considere aumentar o capital ou use uma L2 como Arbitrum ou Base.
          </p>
        </div>
      )}

      {/* Warnings */}
      {warnings?.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className={`card text-sm border ${SEVERITY_STYLE[w.type] || SEVERITY_STYLE[w.severity]}`}>
              {w.message}
            </div>
          ))}
        </div>
      )}

      {/* Price range */}
      <div className="card space-y-4">
        <h4 className="font-bold text-white">Faixa de preço sugerida</h4>
        {priceRange.current != null ? (
          <>
            <div className="grid grid-cols-3 gap-4 text-center">
              <Stat label="Mínimo" value={priceRange.lower} />
              <Stat label="Preço atual" value={priceRange.current} accent />
              <Stat label="Máximo" value={priceRange.upper} />
            </div>
            <div className="flex items-center gap-2 justify-center text-sm text-slate-500">
              <span>{priceRange.label}</span>
              <span className="text-slate-700">·</span>
              <span>{result.inRangeProbability}% de chance no range</span>
            </div>
            <div className="relative h-2 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-violet-600/60 rounded-full"
                style={{ left: `${Math.max(0,(1-priceRange.rangePctTotal/2/100)*50)}%`, width: `${Math.min(100,priceRange.rangePctTotal)}%` }}
              />
              <div className="absolute left-1/2 -translate-x-1/2 top-0 h-full w-0.5 bg-violet-400" />
            </div>
          </>
        ) : (
          <p className="text-slate-500 text-sm">
            Faixa {priceRange.label} em torno do preço atual (preço on-chain não disponível para esta pool).
          </p>
        )}
      </div>

      {/* Scenarios */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-bold text-white">Projeção de taxas</h4>
          <div className="flex gap-1 ml-auto flex-wrap">
            {scenarioTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveScenario(tab.key)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150 ${
                  activeScenario === tab.key
                    ? `${tab.bg} ${tab.color} border-current/30`
                    : 'border-white/[0.07] text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3 text-xs text-slate-600 italic">
          {scenario.assumption}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Taxas/dia" value={`$${scenario.feesPerDay?.toFixed(2)}`} />
          <Stat label={`Taxas em ${result.input.daysToSimulate}d`} value={`$${scenario.feesForPeriod?.toFixed(2)}`} />
          <Stat label={`Taxa plataforma (${scenario.platformFeePct ?? 5}%)`} value={`$${scenario.platformFeeUSD?.toFixed(2)}`} muted />
          <Stat label="APR líquido" value={`${scenario.aprEstimated}%`} accent />
        </div>

        <div className="divider pt-4 flex items-center justify-between">
          <span className="text-slate-400 text-sm">Você recebe (líquido estimado)</span>
          <span className="text-emerald-400 font-bold text-xl tabular-nums">${scenario.netFeesUSD?.toFixed(2)}</span>
        </div>

        <p className="text-xs text-slate-700 text-center">
          Taxa de {scenario.platformFeePct ?? 5}% aplicada apenas sobre as taxas geradas, nunca sobre o capital investido.
        </p>
      </div>

      {/* Gas costs */}
      <div className="card space-y-3">
        <h4 className="font-bold text-white">Custos de gas estimados</h4>
        <div className="space-y-2">
          {[
            { label: 'Criar posição',     value: gasCost.addLiquidity },
            { label: 'Sacar taxas',       value: gasCost.collect },
            { label: 'Retirar liquidez',  value: gasCost.removeLiquidity },
            { label: 'Rebalancear',       value: gasCost.rebalance },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-2.5 border-b border-white/[0.05] text-sm last:border-0">
              <span className="text-slate-400">{label}</span>
              <span className="text-white font-medium tabular-nums">${value?.toFixed(2)}</span>
            </div>
          ))}
        </div>
        {breakEvenDays && (
          <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl px-4 py-3 text-center text-sm">
            <span className="text-slate-500">Break-even de gas: </span>
            <strong className={`ml-1 ${breakEvenDays === Infinity || breakEvenDays > 90 ? 'text-red-400' : breakEvenDays > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {breakEvenDays === Infinity ? 'Não rentável' : `${breakEvenDays} dias`}
            </strong>
          </div>
        )}
        <p className="text-xs text-slate-700 text-center">
          Gas é pago para a rede blockchain — não para a plataforma.
        </p>
      </div>

      {/* IL risk */}
      <div className="card space-y-3">
        <h4 className="font-bold text-white">Risco de impermanent loss</h4>
        <p className="text-xs text-slate-600">
          Impermanent loss ocorre quando o preço dos tokens muda em relação ao momento da entrada. Pode reduzir o valor da posição.
        </p>
        <div className="space-y-2">
          {ilScenarios?.map((s) => (
            <div key={s.scenario}
                 className="flex items-center justify-between bg-white/[0.03] border border-white/[0.05] rounded-xl px-4 py-3 text-sm">
              <span className="text-slate-300">{s.scenario}</span>
              <div className="text-right">
                <p className="text-red-400 font-semibold tabular-nums">-{s.ilPercent}%</p>
                <p className="text-slate-600 text-xs tabular-nums">-${s.ilUSD?.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, muted }) {
  return (
    <div className="space-y-1">
      <p className="stat-label text-[10px]">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${accent ? 'text-violet-300' : muted ? 'text-slate-600' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
