'use client';
import { useEffect, useState, useCallback } from 'react';
import PoolRanking from '../../components/pools/PoolRanking';
import { getGlobalPools, getTopPools } from '../../lib/api';

const NETWORKS_DEFAULT = [
  { label: 'Global (Top 20)', value: 'global', recommended: false },
  { label: 'Base ⭐',          value: '8453',   recommended: true  },
  { label: 'Arbitrum',        value: '42161',  recommended: false },
  { label: 'Optimism',        value: '10',     recommended: false },
  { label: 'Polygon',         value: '137',    recommended: false },
  { label: 'BNB Chain',       value: '56',     recommended: false },
];

const NETWORKS_HIGH_GAS = [
  ...NETWORKS_DEFAULT,
  { label: 'Ethereum 🔥 Gas alto', value: '1', highGas: true },
];

const RISK_FILTERS = [
  { key: 'Todos',          label: 'Todos',           icon: '⊙' },
  { key: 'Risco Baixo',    label: 'Risco baixo',     icon: '🛡' },
  { key: 'Risco Médio',    label: 'Risco médio',     icon: '⚖' },
  { key: 'Alto APR',       label: 'Maior APR',       icon: '📈' },
  { key: 'Alto TVL',       label: 'Maior liquidez',  icon: '💧' },
  { key: 'Mais econômicas',label: 'Menor gas',        icon: '⛽' },
];

const ECO_NETWORKS = new Set(['Base', 'Arbitrum', 'Optimism', 'Polygon', 'BNB Chain']);

function applyRisk(pools, f) {
  if (f === 'Risco Baixo')     return pools.filter(p => p.riskLevel === 'BAIXO');
  if (f === 'Risco Médio')     return pools.filter(p => p.riskLevel === 'MÉDIO');
  if (f === 'Alto APR')        return [...pools].sort((a, b) => b.apr7d - a.apr7d);
  if (f === 'Alto TVL')        return [...pools].sort((a, b) => b.tvl - a.tvl);
  if (f === 'Mais econômicas') return [...pools].sort((a, b) => {
    const aE = ECO_NETWORKS.has(a.networkName) ? 0 : 1;
    const bE = ECO_NETWORKS.has(b.networkName) ? 0 : 1;
    if (aE !== bE) return aE - bE;
    return b.score - a.score;
  });
  return pools;
}

export default function PoolsPage() {
  const [allPools,    setAllPools]    = useState([]);
  const [filtered,    setFiltered]    = useState([]);
  const [network,     setNetwork]     = useState('global');
  const [riskFilter,  setRiskFilter]  = useState('Todos');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [sources,     setSources]     = useState(null);
  const [showHighGas, setShowHighGas] = useState(false);

  const NETWORKS = showHighGas ? NETWORKS_HIGH_GAS : NETWORKS_DEFAULT;

  const fetchPools = useCallback(async (net) => {
    setLoading(true);
    setError(null);
    try {
      let result;
      if (net === 'global') {
        result = await getGlobalPools();
        setSources(result.sources || null);
      } else {
        result = await getTopPools(parseInt(net));
        setSources(null);
      }
      const pools = result.pools || [];
      setAllPools(pools);
      setFiltered(applyRisk(pools, riskFilter));
    } catch (err) {
      setError(err.message);
      setAllPools([]);
      setFiltered([]);
    } finally {
      setLoading(false);
    }
  }, [riskFilter]);

  useEffect(() => { fetchPools(network); }, [network]);

  function handleRisk(f) {
    setRiskFilter(f);
    setFiltered(applyRisk(allPools, f));
  }

  const hasRealData = allPools.some(p => p.dataSource === 'real');

  return (
    <div className="space-y-7 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Ranking de Pools</h1>
          <p className="text-slate-500 mt-1.5 text-sm">
            {loading
              ? 'Buscando dados on-chain…'
              : `${filtered.length} pool${filtered.length !== 1 ? 's' : ''} ranqueadas por score de oportunidade.`}
            {hasRealData && !loading && (
              <span className="ml-2 badge-success align-middle">dados reais</span>
            )}
          </p>
          <p className="text-slate-600 text-xs mt-1">
            Score considera volume, liquidez, consistência de fees e custo de gas.
          </p>
        </div>

        {/* Network selector */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {NETWORKS.map(n => (
            <button
              key={n.value}
              onClick={() => { setNetwork(n.value); setRiskFilter('Todos'); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border ${
                network === n.value
                  ? 'bg-violet-600 border-violet-500 text-white shadow-glow-sm'
                  : n.highGas
                    ? 'bg-red-950/30 border-red-900/30 text-red-400 hover:border-red-800/50'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
              }`}
            >
              {n.label}
            </button>
          ))}
          <button
            onClick={() => { setShowHighGas(v => !v); if (network === '1') { setNetwork('global'); } }}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-white/[0.10] text-slate-600 hover:text-slate-400 hover:border-white/[0.20] transition-all"
          >
            {showHighGas ? '✕ Ocultar gas alto' : '+ Mostrar redes com gas alto'}
          </button>
        </div>
      </div>

      {/* Source status */}
      {sources && !loading && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(sources).map(([net, info]) => (
            <span key={net} className={`badge ${
              info.dataSource === 'real' ? 'badge-success' : 'badge-error'
            }`}>
              {net}: {info.dataSource === 'real' ? `✓ ${info.count} pools` : '✗ sem dados'}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {RISK_FILTERS.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => handleRisk(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 border ${
              riskFilter === key
                ? 'bg-violet-600 border-violet-500 text-white shadow-glow-sm'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="card text-center py-16 space-y-4">
          <div className="spinner-brand mx-auto" style={{ width: 36, height: 36, borderWidth: 3 }} />
          <div>
            <p className="text-slate-300 font-medium">Buscando dados on-chain…</p>
            <p className="text-slate-600 text-sm mt-1">Consultando The Graph em múltiplas redes</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="card border-red-900/30 bg-red-950/10 space-y-3">
          <p className="text-red-400 font-medium">Erro ao buscar pools</p>
          <p className="text-red-400/60 text-sm">{error}</p>
          <button onClick={() => fetchPools(network)} className="btn-outline text-sm">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="card text-center py-14 space-y-3">
          <p className="text-4xl">📭</p>
          <p className="text-slate-300 font-medium">Nenhuma pool encontrada para este filtro.</p>
          {!hasRealData && (
            <p className="text-xs text-amber-400/80 max-w-sm mx-auto">
              Adicione <code className="bg-white/[0.06] px-1.5 py-0.5 rounded">GRAPH_API_KEY</code> no backend/.env para acessar dados reais do The Graph.
            </p>
          )}
          {riskFilter !== 'Todos' && (
            <button onClick={() => handleRisk('Todos')} className="btn-outline text-sm">
              Limpar filtro
            </button>
          )}
        </div>
      )}

      {/* Risk disclaimer */}
      {!loading && !error && filtered.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-950/20 border border-amber-900/25 rounded-xl px-4 py-3 text-xs text-amber-400/80">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>
            DeFi envolve risco de perda de capital. APR histórico não garante retorno futuro.
            Perda impermanente pode afetar o valor da posição. Taxas de rede incidem em cada transação.
          </span>
        </div>
      )}

      {/* Pool list */}
      {!loading && !error && filtered.length > 0 && (
        <PoolRanking pools={filtered} />
      )}
    </div>
  );
}
