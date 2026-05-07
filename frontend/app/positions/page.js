'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useWallet } from '../../components/common/WalletProvider';
import {
  getPositionsForAddress, collectPositionFees, closePosition,
  getPositionLiquidityAmounts, readAccruedFees,
} from '../../lib/web3';
import { getTokenPricesUSD, toUSD, fmtUSD } from '../../lib/prices';
import HarvestModal from '../../components/harvest/HarvestModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHAIN_EXPLORER = {
  1: 'https://etherscan.io', 8453: 'https://basescan.org',
  42161: 'https://arbiscan.io', 10: 'https://optimistic.etherscan.io',
  137: 'https://polygonscan.com',
};
const CHAIN_NAME = {
  1: 'Ethereum', 8453: 'Base', 42161: 'Arbitrum', 10: 'Optimism', 137: 'Polygon', 56: 'BNB',
};

// ── localStorage helpers ───────────────────────────────────────────────────────

function loadMintRecords(walletAddress) {
  if (typeof window === 'undefined' || !walletAddress) return {};
  const prefix = `flowfi.position.${walletAddress.toLowerCase()}.`;
  const map = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const rec = JSON.parse(raw);
      const id = rec.tokenId || key.slice(prefix.length);
      map[id] = rec;
    }
  } catch {}
  return map;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtAmt(val, decimals = 18) {
  try {
    const n = Number(BigInt(val || '0')) / 10 ** decimals;
    if (n === 0) return '0';
    if (n < 0.0001) return '<0.0001';
    return n.toFixed(Math.min(decimals, 6));
  } catch { return '—'; }
}

