'use client';
import { useState } from 'react';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

const PROFILES = [
  { key: 'conservative', label: 'Conservador', range: '±20%', desc: 'Menor risco, menor concentração' },
  { key: 'balanced',     label: 'Equilibrado', range: '±10%', desc: 'Risco e retorno moderados' },
  { key: 'aggressive',   label: 'Agressivo',   range: '±4%',  desc: 'Maior fee, maior risco IL' },
];

export default function Calculator({ pool, chainId = 1 }) {
  const [amountUsd, setAmountUsd] = useState(1000);
  const [profile, setProfile]     = useState('balanced');
  const [result, setResult]        = useState(null);
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState(null);

  async function handleCalculate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: pool.id, amountUsd: parseFloat(amountUsd) || 1000, profile, chainId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao calcular');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-white text-lg">Calculadora de Estratégia</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">{pool.token0?.symbol}/{pool.token1?.symbol}</span>
          <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{pool.feeTierLabel || pool.feeTierRaw}</span>
          <span className={`px-2 py-0.5 rounded-full border font-medium ${
            pool.riskLevel === 'BAIXO' ? 'text-emerald-400 border-emerald-800 bg-emerald-950/30' :
            pool.riskLevel === 'ALTO'  ? 'text-red-400    border-red-800    bg-red-950/30'    :
                                         'text-amber-400  border-amber-800  bg-amber-950/30'
          }`}>{pool.riskLevel}</span>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="stat-label block mb-1.5">Valor a investir (USD)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input
              type="number"
              value={amountUsd}
              onChange={e => setAmountUsd(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-7 pr-4 py-2.5 text-white focus:border-violet-600 focus:outline-none"
              min="100"
              step="100"
            />
          </div>
        </div>

        <div>
          <label className="stat-label block mb-1.5">Perfil de risco</label>
          <div className="flex gap-2">
            {PROFILES.map(p => (
              <button
                key={p.key}
                onClick={() => setProfile(p.key)}
                title={`${p.desc} — ${p.range}`}
                className={`flex-1 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                  profile === p.key
                    ? 'border-violet-500 bg-violet-950/60 text-violet-300'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {p.label}
                <span className="block text-gray-500 font-normal" style={{ fontSize: '9px' }}>{p.range}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={handleCalculate} disabled={loading} className="btn-primary w-full">
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Calculando...
          </span>
        ) : 'Calcular estratégia'}
      </button>

      {error && (
        <div className="text-red-400 text-sm border border-red-900/50 bg-red-950/20 rounded-xl p-3">{error}</div>
      )}

      {result && <CalcResult result={result} />}
    </div>
  );
}

// ─── Resultado ────────────────────────────────────────────────────────────────

function CalcResult({ result }) {
  return (
    <div className="space-y-4 pt-2 border-t border-gray-800">

      {/* Disclaimer */}
      <p className="text-xs text-amber-600/80 border border-amber-900/30 bg-amber-950/10 rounded-xl px-3 py-2">
        Estimativa educacional. Resultados não garantidos.
      </p>

      {/* Faixa de preço */}
      <div className="bg-gray-800/50 rounded-xl p-4">
        <p className="stat-label mb-3">Faixa sugerida — {result.profile} (±{result.recommendedRangePercent}%)</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Mínimo', val: result.minPrice, cls: 'text-red-400' },
            { label: 'Atual',  val: result.currentPrice, cls: 'text-violet-300 font-bold' },
            { label: 'Máximo', val: result.maxPrice, cls: 'text-emerald-400' },
          ].map(({ label, val, cls }) => (
            <div key={label}>
              <p className="text-xs text-gray-500 mb-0.5">{label}</p>
              <p className={`font-semibold ${cls}`}>{fmtPrice(val)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CalcMetric label="APR estimado" value={`${result.estimatedApr}%`} accent />
        <CalcMetric label="Fees / mês"   value={`$${fmtNum(result.estimatedMonthlyFees)}`} />
        <CalcMetric label="Fees / dia"   value={`$${fmtNum(result.estimatedDailyFees)}`} />
        <CalcMetric label={`Taxa plataforma (${result.platformFeePct ?? 5}%)/mês`} value={`$${fmtNum(result.platformFeePreview)}`} muted />
      </div>

      {/* Risco */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800/50 rounded-xl p-3">
          <p className="stat-label mb-1">Risco Impermanent Loss</p>
          <p className={`font-semibold ${
            result.impermanentLossRisk === 'BAIXO' ? 'text-emerald-400' :
            result.impermanentLossRisk === 'ALTO'  ? 'text-red-400'    : 'text-amber-400'
          }`}>{result.impermanentLossRisk}</p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-3">
          <p className="stat-label mb-1">Prob. sair do range (30 dias)</p>
          <p className={`font-semibold ${
            result.outOfRangeProbability > 50 ? 'text-red-400' :
            result.outOfRangeProbability > 25 ? 'text-amber-400' : 'text-emerald-400'
          }`}>{result.outOfRangeProbability}%</p>
        </div>
      </div>

      {/* Cenários */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: 'worstCase',    label: 'Pior caso',    cls: 'text-red-400' },
          { key: 'expectedCase', label: 'Esperado',     cls: 'text-violet-400' },
          { key: 'bestCase',     label: 'Melhor caso',  cls: 'text-emerald-400' },
        ].map(({ key, label, cls }) => (
          <div key={key} className="bg-gray-800/50 rounded-xl p-3 text-center">
            <p className="stat-label mb-1">{label}</p>
            <p className={`font-bold text-lg ${cls}`}>${fmtNum(result[key]?.monthlyFees)}</p>
            <p className="text-xs text-gray-500">{result[key]?.apr}% APR</p>
          </div>
        ))}
      </div>

      {/* Gas */}
      <div className="flex items-center justify-between text-sm border-t border-gray-800 pt-3">
        <span className="text-gray-400">Gas estimado para entrar</span>
        <span className="text-white font-medium">${result.gasEstimateUsd?.toFixed(2)}</span>
      </div>

      {/* Alertas */}
      {result.warnings?.length > 0 && (
        <div className="space-y-2">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-400 border border-amber-900/30 bg-amber-950/10 rounded-xl px-3 py-2">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CalcMetric({ label, value, accent, muted }) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-3">
      <p className="stat-label mb-1">{label}</p>
      <p className={`font-semibold ${accent ? 'text-violet-300' : muted ? 'text-gray-500' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function fmtPrice(n) {
  if (n == null || n === 0) return '—';
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 1)    return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

function fmtNum(n) {
  if (n == null) return '0';
  if (n >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(2);
}
