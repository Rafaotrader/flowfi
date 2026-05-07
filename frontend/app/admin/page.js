'use client';
import { useEffect, useState } from 'react';

const PLATFORM_WALLET   = '0xb7516B25F52Ea4Cf3711D6fa83F844756209c07d';
const BASESCAN_WALLET   = `https://basescan.org/address/${PLATFORM_WALLET}`;
const BASESCAN_TXLIST   = `https://basescan.org/address/${PLATFORM_WALLET}#tokentxns`;

const BASE_RPCS = [
  'https://mainnet.base.org',
  'https://base.llamarpc.com',
  'https://base-rpc.publicnode.com',
];

// ERC20 tokens to track on Base
const TRACKED_TOKENS = [
  { symbol: 'USDC',  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6  },
  { symbol: 'WETH',  address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { symbol: 'cbBTC', address: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', decimals: 8  },
  { symbol: 'USDbC', address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6  },
];

// ERC20 balanceOf selector: 0x70a08231
const BAL_SELECTOR = '0x70a08231000000000000000000000000';

async function rpcCall(method, params) {
  for (const rpc of BASE_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(5000),
      });
      const { result } = await res.json();
      if (result != null) return result;
    } catch {}
  }
  return null;
}

async function fetchEthBalance(address) {
  const result = await rpcCall('eth_getBalance', [address, 'latest']);
  return result ? Number(BigInt(result)) / 1e18 : null;
}

async function fetchTokenBalance(tokenAddress, walletAddress, decimals) {
  // eth_call to balanceOf(wallet)
  const data = BAL_SELECTOR + walletAddress.slice(2).toLowerCase().padStart(64, '0');
  const result = await rpcCall('eth_call', [{ to: tokenAddress, data }, 'latest']);
  if (!result || result === '0x') return 0;
  return Number(BigInt(result)) / 10 ** decimals;
}

async function fetchAllTokenBalances(wallet) {
  const results = await Promise.all(
    TRACKED_TOKENS.map(async t => ({
      ...t,
      balance: await fetchTokenBalance(t.address, wallet, t.decimals),
    }))
  );
  return results.filter(t => t.balance > 0);
}

// CoinGecko prices for treasury tokens
async function fetchTreasuryPrices() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin,coinbase-wrapped-bitcoin&vs_currencies=usd',
      { signal: AbortSignal.timeout(6000) }
    );
    const d = await res.json();
    return {
      WETH:  d['ethereum']?.usd ?? null,
      USDC:  d['usd-coin']?.usd ?? 1,
      cbBTC: d['coinbase-wrapped-bitcoin']?.usd ?? null,
      USDbC: 1,
    };
  } catch { return {}; }
}

function fmt(n, dec = 6) {
  if (n == null) return '—';
  if (n === 0) return '0';
  return n.toFixed(dec).replace(/\.?0+$/, '');
}