function fmtAmt2(n) {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n < 0.000001) return '<0.000001';
  if (n < 0.001) return n.toExponential(2);
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function fmtHuman(n) {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n < 0.0001) return '<0.0001';
  if (n > 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n > 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function fmtPct(n, decimals = 1) {
  if (!Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

// APR = (fees / invested) / days * 365 × 100  (annualised, from mint date)
function calcAPR(feesUSD, investedUSD, createdAt) {
  if (!feesUSD || !investedUSD || !createdAt || investedUSD <= 0) return null;
  const days = (Date.now() - createdAt) / 86_400_000;
  if (days < 0.05) return null; // avoid nonsensical APR in first hour
  return (feesUSD / investedUSD / days) * 365 * 100;
}

// IL = LP_now / HODL_now - 1   (negative = loss vs holding)
// Uses entry token amounts and current prices
function calcIL(amount0Entry, amount1Entry, amount0Now, amount1Now, price0, price1) {
  if (!price0 || !price1) return null;
  const a0e = Number(amount0Entry) || 0;
  const a1e = Number(amount1Entry) || 0;
  if (a0e <= 0 && a1e <= 0) return null;
  const hodl = a0e * price0 + a1e * price1;
  if (hodl <= 0) return null;
  const lp   = (amount0Now || 0) * price0 + (amount1Now || 0) * price1;
  return (lp / hodl - 1) * 100; // percentage, negative = IL
}

function parseErr(err) {
  const msg = err.shortMessage || err.message || '';
  if (err.code === 4001 || msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied'))
    return 'Transação cancelada pelo usuário.';
  return msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
}

// Normalize active-only positions: filter liquidity > 0, dedup by tokenId
function normalizeActive(raw) {
  const active = raw.filter(p => {
    try { return BigInt(p.liquidity || 0) > 0n; } catch { return false; }
  });
  return Array.from(new Map(active.map(p => [String(p.tokenId), p])).values());
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PositionsPage() {
  const { address, chainId, connect } = useWallet();

  const [positions,         setPositions]         = useState([]);
  const [lastGoodPositions, setLastGoodPositions] = useState([]);
  const [harvestPosition,   setHarvestPosition]   = useState(null);
  const [isLoading,         setIsLoading]         = useState(false);
  const [hasLoadedOnce,     setHasLoadedOnce]     = useState(false);
  const [error,             setError]             = useState(null);
  const [totalBalance,      setTotalBalance]      = useState(0);
  const [actionState,       setActionState]       = useState({});
  const [mintRecords,       setMintRecords]       = useState({});
  const [lastRefresh,       setLastRefresh]       = useState(null);
  const [isSyncing,         setIsSyncing]         = useState(false);

  const [posValues, setPosValues] = useState({});
  const [prices,    setPrices]    = useState({});

  const explorer = CHAIN_EXPLORER[chainId] || 'https://basescan.org';

  // ── Load positions ─────────────────────────────────────────────────────────

  const loadPositions = useCallback((silent = false) => {
    if (!address) return;
    if (!silent) { setIsLoading(true); setError(null); }
    else setIsSyncing(true);

    getPositionsForAddress(address, chainId || 8453)
      .then(({ positions: raw, totalBalance }) => {
        const unique = normalizeActive(raw);
        setPositions(unique);
        setLastGoodPositions(unique);
        setTotalBalance(totalBalance);
        setHasLoadedOnce(true);
        setLastRefresh(new Date());
      })
      .catch(err => {
        console.warn('[positions] load error', err);
        if (!silent) setError(true);
        // On error: keep existing cards visible
      })
      .finally(() => { setIsLoading(false); setIsSyncing(false); });
  }, [address, chainId]);

  useEffect(() => { loadPositions(); }, [loadPositions]);

  // Smart auto-refresh: 8s active tab, 30s inactive
  const refreshTimer = useRef(null);
  useEffect(() => {
    if (!address) return;
    const delay = () =>
      typeof document !== 'undefined' && document.visibilityState === 'hidden' ? 30_000 : 8_000;
    const schedule = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { loadPositions(true); schedule(); }, delay());
    };
    const onVisibility = () => schedule();
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      clearTimeout(refreshTimer.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadPositions, address]);

  useEffect(() => {
    if (address) setMintRecords(loadMintRecords(address));
  }, [address]);

  // ── Async value computation ────────────────────────────────────────────────
  // Keep stale values for known positions on refresh — prevents skeleton flash.

  useEffect(() => {
    if (!positions.length) { setPosValues({}); return; }

    setPosValues(prev => {
      const next = {};
      for (const pos of positions) next[pos.tokenId] = prev[pos.tokenId] ?? { loading: true };
      return next;
    });

    const symbols = [...new Set(
      positions.flatMap(p => [p.token0Symbol, p.token1Symbol]).filter(s => s && s !== '—')
    )];

    getTokenPricesUSD(symbols).then(fetchedPrices => {
      setPrices(fetchedPrices);

      for (const pos of positions) {
        const rec = mintRecords[pos.tokenId];

        (async () => {
          // Real accrued fees via simulate collect() — falls back to tokensOwed on error
          let fees0 = 0, fees1 = 0;
          try {
            const { amount0: a0, amount1: a1 } = await readAccruedFees(pos.tokenId, address, chainId || 8453);
            fees0 = Number(a0) / 10 ** pos.decimals0;
            fees1 = Number(a1) / 10 ** pos.decimals1;
          } catch {
            fees0 = Number(BigInt(pos.tokensOwed0 || '0')) / 10 ** pos.decimals0;
            fees1 = Number(BigInt(pos.tokensOwed1 || '0')) / 10 ** pos.decimals1;
          }

          const f0USD = toUSD(fees0, pos.token0Symbol, fetchedPrices);
          const f1USD = toUSD(fees1, pos.token1Symbol, fetchedPrices);
          const feesUSD = f0USD != null || f1USD != null ? (f0USD ?? 0) + (f1USD ?? 0) : null;

          if (!pos.hasLiquidity) {
            const aprPct = rec?.investedUSD && rec?.createdAt
              ? calcAPR(feesUSD ?? 0, Number(rec.investedUSD), rec.createdAt) : null;
            setPosValues(prev => ({
              ...prev,
              [pos.tokenId]: {
                loading: false, amount0: 0, amount1: 0, liqUSD: 0,
                fees0, fees1, fees0USD: f0USD, fees1USD: f1USD, feesUSD,
                totalUSD: feesUSD ?? 0, inRange: false, aprPct,
              },
            }));
            return;
          }

          try {
            const { amount0, amount1, inRange } = await getPositionLiquidityAmounts(pos, chainId || 8453);
            const calcFailed = amount0 === 0 && amount1 === 0 && BigInt(pos.liquidity || '0') > 0n;

            let liqUSD = null;
            if (!calcFailed) {
              const v0 = toUSD(amount0, pos.token0Symbol, fetchedPrices);
              const v1 = toUSD(amount1, pos.token1Symbol, fetchedPrices);
              if (v0 != null || v1 != null) liqUSD = (v0 ?? 0) + (v1 ?? 0);
            }

            const totalUSD = liqUSD != null && feesUSD != null ? liqUSD + feesUSD
              : liqUSD != null ? liqUSD
              : feesUSD != null ? feesUSD
              : null;

            // First-visit snapshot: save invested capital when position has no mint record
            if (!rec && !calcFailed && liqUSD != null && liqUSD > 0) {
              const snapshot = {
                tokenId: pos.tokenId,
                investedUSD: liqUSD + (feesUSD ?? 0),
                amount0,
                amount1,
                createdAt: Date.now(),
                isEstimate: true,
              };
              try {
                localStorage.setItem(
                  `flowfi.position.${address.toLowerCase()}.${pos.tokenId}`,
                  JSON.stringify(snapshot)
                );
                setMintRecords(prev => ({ ...prev, [pos.tokenId]: snapshot }));
              } catch {}
            }

            const activeRec = rec || mintRecords[pos.tokenId];
            const investedUSD = activeRec?.investedUSD ? Number(activeRec.investedUSD) : null;
            const aprPct = feesUSD != null && investedUSD && activeRec?.createdAt
              ? calcAPR(feesUSD, investedUSD, activeRec.createdAt) : null;

            const p0 = fetchedPrices[pos.token0Symbol];
            const p1 = fetchedPrices[pos.token1Symbol];
            const ilPct = !calcFailed && activeRec?.amount0 != null
              ? calcIL(activeRec.amount0, activeRec.amount1, amount0, amount1, p0, p1) : null;

            const roiPct = totalUSD != null && investedUSD
              ? (totalUSD - investedUSD) / investedUSD * 100 : null;

            setPosValues(prev => ({
              ...prev,
              [pos.tokenId]: {
                loading: false, amount0, amount1, liqUSD,
                fees0, fees1, fees0USD: f0USD, fees1USD: f1USD, feesUSD,
                totalUSD, inRange, priceKnown: liqUSD != null, calcFailed,
                aprPct, ilPct, roiPct,
              },
            }));
          } catch {
            setPosValues(prev => ({
              ...prev,
              [pos.tokenId]: { loading: false, error: true, fees0, fees1, feesUSD, fees0USD: f0USD, fees1USD: f1USD },
            }));
          }
        })();
      }
    });
  }, [positions, chainId, address]);

  // ── Summary metrics ───────────────────────────────────────────────────────

  // During refresh keep last known cards; fall back to lastGoodPositions to avoid blank flash
  const visiblePositions = positions.length ? positions : lastGoodPositions;

  const valuesReady   = Object.values(posValues).length > 0 && Object.values(posValues).every(v => !v.loading);
  const anyPriceKnown = Object.values(posValues).some(v => v.priceKnown);
  const totalValueUSD = anyPriceKnown ? Object.values(posValues).reduce((s, v) => s + (v.totalUSD ?? 0), 0) : null;
  const totalFeesUSD  = Object.values(posValues).reduce((s, v) => s + (v.feesUSD != null ? v.feesUSD : 0), 0);
  const totalLiqUSD   = anyPriceKnown ? Object.values(posValues).reduce((s, v) => s + (v.liqUSD ?? 0), 0) : null;
  const activeCount   = visiblePositions.length; // all visible positions have liquidity (filtered)
  const investedByPos = visiblePositions.reduce((map, pos) => {
    const rec = mintRecords[pos.tokenId];
    if (rec?.investedUSD) map[pos.tokenId] = Number(rec.investedUSD);
    return map;
  }, {});
  const totalInvestedUSD = Object.values(investedByPos).reduce((s, v) => s + v, 0);

  // ── Action handlers ────────────────────────────────────────────────────────

  function setPosAct(tokenId, patch) {
    setActionState(prev => ({ ...prev, [tokenId]: { ...prev[tokenId], ...patch } }));
  }

  async function handleCollect(pos) {
    const pv = posValues[pos.tokenId];
    const hasRealFees  = pv?.fees0 > 0 || pv?.fees1 > 0;
    const hasOwedFees  = BigInt(pos.tokensOwed0 || '0') > 0n || BigInt(pos.tokensOwed1 || '0') > 0n;
    if (!hasRealFees && !hasOwedFees) {
      setPosAct(pos.tokenId, { step: 'noFees' });
      return;
    }
    setPosAct(pos.tokenId, { step: 'collecting', hash: null, error: null });
    try {
      const { hash } = await collectPositionFees(pos.tokenId, address, chainId || 8453);
      setPosAct(pos.tokenId, { step: 'collected', hash });
      loadPositions(true);
    } catch (err) { setPosAct(pos.tokenId, { step: 'error', error: parseErr(err) }); }
  }

  async function handleFinalize(pos) {
    if (!pos.hasLiquidity) return;
    setPosAct(pos.tokenId, { step: 'finalizing', hash: null, error: null });
    try {
      const { hash } = await closePosition(pos.tokenId, pos.liquidity, address, chainId || 8453);
      setPosAct(pos.tokenId, { step: 'finalized', hash });
      loadPositions(true);
    } catch (err) { setPosAct(pos.tokenId, { step: 'error', error: parseErr(err) }); }
  }

  // ── Not connected ──────────────────────────────────────────────────────────

  if (!address) {
    return (
      <div className="max-w-md mx-auto mt-16 card text-center space-y-5 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-violet-950/50 border border-violet-800/30 flex items-center justify-center mx-auto text-3xl">🔗</div>
        <div>
          <h2 className="text-xl font-bold text-white">Conecte sua carteira</h2>
          <p className="text-slate-500 text-sm mt-2">Ver e gerenciar suas posições de liquidez — saque lucros e retire capital.</p>
        </div>
        <button onClick={connect} className="btn-primary w-full">Conectar Carteira</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Minhas Posições</h1>
          <p className="text-slate-500 text-sm mt-1">
            {CHAIN_NAME[chainId] || 'Base'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="badge-neutral font-mono text-xs">{address.slice(0, 6)}…{address.slice(-4)}</span>
          {isSyncing && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-950/30 border border-violet-800/30 text-violet-400 flex items-center gap-1">
              <span className="spinner-sm" style={{ width: 8, height: 8, borderWidth: 1.5 }} />
              Sincronizando
            </span>
          )}
          {lastRefresh && !isSyncing && (
            <span className="text-[10px] text-slate-700">
              {lastRefresh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {!isLoading && (
            <button onClick={() => loadPositions(false)} className="btn-outline text-xs px-3 py-1.5">↺ Recarregar</button>
          )}
        </div>
      </div>

      {/* ── First-load skeleton ─────────────────────────────────────────── */}
      {isLoading && !hasLoadedOnce && (
        <div className="space-y-4">
          <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
            <div className="skeleton-shimmer h-5 w-40 rounded-lg" />
            <div className="skeleton-shimmer h-10 w-48 rounded-xl" />
            <div className="grid grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="skeleton-shimmer h-16 rounded-xl" />)}
            </div>
          </div>
          {[1,2].map(i => (
            <div key={i} className="card space-y-4">
              <div className="flex justify-between">
                <div className="skeleton-shimmer h-7 w-32 rounded-xl" />
                <div className="skeleton-shimmer h-8 w-24 rounded-xl" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3].map(j => <div key={j} className="skeleton-shimmer h-16 rounded-xl" />)}
              </div>
              <div className="skeleton-shimmer h-10 rounded-xl" />
            </div>
          ))}
          <p className="text-center text-slate-600 text-sm">Sincronizando suas posições na {CHAIN_NAME[chainId] || 'Base'}…</p>
        </div>
      )}

      {/* ── Error (RPC/balanceOf failure) ───────────────────────────── */}
      {error && !isLoading && visiblePositions.length === 0 && (
        <div className="card text-center py-10 space-y-3">
          <p className="text-3xl">📡</p>
          <p className="text-slate-300 font-medium">Não foi possível sincronizar suas posições agora.</p>
          <p className="text-slate-600 text-sm">Isso pode acontecer por instabilidade do RPC. Tente novamente em alguns segundos.</p>
          <button onClick={() => loadPositions(false)} className="btn-outline text-sm">Tentar novamente</button>
        </div>
      )}

      {/* ── Empty ──────────────────────────────────────────────────────── */}
      {hasLoadedOnce && !isLoading && !error && visiblePositions.length === 0 && (
        <div className="card text-center py-14 space-y-4">
          <p className="text-5xl">📭</p>
          <p className="text-slate-300 font-medium">Você não possui posições ativas no momento.</p>
          <p className="text-slate-600 text-sm">Posições sem liquidez foram ocultadas para manter sua carteira limpa.</p>
          <a href="/pools" className="btn-primary inline-flex mx-auto w-fit">Encontrar pools</a>
        </div>
      )}

      {/* ── Patrimônio panel ────────────────────────────────────────────── */}
      {hasLoadedOnce && !isLoading && visiblePositions.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(8,8,26,0.97) 65%)',
          border: '1px solid rgba(124,58,237,0.22)',
        }}>
          <div className="px-5 pt-5 pb-4 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-[11px] text-violet-400 font-medium uppercase tracking-widest mb-1">
                  Seu patrimônio — {CHAIN_NAME[chainId] || 'Base'}
                </p>
                {!valuesReady ? (
                  <div className="space-y-1.5">
                    <div className="skeleton-shimmer h-9 w-40 rounded-xl" />
                    <div className="skeleton-shimmer h-4 w-32 rounded" />
                  </div>
                ) : anyPriceKnown ? (
                  <>
                    <p className="text-3xl font-bold text-white tabular-nums">{fmtUSD(totalValueUSD)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">valor atual estimado em pool + taxas</p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-semibold text-slate-400">Estimativa parcial</p>
                    <p className="text-xs text-slate-600 mt-0.5">Preço de mercado indisponível para alguns tokens</p>
                  </>
                )}
              </div>
              {totalFeesUSD > 0 && (
                <div className="text-right">
                  <p className="text-[11px] text-emerald-400 uppercase tracking-wider mb-1">Lucro disponível</p>
                  <p className="text-2xl font-bold text-emerald-400 tabular-nums">{fmtUSD(totalFeesUSD)}</p>
                  <p className="text-xs text-slate-600 mt-0.5">pronto para saque</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniPanel label="Posições ativas" value={<span className="text-white font-bold text-xl">{activeCount}</span>} sub={`de ${visiblePositions.length} total`} />
              <MiniPanel
                label="Valor em pools"
                value={
                  !valuesReady ? <div className="skeleton-shimmer h-5 w-20 rounded" />
                  : totalLiqUSD != null ? <span className="text-white font-bold text-base">{fmtUSD(totalLiqUSD)}</span>
                  : <span className="text-slate-500 text-sm">—</span>
                }
                sub="liquidez ativa"
              />
              <MiniPanel
                label="Lucro acumulado"
                value={
                  !valuesReady ? <div className="skeleton-shimmer h-5 w-16 rounded" />
                  : totalFeesUSD > 0 ? <span className="text-emerald-400 font-bold text-base">{fmtUSD(totalFeesUSD)}</span>
                  : <span className="text-slate-500 text-sm">$0</span>
                }
                sub="taxas acumuladas"
              />
              <MiniPanel
                label="Investido estimado"
                value={
                  totalInvestedUSD > 0
                    ? <span className="text-white font-bold text-base">{fmtUSD(totalInvestedUSD)}</span>
                    : <span className="text-slate-600 text-xs leading-snug">Crie posições via Flowfy para rastrear</span>
                }
                sub={totalInvestedUSD > 0 ? 'via mints rastreados' : ''}
              />
            </div>
            <p className="text-[10px] text-slate-700">
              Estimativas baseadas em dados onchain e preços de mercado. Não constitui recomendação financeira.
            </p>
          </div>
        </div>
      )}

      {/* ── Info tip ───────────────────────────────────────────────────── */}
      {hasLoadedOnce && !isLoading && visiblePositions.length > 0 && (
        <div className="flex items-start gap-3 bg-violet-950/20 border border-violet-800/20 rounded-xl px-4 py-3 text-xs text-violet-400/80">
          <span className="shrink-0 mt-0.5">ℹ</span>
          <span>Você pode sacar lucros sem retirar liquidez. Gas é pago para a rede blockchain — não para a plataforma.</span>
        </div>
      )}

      {/* ── Position cards ──────────────────────────────────────────────── */}
      {hasLoadedOnce && !isLoading && visiblePositions.length > 0 && (
        <div className="space-y-4">
          {visiblePositions.map(pos => (
            <PositionCard
              key={pos.tokenId}
              pos={pos}
              pv={posValues[pos.tokenId]}
              act={actionState[pos.tokenId] || { step: 'idle' }}
              localRecord={mintRecords[pos.tokenId]}
              prices={prices}
              explorer={explorer}
              chainId={chainId}
              onCollect={handleCollect}
              onFinalize={handleFinalize}
              onRetry={() => loadPositions(false)}
            />
          ))}
        </div>
      )}

      {harvestPosition && (
        <HarvestModal
          position={harvestPosition}
          onClose={() => setHarvestPosition(null)}
          onSuccess={() => { setHarvestPosition(null); loadPositions(true); }}
        />
      )}
    </div>
  );
}

// ── Position card ─────────────────────────────────────────────────────────────

function PositionCard({ pos, pv, act, localRecord, prices, explorer, chainId, onCollect, onFinalize, onRetry }) {
  // Partial card: positions() read failed
  if (pos.syncStatus === 'partial') {
    const mgr = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
    return (
      <div className="card-hover space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-white">Posição #{pos.tokenId}</h3>
              <span className="badge badge-warning">⏳ Parcial</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span>NFT #{pos.tokenId}</span>
              {explorer && (
                <><span>·</span>
                  <a href={`${explorer}/token/${mgr}?a=${pos.tokenId}`}
                     target="_blank" rel="noopener noreferrer"
                     className="text-violet-500 hover:text-violet-400 hover:underline">
                    Ver no explorer ↗
                  </a>
                </>
              )}
            </div>
          </div>
          <span className="text-slate-600 text-sm">Sincronizando…</span>
        </div>
        <div className="flex items-start gap-2 text-xs text-amber-400/70 bg-amber-950/20 border border-amber-900/20 rounded-xl px-3 py-2.5">
          <span className="shrink-0">⏳</span>
          <span>Detalhes desta posição ainda estão sincronizando. Tente recarregar em alguns segundos.</span>
        </div>
        <button onClick={onRetry} className="btn-outline text-sm w-full">↺ Tentar sincronizar</button>
      </div>
    );
  }

  const busy   = act.step === 'collecting' || act.step === 'finalizing';
  const isDone = act.step === 'finalized';
  // Use real fee values from simulation when available; fall back to tokensOwed snapshot
  const hasFees = (pv?.fees0 > 0 || pv?.fees1 > 0)
    || BigInt(pos.tokensOwed0 || '0') > 0n || BigInt(pos.tokensOwed1 || '0') > 0n;

  const sym0 = pos.token0Symbol && pos.token0Symbol !== '???' && pos.token0Symbol !== '—'
    ? pos.token0Symbol
    : `${String(pos.token0 || '').slice(0, 6)}…${String(pos.token0 || '').slice(-4)}`;
  const sym1 = pos.token1Symbol && pos.token1Symbol !== '???' && pos.token1Symbol !== '—'
    ? pos.token1Symbol
    : `${String(pos.token1 || '').slice(0, 6)}…${String(pos.token1 || '').slice(-4)}`;

  const inRange = pv?.inRange;
  const statusClass = inRange === true  ? 'badge-success'
    : inRange === false ? 'badge-warning'
    : 'badge-success';

  const totalUSD = pv?.totalUSD;
  const liqUSD   = pv?.liqUSD;
  const feesUSD  = pv?.feesUSD;
  const aprPct   = pv?.aprPct;
  const ilPct    = pv?.ilPct;
  const roiPct   = pv?.roiPct;

  const investedUSD = localRecord?.investedUSD ? Number(localRecord.investedUSD) : null;
  const pnl = (totalUSD != null && investedUSD != null) ? totalUSD - investedUSD : null;
  const smallFeesWarning = feesUSD != null && feesUSD > 0 && feesUSD < 0.05;
  const hasIL = ilPct != null && ilPct < -1; // only show if IL > 1%

  return (
    <div className={`card-hover space-y-4 transition-opacity ${isDone ? 'opacity-50' : ''}`}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-xl text-white tracking-tight">{sym0}/{sym1}</h3>
            <span className={`badge ${statusClass}`}>
              {inRange === true ? '● Em range' : inRange === false ? '⚠ Fora do range' : '● Ativa'}
            </span>
            {hasFees && <span className="badge-warning text-xs">Lucro disponível</span>}
            {aprPct != null && (
              <span className="badge-info text-xs">
                {aprPct >= 100 ? `${aprPct.toFixed(0)}% APR` : `${aprPct.toFixed(1)}% APR`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
            <span>NFT #{pos.tokenId}</span>
            <span>·</span>
            <span className="badge-neutral">{pos.feeTierLabel}</span>
            <span>·</span>
            <span>{CHAIN_NAME[chainId] || 'Base'}</span>
            <a href={`${explorer}/token/${pos.token0 || ''}?a=${pos.tokenId}`}
               target="_blank" rel="noopener noreferrer"
               className="text-violet-500 hover:text-violet-400 hover:underline">
              Ver no explorer ↗
            </a>
          </div>
        </div>

        {/* Big value — never show $0 for active position */}
        <div className="text-right min-w-[7rem]">
          {pv?.loading ? (
            <div className="skeleton-shimmer h-8 w-28 rounded-xl" />
          ) : pv?.error || pv?.calcFailed ? (
            <p className="text-slate-600 text-sm">Estimativa indisponível</p>
          ) : totalUSD != null && totalUSD > 0 ? (
            <>
              <p className="text-2xl font-bold text-white tabular-nums">{fmtUSD(totalUSD)}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">valor total estimado</p>
            </>
          ) : (
            <div className="skeleton-shimmer h-8 w-28 rounded-xl" />
          )}
        </div>
      </div>

      {/* ── Financial metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricBox
          label="Capital investido"
          value={investedUSD != null ? fmtUSD(investedUSD) : <span className="text-slate-600 text-xs">—</span>}
          sub={investedUSD != null ? 'via Flowfy' : 'não rastreado'}
        />
        <MetricBox
          label="Fees acumuladas"
          value={
            pv?.loading ? <div className="skeleton-shimmer h-5 w-16 rounded" />
            : feesUSD != null && feesUSD > 0
              ? <span className="text-emerald-400 font-bold">{fmtUSD(feesUSD)}</span>
              : feesUSD === 0
                ? <span className="text-slate-600 text-xs">Nenhuma ainda</span>
                : <span className="text-slate-600">—</span>
          }
          sub={
            pv?.fees0 != null
              ? `${fmtAmt2(pv.fees0)} ${sym0} · ${fmtAmt2(pv.fees1)} ${sym1}`
              : `${fmtAmt(pos.tokensOwed0, pos.decimals0)} ${sym0} · ${fmtAmt(pos.tokensOwed1, pos.decimals1)} ${sym1}`
          }
          highlighted={hasFees}
        />
        <MetricBox
          label="APR (anualizado)"
          value={
            pv?.loading ? <div className="skeleton-shimmer h-5 w-14 rounded" />
            : aprPct != null
              ? <span className="text-violet-400 font-bold">{aprPct >= 999 ? '>999%' : `${aprPct.toFixed(1)}%`}</span>
              : <span className="text-slate-600 text-xs">—</span>
          }
          sub={aprPct != null ? 'baseado em fees / capital' : 'abra posição via Flowfy'}
        />
        <MetricBox
          label="ROI / Resultado"
          value={
            pv?.loading ? <div className="skeleton-shimmer h-5 w-16 rounded" />
            : roiPct != null
              ? <span className={roiPct >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                  {fmtPct(roiPct)}
                </span>
              : pnl != null
                ? <span className={pnl >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {pnl >= 0 ? '+' : ''}{fmtUSD(pnl)}
                  </span>
                : <span className="text-slate-600 text-xs">—</span>
          }
          sub={
            roiPct != null ? `${pnl >= 0 ? '+' : ''}${fmtUSD(pnl)} total`
            : pnl != null ? (pnl >= 0 ? 'lucro estimado' : 'perda estimada')
            : 'sem dados de entrada'
          }
        />
      </div>

      {/* ── Liquidity breakdown ── */}
      {!pv?.loading && (pv?.amount0 > 0 || pv?.amount1 > 0) && (
        <div className="flex items-center gap-3 text-xs text-slate-500 bg-white/[0.02] border border-white/[0.04] rounded-xl px-3 py-2">
          <span className="text-slate-600">Capital em pool:</span>
          <span className="text-white font-medium tabular-nums">
            {fmtHuman(pv.amount0)} {sym0} · {fmtHuman(pv.amount1)} {sym1}
          </span>
          {liqUSD != null && liqUSD > 0 && (
            <span className="ml-auto text-slate-400 font-semibold">{fmtUSD(liqUSD)}</span>
          )}
        </div>
      )}

      {/* ── Tips ── */}
      {inRange === false && (
        <div className="flex items-start gap-2 text-xs text-amber-400/80 bg-amber-950/20 border border-amber-900/20 rounded-xl px-3 py-2.5">
          <span className="shrink-0">⚠</span>
          <span>Posição fora do range — não está gerando taxas. Considere finalizar e reabrir no range atual.</span>
        </div>
      )}
      {hasIL && (
        <div className="flex items-start gap-2 text-xs text-orange-400/80 bg-orange-950/20 border border-orange-900/20 rounded-xl px-3 py-2.5">
          <span className="shrink-0">📉</span>
          <span>
            Perda impermanente estimada: <strong className="text-orange-400">{fmtPct(ilPct)}</strong> em relação a manter os tokens. As fees acumuladas podem compensar este valor.
          </span>
        </div>
      )}
      {smallFeesWarning && (
        <div className="flex items-start gap-2 text-xs text-slate-500 bg-white/[0.02] border border-white/[0.04] rounded-xl px-3 py-2">
          <span className="shrink-0">⛽</span>
          <span>Fees abaixo de $0.05 podem não compensar o custo de gas da coleta.</span>
        </div>
      )}

      {/* ── Action feedback ── */}
      {(act.step === 'collected' || act.step === 'finalized') && act.hash && (
        <div className="flex items-center gap-3 bg-emerald-950/30 border border-emerald-900/40 rounded-xl px-4 py-3 text-sm text-emerald-400">
          <span>✓</span>
          <span>{act.step === 'collected' ? 'Lucro sacado com sucesso!' : 'Posição finalizada!'}</span>
          <a href={`${explorer}/tx/${act.hash}`} target="_blank" rel="noopener noreferrer"
             className="ml-auto text-xs underline text-emerald-300">Ver transação ↗</a>
        </div>
      )}
      {act.step === 'error' && act.error && (
        <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3 text-sm text-red-400">{act.error}</div>
      )}

      {/* ── Actions ── */}
      {!isDone && (
        <div className="flex gap-2 flex-wrap pt-1">
          {/* Sacar lucro — disabled when no fees accrued */}
          <button
            disabled={busy || !hasFees}
            onClick={() => onCollect(pos)}
            className={`flex-1 py-2.5 text-sm ${!busy && hasFees ? 'btn-success' : 'btn-outline'}`}
          >
            {act.step === 'collecting'
              ? <><span className="spinner-sm mr-1.5" />Sacando…</>
              : hasFees ? 'Sacar lucro' : 'Sem lucro para sacar'}
          </button>

          {/* Finalizar posição = decreaseLiquidity + collect */}
          {pos.hasLiquidity && (
            <button disabled={busy} onClick={() => onFinalize(pos)} className="btn-danger flex-1 py-2.5 text-sm">
              {act.step === 'finalizing' ? <><span className="spinner-sm mr-1.5" />Finalizando…</> : 'Finalizar posição'}
            </button>
          )}
        </div>
      )}

      {!isDone && inRange !== false && (
        <p className="text-xs text-slate-700">Gerando lucro enquanto o preço estiver dentro do range.</p>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MiniPanel({ label, value, sub }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 space-y-1">
      <p className="text-[10px] text-slate-600 uppercase tracking-wider">{label}</p>
      <div className="min-h-[1.75rem] flex items-center">{value}</div>
      {sub && <p className="text-[10px] text-slate-700">{sub}</p>}
    </div>
  );
}

function MetricBox({ label, value, sub, highlighted }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-1">
      <p className="stat-label text-[10px]">{label}</p>
      <div className={`font-bold text-base tabular-nums ${highlighted ? 'text-emerald-400' : 'text-white'}`}>
        {value}
      </div>
      {sub && <p className="text-[10px] text-slate-700 truncate">{sub}</p>}
    </div>
  );
}
