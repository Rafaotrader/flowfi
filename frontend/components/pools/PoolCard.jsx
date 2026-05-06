'use client';
import Link from 'next/link';

const RISK_BADGE = {
  BAIXO: 'badge-risk-low',
  MÉDIO: 'badge-risk-medium',
  ALTO:  'badge-risk-high',
};

const RISK_LABEL = {
  BAIXO: 'Risco baixo',
  MÉDIO: 'Risco médio',
  ALTO:  'Risco alto',
};

const GAS_LEVEL = {
  'Base': 'baixo', 'Arbitrum': 'baixo', 'Optimism': 'baixo',
  'Polygon': 'baixo', 'BNB Chain': 'baixo',
  'Ethereum': 'alto',
};

const GAS_STYLE = {
  baixo: 'badge-success',
  médio: 'badge-warning',
  alto:  'badge-error',
};

const GAS_LABEL = { baixo: 'Gas baixo', médio: 'Gas médio', alto: 'Gas alto' };

const FEE_LABEL = { 100: '0.01%', 500: '0.05%', 3000: '0.3%', 10000: '1%' };

const SCORE_BREAKDOWN = [
  { key: 'volume',      label: 'Volume'   },
  { key: 'apr',         label: 'APR'      },
  { key: 'stability',   label: 'Estab.'   },
  { key: 'tvl',         label: 'TVL'      },
  { key: 'consistency', label: 'Consist.' },
  { key: 'alignment',   label: 'Fee tier' },
];

export default function PoolCard({ pool, rank, onSimulate, onEnterPool }) {
  const s        = pool.score ?? 0;
  const gasLevel = pool.networkName ? (GAS_LEVEL[pool.networkName] ?? 'médio') : null;

  const scoreColor = s >= 70 ? 'text-emerald-400' : s >= 45 ? 'text-amber-400' : 'text-red-400';
  const scoreBg    = s >= 70 ? 'bg-emerald-500'   : s >= 45 ? 'bg-amber-500'   : 'bg-red-500';
  const scoreBorder= s >= 70 ? 'border-emerald-800/50' : s >= 45 ? 'border-amber-800/50' : 'border-red-800/50';
  const isGreat    = s >= 70;
  const isHighLiq  = pool.tvl > 5_000_000;

  return (
    <div className="card-hover group">
      <div className="flex items-start gap-4">

        {/* Rank */}
        <div className="flex flex-col items-center shrink-0 pt-1">
          <span className={`text-2xl font-black ${rank <= 3 ? 'text-violet-400' : 'text-slate-700'}`}>
            {rank}
          </span>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-lg tracking-tight">
              {pool.token0?.symbol}/{pool.token1?.symbol}
            </span>
            <span className="badge-neutral">
              {FEE_LABEL[pool.feeTierRaw] || pool.feeTierLabel || `${parseInt(pool.feeTier) / 10000}%`}
            </span>
            {pool.riskLevel && (
              <span className={RISK_BADGE[pool.riskLevel] || 'badge-neutral'}>
                {RISK_LABEL[pool.riskLevel] || pool.riskLevel}
              </span>
            )}
            {pool.networkName && (
              <span className="badge-neutral">{pool.networkName}</span>
            )}
            {gasLevel && (
              <span className={GAS_STYLE[gasLevel] || 'badge-neutral'}>
                {GAS_LABEL[gasLevel]}
              </span>
            )}
            {isGreat && (
              <span className="badge-info">Boa oportunidade</span>
            )}
            {isHighLiq && (
              <span className="badge-success">Alta liquidez</span>
            )}
            {pool.dayCount < 3 && (
              <span className="badge-warning">Nova</span>
            )}
            {pool.dataSource === 'real' && (
              <span className="badge-success">Dados reais</span>
            )}
          </div>

          <p className="text-[11px] text-slate-700 mt-1 font-mono">
            {pool.id?.slice(0, 10)}…{pool.id?.slice(-6)}
          </p>
        </div>

        {/* Score */}
        <div className={`shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-2xl border ${scoreBorder} bg-surface-3`}>
          <p className={`text-2xl font-black tabular-nums leading-none ${scoreColor}`}>{s}</p>
          <p className="text-[9px] text-slate-600 mt-1 uppercase tracking-wider">{pool.label || 'Score'}</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="mt-4 h-1 bg-white/[0.05] rounded-full overflow-hidden">
        <div className={`score-bar-fill ${scoreBg}`} style={{ width: `${s}%` }} />
      </div>

      {/* Breakdown */}
      {pool.breakdown && (
        <div className="grid grid-cols-6 gap-1.5 mt-3">
          {SCORE_BREAKDOWN.map(({ key, label }) => (
            <div key={key} className="bg-white/[0.03] border border-white/[0.05] rounded-xl py-2 text-center">
              <p className="text-slate-600 text-[9px] uppercase tracking-wide">{label}</p>
              <p className="text-xs font-semibold text-slate-200 mt-0.5">{pool.breakdown[key] ?? '—'}</p>
            </div>
          ))}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <Metric label="APR estimado"  value={pool.apr7d != null ? `${pool.apr7d.toFixed(1)}%` : '—'} highlight />
        <Metric label="Valor em pool" value={pool.tvl   > 0    ? `$${fmtNum(pool.tvl)}`         : '—'} />
        <Metric label="Volume 24h"    value={pool.volume24h > 0 ? `$${fmtNum(pool.volume24h)}`  : '—'} />
        <Metric label="Vol. anual."   value={pool.annualizedVol > 0 ? `${pool.annualizedVol.toFixed(0)}%` : '—'} />
      </div>

      {/* Fee consistency */}
      {pool.feeConsistency !== undefined && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <span className="shrink-0">Regularidade de fees</span>
          <div className="flex-1 h-1 bg-white/[0.05] rounded-full overflow-hidden max-w-28">
            <div className="h-full bg-violet-600 rounded-full transition-all duration-700"
                 style={{ width: `${(pool.feeConsistency || 0) * 100}%` }} />
          </div>
          <span className="tabular-nums">{((pool.feeConsistency || 0) * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-5">
        <button
          onClick={() => onEnterPool?.(pool)}
          className="flex-1 btn-primary py-2.5 text-sm"
        >
          Entrar na pool
        </button>
        {onSimulate ? (
          <button
            onClick={() => onSimulate(pool)}
            className="btn-outline text-sm px-4"
          >
            Simular
          </button>
        ) : (
          <Link
            href={`/simulator?poolId=${pool.id}`}
            className="btn-outline text-sm px-4 text-center inline-flex items-center justify-center"
            onClick={() => {
              if (typeof window !== 'undefined') sessionStorage.setItem('sim_pool', JSON.stringify(pool));
            }}
          >
            Simular
          </Link>
        )}
        <Link href={`/pools/${pool.id}`} className="btn-outline text-sm px-4 inline-flex items-center justify-center">
          Info
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3">
      <p className="stat-label text-[10px]">{label}</p>
      <p className={`font-bold mt-1 tabular-nums ${highlight ? 'text-violet-300' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}