function fmtUSD(n) {
  if (n == null || n === 0) return null;
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}K`;
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function AddrBadge({ addr }) {
  return (
    <a href={BASESCAN_WALLET} target="_blank" rel="noopener noreferrer"
       className="font-mono text-xs text-violet-400 hover:text-violet-300 hover:underline break-all">
      {addr}
    </a>
  );
}

function StatusRow({ label, status, note }) {
  const cls = status === 'real'    ? 'badge-success'
    : status === 'visual' ? 'badge-warning'
    : 'badge-neutral';
  const txt = status === 'real' ? '✓ On-chain' : status === 'visual' ? '⚠ Visual only' : status;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/[0.05] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium">{label}</p>
        {note && <p className="text-xs text-slate-500 mt-0.5">{note}</p>}
      </div>
      <span className={cls}>{txt}</span>
    </div>
  );
}

export default function AdminPage() {
  const [ethBalance,    setEthBalance]    = useState(null);
  const [tokenBals,     setTokenBals]     = useState([]);
  const [prices,        setPrices]        = useState({});
  const [balLoading,    setBalLoading]    = useState(true);
  const [lastUpdated,   setLastUpdated]   = useState(null);

  async function loadAll() {
    setBalLoading(true);
    const [eth, tokens, px] = await Promise.all([
      fetchEthBalance(PLATFORM_WALLET),
      fetchAllTokenBalances(PLATFORM_WALLET),
      fetchTreasuryPrices(),
    ]);
    setEthBalance(eth);
    setTokenBals(tokens);
    setPrices(px);
    setLastUpdated(new Date());
    setBalLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const ethUSD    = ethBalance != null && prices.WETH ? ethBalance * prices.WETH : null;
  const tokenTotalUSD = tokenBals.reduce((s, t) => {
    const p = prices[t.symbol];
    return s + (p != null ? t.balance * p : 0);
  }, 0);
  const totalUSD = (ethUSD ?? 0) + tokenTotalUSD;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in py-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Admin &mdash; Flowfy</h1>
        <p className="text-slate-500 text-sm mt-1">Dados on-chain em tempo real. Sem banco de dados.</p>
      </div>

      {/* Treasury overview */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h2 className="heading-section">Treasury (Base)</h2>
          {totalUSD > 0 && !balLoading && (
            <div className="text-right">
              <p className="stat-label">Total estimado</p>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">{fmtUSD(totalUSD) ?? '—'}</p>
            </div>
          )}
        </div>

        {/* ETH row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">ETH</span>
              <span className="badge-neutral text-[10px]">nativo</span>
            </div>
            {balLoading
              ? <div className="skeleton-shimmer h-5 w-24 rounded" />
              : <div className="text-right">
                  <span className="text-sm font-semibold text-white tabular-nums">
                    {ethBalance != null ? fmt(ethBalance, 6) : '—'} ETH
                  </span>
                  {ethUSD != null && <span className="text-xs text-slate-500 ml-2">{fmtUSD(ethUSD)}</span>}
                </div>
            }
          </div>

          {/* ERC20 tokens */}
          {balLoading
            ? [1,2].map(i => <div key={i} className="skeleton-shimmer h-9 rounded-xl" />)
            : tokenBals.length === 0
              ? <p className="text-xs text-slate-600 py-2">Nenhum token ERC20 detectado na carteira da plataforma.</p>
              : tokenBals.map(t => {
                  const usd = prices[t.symbol] != null ? t.balance * prices[t.symbol] : null;
                  return (
                    <div key={t.symbol} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
                      <span className="text-sm font-medium text-white">{t.symbol}</span>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-white tabular-nums">
                          {t.balance < 0.000001 ? '<0.000001' : fmt(t.balance, t.decimals > 6 ? 6 : t.decimals)}
                        </span>
                        {usd != null && <span className="text-xs text-slate-500 ml-2">{fmtUSD(usd)}</span>}
                      </div>
                    </div>
                  );
                })
          }
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-2 flex-wrap">
            <a href={BASESCAN_WALLET} target="_blank" rel="noopener noreferrer" className="btn-outline text-xs px-3 py-1.5">Basescan ↗</a>
            <a href={BASESCAN_TXLIST} target="_blank" rel="noopener noreferrer" className="btn-outline text-xs px-3 py-1.5">Token transfers ↗</a>
          </div>
          {lastUpdated && (
            <span className="text-[10px] text-slate-700">
              Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <p className="stat-label">Endereço</p>
          <AddrBadge addr={PLATFORM_WALLET} />
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="heading-section">Estrutura de taxas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Harvest &le; $500', val: '5%',  color: 'text-emerald-400' },
            { label: 'Harvest &gt; $500', val: '10%', color: 'text-emerald-400' },
            { label: 'Swap',              val: '0.5%', color: 'text-violet-400'  },
          ].map(({ label, val, color }) => (
            <div key={label} className="panel text-center space-y-1">
              <p className="stat-label" dangerouslySetInnerHTML={{ __html: label }} />
              <p className={`text-2xl font-bold tabular-nums ${color}`}>{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card space-y-1">
        <h2 className="heading-section mb-3">Status de envio on-chain</h2>
        <StatusRow label="Swap 0.5% — feeRecipient na 0x calldata" status="real" note="Parâmetros feeRecipient + buyTokenPercentageFee enviados à 0x API. Taxa descontada do buyAmount dentro do tx calldata." />
        <StatusRow label="Sacar lucro — Harvester contract" status="real" note="HarvestModal executa harvestWithFee() no contrato Harvester. Split on-chain automático." />
        <StatusRow label="Finalizar posição" status="visual" note="decreaseLiquidity + collect retorna 100% ao usuário. Sem taxa de saída de capital." />
      </div>

      <div className="card space-y-3">
        <h2 className="heading-section">Endereços de contrato</h2>
        {[
          { label: 'Harvester (Base)', addr: '0xD5c8C24dC133D3eC2C511B91738E9214709F804B' },
          { label: 'Uniswap V3 Position Manager (Base)', addr: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1' },
        ].map(({ label, addr }) => (
          <div key={addr} className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-400">{label}</p>
            <a href={`https://basescan.org/address/${addr}`} target="_blank" rel="noopener noreferrer"
               className="font-mono text-xs text-violet-400 hover:underline">
              {addr.slice(0, 10)}&hellip;{addr.slice(-8)}
            </a>
          </div>
        ))}
      </div>

      <div className="text-center">
        <button onClick={loadAll} disabled={balLoading} className="btn-outline text-sm">
          {balLoading ? <><span className="spinner-sm mr-1.5" />Carregando…</> : '↺ Atualizar treasury'}
        </button>
        <p className="text-xs text-slate-700 mt-2">Saldo lido via RPC — sem cache, sem banco de dados.</p>
      </div>
    </div>
  );
}
