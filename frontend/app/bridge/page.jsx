'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../components/common/WalletProvider';
import { BRIDGE_CHAINS, getBridgeChain, getDefaultToken, isSolanaRoute } from '../../lib/chains';
import { getSolBalance, lamportsToSol } from '../../lib/solana';
import { connectSolanaWallet, getConnectedSolanaAddress, isPhantomInstalled } from '../../lib/solanaWallet';
import {
  getBridgeQuote,
  getBridgeRouteStatus,
  normalizeBridgeAmount,
  parseBridgeAmountRaw,
} from '../../lib/bridgeService';

const FEATURED_ROUTES = [
  ['ethereum', 'base'],
  ['ethereum', 'arbitrum'],
  ['ethereum', 'optimism'],
  ['ethereum', 'solana-mainnet'],
];

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'desconectada';
}

function formatSol(balance) {
  if (balance == null) return '-';
  return lamportsToSol(balance).toFixed(4);
}

export default function BridgePage() {
  const { address, activeChainId, chainId } = useWallet();
  const evmChainId = activeChainId || chainId || null;
  const initialFrom = BRIDGE_CHAINS.find(chain => chain.chainId === evmChainId)?.id || 'ethereum';
  const [fromChainId, setFromChainId] = useState(initialFrom);
  const [toChainId, setToChainId] = useState('base');
  const fromChain = getBridgeChain(fromChainId);
  const toChain = getBridgeChain(toChainId);
  const [fromTokenSymbol, setFromTokenSymbol] = useState(getDefaultToken(fromChain)?.symbol || 'ETH');
  const [toTokenSymbol, setToTokenSymbol] = useState(getDefaultToken(toChain)?.symbol || 'ETH');
  const fromToken = fromChain?.tokens.find(token => token.symbol === fromTokenSymbol) || getDefaultToken(fromChain);
  const toToken = toChain?.tokens.find(token => token.symbol === toTokenSymbol) || getDefaultToken(toChain);
  const [amount, setAmount] = useState('');
  const [quoteState, setQuoteState] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [solanaAddress, setSolanaAddress] = useState(null);
  const [solBalance, setSolBalance] = useState(null);
  const [solanaError, setSolanaError] = useState(null);

  const amountParsed = useMemo(
    () => parseBridgeAmountRaw(amount, fromToken?.decimals || 18),
    [amount, fromToken?.decimals]
  );

  const routeStatus = useMemo(() => getBridgeRouteStatus({
    fromChainId,
    toChainId,
    solanaAddress,
  }), [fromChainId, toChainId, solanaAddress]);

  const routeUsesSolana = isSolanaRoute(fromChainId, toChainId);

  useEffect(() => {
    const connected = getConnectedSolanaAddress();
    if (connected) setSolanaAddress(connected);
  }, []);

  useEffect(() => {
    if (!solanaAddress) { setSolBalance(null); return; }
    getSolBalance(solanaAddress)
      .then(setSolBalance)
      .catch(err => setSolanaError(err.message));
  }, [solanaAddress]);

  useEffect(() => {
    const chain = getBridgeChain(fromChainId);
    setFromTokenSymbol(getDefaultToken(chain)?.symbol || '');
    setQuoteState(null);
    setQuoteError(null);
  }, [fromChainId]);

  useEffect(() => {
    const chain = getBridgeChain(toChainId);
    setToTokenSymbol(getDefaultToken(chain)?.symbol || '');
    setQuoteState(null);
    setQuoteError(null);
  }, [toChainId]);

  async function handleConnectSolana() {
    setSolanaError(null);
    try {
      const connected = await connectSolanaWallet();
      setSolanaAddress(connected);
    } catch (err) {
      setSolanaError(err.message);
    }
  }

  async function handleQuote() {
    setQuoteState(null);
    setQuoteError(null);
    if (amountParsed.error) {
      setQuoteError(amountParsed.error);
      return;
    }
    setLoadingQuote(true);
    try {
      const quote = await getBridgeQuote({
        fromChain: fromChain.id,
        toChain: toChain.id,
        fromToken,
        toToken,
        amountRaw: amountParsed.raw,
        amount: amountParsed.normalized,
        evmAddress: address || null,
        solanaAddress: solanaAddress || null,
      });
      setQuoteState(quote);
    } catch (err) {
      setQuoteState(err.body || null);
      setQuoteError(err.message);
    } finally {
      setLoadingQuote(false);
    }
  }

  function selectRoute(fromId, toId) {
    setFromChainId(fromId);
    setToChainId(toId);
  }

  return (
    <main className="min-h-screen px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="space-y-3">
          <p className="text-sm font-semibold text-violet-300">Bridge / Cross-chain Swap</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Mova fundos para redes mais baratas</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Use esta área para preparar rotas entre Ethereum, Base, Arbitrum, Optimism, BNB Chain e Solana.
              </p>
            </div>
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
              Operações cross-chain podem envolver tempo de espera, slippage, taxa de rede e risco de protocolo.
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          {FEATURED_ROUTES.map(([fromId, toId]) => {
            const from = getBridgeChain(fromId);
            const to = getBridgeChain(toId);
            const active = fromChainId === fromId && toChainId === toId;
            return (
              <button
                key={`${fromId}-${toId}`}
                onClick={() => selectRoute(fromId, toId)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? 'border-violet-500/70 bg-violet-950/30 text-white'
                    : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/20'
                }`}
              >
                <p className="text-xs text-slate-500">Rota destacada</p>
                <p className="mt-1 font-semibold">{from.name} {'->'} {to.name}</p>
              </button>
            );
          })}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/[0.08] bg-[#090918] p-5 shadow-2xl">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-400">Rede de origem</span>
                <select value={fromChainId} onChange={e => setFromChainId(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-sm outline-none">
                  {BRIDGE_CHAINS.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-400">Rede de destino</span>
                <select value={toChainId} onChange={e => setToChainId(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-sm outline-none">
                  {BRIDGE_CHAINS.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-400">Token de origem</span>
                <select value={fromTokenSymbol} onChange={e => setFromTokenSymbol(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-sm outline-none">
                  {fromChain?.tokens.map(token => <option key={token.symbol} value={token.symbol}>{token.symbol}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium text-slate-400">Token de destino</span>
                <select value={toTokenSymbol} onChange={e => setToTokenSymbol(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-sm outline-none">
                  {toChain?.tokens.map(token => <option key={token.symbol} value={token.symbol}>{token.symbol}</option>)}
                </select>
              </label>
            </div>

            <label className="mt-4 block space-y-2">
              <span className="text-xs font-medium text-slate-400">Valor enviado</span>
              <input
                value={amount}
                onChange={e => setAmount(normalizeBridgeAmount(e.target.value))}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-4 py-4 text-2xl font-bold outline-none"
              />
            </label>

            <div className="mt-5 grid gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-sm md:grid-cols-2">
              <p><span className="text-slate-500">Carteira EVM:</span> {shortAddress(address)}</p>
              <p><span className="text-slate-500">Carteira Solana:</span> {shortAddress(solanaAddress)}</p>
              <p><span className="text-slate-500">Rede EVM atual:</span> {evmChainId || '-'}</p>
              <p><span className="text-slate-500">Saldo SOL:</span> {formatSol(solBalance)} SOL</p>
            </div>

            {routeUsesSolana && !solanaAddress && (
              <div className="mt-4 rounded-xl border border-sky-800/40 bg-sky-950/20 p-4 text-sm text-sky-200">
                <p>Conecte uma carteira Solana, como Phantom, para usar esta rota.</p>
                <button onClick={handleConnectSolana} className="mt-3 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400">
                  {isPhantomInstalled() ? 'Conectar Phantom' : 'Phantom não detectado'}
                </button>
                {solanaError && <p className="mt-2 text-xs text-red-300">{solanaError}</p>}
              </div>
            )}

            <button
              onClick={handleQuote}
              disabled={loadingQuote || Boolean(amountParsed.error)}
              className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingQuote ? 'Consultando rota...' : 'Iniciar bridge'}
            </button>
          </div>

          <aside className="rounded-2xl border border-white/[0.08] bg-[#090918] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold">Resumo da rota</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Token de origem</span><span>{fromToken?.symbol} em {fromChain?.name}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Token de destino</span><span>{toToken?.symbol} em {toChain?.name}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Valor bruto estimado</span><span>{quoteState?.estimatedAmountOut || '-'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Taxa Flowfy</span><span>{quoteState?.platformFee || '-'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Valor líquido estimado</span><span>{quoteState?.netAmountOut || '-'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Gas estimado</span><span>{quoteState?.gasCost || '-'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Tempo estimado</span><span>{quoteState?.estimatedTime || '-'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Provedor/rota</span><span>{quoteState?.bridgeProvider || 'Aguardando integração'}</span></div>
            </div>

            <div className="mt-5 rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 text-sm text-amber-200">
              <p>{quoteError || quoteState?.message || routeStatus.message}</p>
              {quoteState?.warnings?.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs">
                  {quoteState.warnings.map(warning => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
