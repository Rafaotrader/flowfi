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

async function fetchEthBalance(address) {
  for (const rpc of BASE_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
        signal: AbortSignal.timeout(5000),
      });
      const { result } = await res.json();
      if (result) return Number(BigInt(result)) / 1e18;
    } catch {}
  }
  return null;
}

function fmt(n, dec = 6) {
  if (n == null) return '—';
  if (n === 0) return '0';
  return n.toFixed(dec).replace(/\.?0+$/, '');
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
  const [ethBalance, setEthBalance] = useState(null);
  const [balLoading, setBalLoading] = useState(true);

  useEffect(() => {
    fetchEthBalance(PLATFORM_WALLET)
      .then(b => setEthBalance(b))
      .finally(() => setBalLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in py-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Admin &mdash; Flowfy</h1>
        <p className="text-slate-500 text-sm mt-1">Dados on-chain em tempo real. Sem banco de dados.</p>
      </div>

      <div className="card space-y-4">
        <h2 className="heading-section">Carteira da plataforma</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="stat-label">Endere&ccedil;o (Base)</p>
              <AddrBadge addr={PLATFORM_WALLET} />
            </div>
            <div className="text-right">
              <p className="stat-label">Saldo ETH (Base)</p>
              {balLoading
                ? <div className="skeleton-shimmer h-7 w-24 rounded-xl mt-1" />
                : <p className="text-2xl font-bold text-white tabular-nums">{ethBalance != null ? `${fmt(ethBalance, 6)} ETH` : '—'}</p>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap pt-1">
            <a href={BASESCAN_WALLET} target="_blank" rel="noopener noreferrer" className="btn-outline text-xs px-3 py-1.5">Ver no Basescan</a>
            <a href={BASESCAN_TXLIST} target="_blank" rel="noopener noreferrer" className="btn-outline text-xs px-3 py-1.5">Transa&ccedil;&otilde;es de tokens</a>
          </div>
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
        <button onClick={() => { setBalLoading(true); fetchEthBalance(PLATFORM_WALLET).then(setEthBalance).finally(() => setBalLoading(false)); }} className="btn-outline text-sm">
          &#8635; Atualizar saldo
        </button>
      </div>
    </div>
  );
}
