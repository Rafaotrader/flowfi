'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { checkApiHealth, getGlobalPools, getTopPools } from '../lib/api';
import { useWallet } from '../components/common/WalletProvider';
import { getPublicClient, getPositionsForAddress } from '../lib/web3';
import PoolRanking from '../components/pools/PoolRanking';

const NETWORKS = [
  { label: 'Global',   value: 'global' },
  { label: 'Base ⭐',  value: '8453'   },
  { label: 'Arbitrum', value: '42161'  },
  { label: 'Optimism', value: '10'     },
  { label: 'Polygon',  value: '137'    },
  { label: 'BNB',      value: '56'     },
];

const STABLES = new Set(['USDC', 'USDT', 'DAI', 'USDbC']);

function fmtUSD(n) {
  if (!n || n === 0) return '$0.00';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function DashboardPage() {
  const { address, chainId, isConnected, connect } = useWallet();

  const [network,    setNetwork]    = useState('global');
  const [pools,      setPools]      = useState([]);
  const [sources,    setSources]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [totalPools, setTotalPools] = useState(null);
  const [apiOnline,  setApiOnline]  = useState(null);

  const [positions,    setPositions]    = useState(null);
  const [posLoading,   setPosLoading]   = useState(false);
  const [gasGwei,      setGasGwei]      = useState(null);
  const [selectedPool, setSelectedPool] = useState(null);
  const [showHighGas,  setShowHighGas]  = useState(false);

  // Health check
  useEffect(() => {
    checkApiHealth().then(r => setApiOnline(r.online)).catch(() => setApiOnline(false));
  }, []);

  // Pool fetch
  const fetchPools = useCallback(async (net) => {
    setLoading(true);
    setError(null);
    try {
      let result;
      if (net === 'global') {
        result = await getGlobalPools();
        setSources(result.sources || null);
        setTotalPools(result.total || null);
      } else {
        result = await getTopPools(parseInt(net));
        setSources(null);
        setTotalPools(result.pools?.length || null);
      }
      setPools(result.pools || []);
    } catch (err) {
      setError(err.message);
      setPools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPools(network); }, [network, fetchPools]);

  // Sync wallet chain
  useEffect(() => {
    if (chainId && [1, 42161, 10, 137, 8453, 56].includes(chainId)) {
      setNetwork(String(chainId));
    }
  }, [chainId]);

  // Load positions when wallet connected
  useEffect(() => {
    if (!address) { setPositions(null); return; }
    setPosLoading(true);
    getPositionsForAddress(address, chainId || 8453)
      .then(result => setPositions(Array.isArray(result) ? result : (result?.positions ?? [])))
      .catch(() => setPositions([]))
      .finally(() => setPosLoading(false));
  }, [address, chainId]);

  // Fetch gas price
  useEffect(() => {
    const cid = chainId || 8453;
    getPublicClient(cid).getGasPrice()
      .then(p => setGasGwei(Math.round(Number(p) / 1e6) / 1e3))
      .catch(() => {});
  }, [chainId]);

  const positionsArray = Array.isArray(positions)
    ? positions
    : Array.isArray(positions?.positions)
      ? positions.positions
      : Array.isArray(positions?.data)
        ? positions.data
        : [];

  const poolsArray = Array.isArray(pools)
    ? pools
    : Array.isArray(pools?.pools)
      ? pools.pools
      : Array.isArray(pools?.data)
        ? pools.data
        : [];

  const activePositions = positionsArray.filter(p => p.hasLiquidity).length;
  const hasRealData     = poolsArray.some(p => p.dataSource === 'real');
  const topPool         = poolsArray[0];

  const patrimonio = (() => {
    if (!positionsArray.length) return null;
    let stableFees = 0;
    let hasNonStable = false;
    for (const pos of positionsArray) {
      const f0 = Number(BigInt(pos.tokensOwed0 || '0')) / 10 ** pos.decimals0;
      const f1 = Number(BigInt(pos.tokensOwed1 || '0')) / 10 ** pos.decimals1;
      if (STABLES.has(pos.token0Symbol)) stableFees += f0;
      else if (f0 > 0.000001) hasNonStable = true;
      if (STABLES.has(pos.token1Symbol)) stableFees += f1;
      else if (f1 > 0.000001) hasNonStable = true;
    }
    return { stableFees, hasNonStable, total: positions.length, active: activePositions };
  })();

  function handleSimulate(pool) {
    if (typeof window !== 'undefined') sessionStorage.setItem('sim_pool', JSON.stringify(pool));
    setSelectedPool(pool);
    setTimeout(() => document.getElementById('pools-section')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  return (
    <div className="space-y-10 animate-fade-in">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="text-center pt-6 pb-2 space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-950/50 border border-violet-800/40 rounded-full text-xs text-violet-400 font-medium mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          Dados on-chain em tempo real
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          <span className="gradient-text">Maximize seu rendimento</span>
          <br />
          <span className="text-white">em pools de liquidez</span>
        </h1>
        <p className="text-slate-400 text-base sm:text-lg max-w-xl mx-auto text-balance leading-relaxed">
          Ranking inteligente de pools, simulador de retorno, swap integrado e gestão completa das suas posições.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
          <Link href="/pools" className="btn-primary px-6">
            Ver ranking de pools
          </Link>
          {!isConnected && (
            <button onClick={connect} className="btn-outline">
              Conectar carteira
            </button>
          )}
        </div>
      </div>

      {/* ── Stat Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon="💼"
          label="Suas posições"
          value={
            !isConnected ? (
              <button onClick={connect} className="text-violet-400 text-sm font-medium hover:underline">
                Conectar carteira
              </button>
            ) : posLoading ? (
              <span className="skeleton-shimmer w-12 h-6 block rounded" />
            ) : (
              <span className="text-white font-bold text-2xl">{activePositions}</span>
            )
          }
          sub={isConnected ? (activePositions > 0 ? <Link href="/positions" className="text-violet-400 hover:underline text-xs">Ver posições →</Link> : 'Nenhuma posição ativa') : 'Conecte para ver suas posições'}
          accent
        />
        <StatCard
          icon="⛽"
          label="Gas atual"
          value={
            gasGwei != null
              ? <span className={`text-2xl font-bold tabular-nums ${gasGwei < 1 ? 'text-emerald-400' : gasGwei < 10 ? 'text-amber-400' : 'text-red-400'}`}>{gasGwei} Gwei</span>
              : <span className="text-slate-500 text-sm">—</span>
          }
          sub={
            gasGwei != null
              ? gasGwei < 1 ? '✓ Gas muito baixo — ótimo momento para operar' : gasGwei < 10 ? '↑ Gas moderado' : '⚠ Gas alto — considere aguardar'
              : 'Conecte à rede para ver'
          }
          subColor={gasGwei != null ? (gasGwei < 1 ? 'text-emerald-400/80' : gasGwei < 10 ? 'text-amber-400/80' : 'text-red-400/80') : ''}
        />
        <StatCard
          icon="🏆"
          label="Melhor pool hoje"
          value={
            loading ? <span className="skeleton-shimmer w-24 h-6 block rounded" /> :
            topPool ? <span className="text-white font-bold text-lg">{topPool.token0?.symbol}/{topPool.token1?.symbol}</span> :
            <span className="text-slate-500 text-sm">—</span>
          }
          sub={topPool && !loading ? `Score ${topPool.score} · APR ${topPool.apr7d?.toFixed(1)}%` : 'Buscando dados...'}
        />
        <StatCard
          icon="🌐"
          label="Pools analisadas"
          value={<span className="text-white font-bold text-2xl">{totalPools ?? '—'}</span>}
          sub="6 redes · atualizado em tempo real"
        />
      </div>

      {/* ── Patrimônio panel (shown when wallet connected + positions loaded) ── */}
      {isConnected && !posLoading && patrimonio && (
        <div className="rounded-2xl overflow-hidden" style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.10) 0%, rgba(8,8,26,0.95) 60%)',
          border: '1px solid rgba(124,58,237,0.18)',
        }}>
          <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-violet-400 font-medium uppercase tracking-wider mb-0.5">Seu patrimônio</p>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-white font-bold">
                  {patrimonio.active} posição{patrimonio.active !== 1 ? 'ões' : ''} ativa{patrimonio.active !== 1 ? 's' : ''}
                </span>
                {patrimonio.stableFees > 0 && (
                  <span className="text-emerald-400 font-semibold">
                    {fmtUSD(patrimonio.stableFees)} em taxas (stablecoin)
                  </span>
                )}
                {patrimonio.hasNonStable && (
                  <span className="text-amber-400/80 text-sm">+ taxas em cripto</span>
                )}
              </div>
              <p className="text-[10px] text-slate-700 mt-1">
                Estimativa on-chain · baseada nas suas posições em pools
              </p>
            </div>
            <Link href="/positions" className="btn-outline text-xs px-4 py-2">
              Ver posições completas →
            </Link>
          </div>
        </div>
      )}

      {/* ── Backend status ──────────────────────────────────── */}
      {apiOnline === false && (
        <div className="flex items-center gap-3 bg-red-950/30 border border-red-900/30 rounded-xl px-4 py-3 text-sm text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          Backend offline — verifique se o servidor está rodando com <code className="bg-black/30 px-1.5 py-0.5 rounded text-xs mx-1">npm run dev</code> na pasta backend.
        </div>
      )}

      {/* ── Risk disclaimer ──────────────────────────────────── */}
      <div className="flex items-start gap-3 bg-amber-950/20 border border-amber-900/25 rounded-xl px-4 py-3 text-xs text-amber-400/80">
        <span className="text-base mt-0.5">⚠</span>
        <span className="text-balance">
          DeFi envolve risco de perda total de capital. APR histórico não garante retorno futuro.
          Perda impermanente pode reduzir o valor da posição. Opere com valores que está disposto a perder.
        </span>
      </div>

      {/* ── Pool ranking ─────────────────────────────────────── */}
      <section id="pools-section" className="space-y-5 scroll-mt-24">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Ranking de pools
              {hasRealData && !loading && (
                <span className="ml-3 badge-success text-[11px] align-middle">dados reais</span>
              )}
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Ranqueadas por volume, liquidez, consistência de fees e custo de gas.
            </p>
          </div>
          <button
            onClick={() => fetchPools(network)}
            disabled={loading}
            className="btn-ghost text-sm disabled:opacity-40"
          >
            {loading ? <><span className="spinner-sm" />Atualizando…</> : '↺ Atualizar'}
          </button>
        </div>

        {/* Network selector */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {[
            ...NETWORKS,
            ...(showHighGas ? [{ label: 'Ethereum 🔥 Gas alto', value: '1' }] : []),
          ].map(n => (
            <button
              key={n.value}
              onClick={() => setNetwork(n.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border ${
                network === n.value
                  ? 'bg-violet-600 border-violet-500 text-white shadow-glow-sm'
                  : n.value === '1'
                    ? 'bg-red-950/30 border-red-900/30 text-red-400 hover:border-red-800/50'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:border-white/[0.16] hover:text-slate-200'
              }`}
            >
              {n.label}
            </button>
          ))}
          <button
            onClick={() => { setShowHighGas(v => !v); if (!showHighGas === false && network === '1') setNetwork('global'); }}
            className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-dashed border-white/[0.10] text-slate-600 hover:text-slate-400 hover:border-white/[0.20] transition-all"
          >
            {showHighGas ? '✕ Ocultar gas alto' : '+ Mostrar redes com gas alto'}
          </button>
        </div>

        {/* Source badges */}
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

        {/* Loading */}
        {loading && (
          <div className="card text-center py-16 space-y-4">
            <div className="spinner-brand mx-auto" style={{ width: 40, height: 40, borderWidth: 3 }} />
            <div>
              <p className="text-slate-300 font-medium">Buscando pools on-chain…</p>
              <p className="text-slate-600 text-sm mt-1">DeFi Llama · The Graph · multichain</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="card border-red-900/40 bg-red-950/10 space-y-3">
            <p className="text-red-400 font-medium">Erro ao buscar pools</p>
            <p className="text-red-400/60 text-sm">{error}</p>
            <button onClick={() => fetchPools(network)} className="btn-outline text-sm">
              Tentar novamente
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && poolsArray.length === 0 && (
          <div className="card text-center py-16 space-y-4">
            <p className="text-5xl">📭</p>
            <p className="text-slate-300 font-medium">Nenhuma pool encontrada</p>
            <p className="text-slate-600 text-sm">
              Verifique se o backend está rodando com{' '}
              <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-xs">npm run dev</code>
            </p>
          </div>
        )}

        {/* Pools */}
        {!loading && !error && poolsArray.length > 0 && (
          <PoolRanking pools={poolsArray} onSimulate={handleSimulate} />
        )}
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <div className="divider" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4">
        {[
          {
            icon: '💰',
            title: 'Como ganhamos',
            body: 'Cobramos apenas sobre lucros sacados — nunca sobre seu capital. Se você não ganhar, não cobramos nada.',
          },
          {
            icon: '⛽',
            title: 'Gas e taxas DeFi',
            body: 'Gas é pago diretamente para a rede blockchain. A taxa de swap (0.05%–1%) vai para provedores de liquidez como você.',
          },
          {
            icon: '🔒',
            title: 'Segurança',
            body: 'Não custódia — seus fundos ficam na sua carteira. Operamos via contratos auditados da Uniswap V3.',
          },
        ].map(({ icon, title, body }) => (
          <div key={title} className="panel space-y-2">
            <p className="text-2xl">{icon}</p>
            <p className="text-white font-semibold text-sm">{title}</p>
            <p className="text-slate-500 text-xs leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

    </div>
  );
}

function StatCard({ icon, label, value, sub, subColor = 'text-slate-600', accent = false }) {
  return (
    <div className={`card-hover ${accent ? 'border-violet-800/20' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xl">{icon}</span>
        {accent && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
      </div>
      <p className="stat-label mb-1.5">{label}</p>
      <div className="min-h-[2rem] flex items-center">{value}</div>
      {sub && <p className={`text-xs mt-1.5 leading-snug ${subColor || 'text-slate-600'}`}>{sub}</p>}
    </div>
  );
}
