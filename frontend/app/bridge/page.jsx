'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../components/common/WalletProvider';
import { BRIDGE_CHAINS, EVM_CHAINS, getBridgeChain, getDefaultToken, isSolanaRoute } from '../../lib/chains';
import { getSolBalance, lamportsToSol } from '../../lib/solana';
import { connectSolanaWallet, getConnectedSolanaAddress, isPhantomInstalled } from '../../lib/solanaWallet';
import {
  getBridgeQuote,
  getBridgeRouteStatus,
  normalizeBridgeAmount,
  parseBridgeAmountRaw,
} from '../../lib/bridgeService';
import {
  applyMaxReserve,
  formatTokenBalance,
  getErc20Balance,
  getNativeBalance,
  hasEnoughBalance,
  isNativeToken,
  percentOfBalance,
  rawToInput,
  NATIVE_MAX_RESERVE,
} from '../../lib/balances';

const FEATURED_ROUTES = [
  ['ethereum', 'base'],
  ['ethereum', 'arbitrum'],
  ['ethereum', 'optimism'],
  ['ethereum', 'solana-mainnet'],
];

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'desconectada';
}

function chainLabel(chain) {
  return chain?.name || 'Rede';
}

function formatSol(balance) {
  if (balance == null) return '-';
  return lamportsToSol(balance).toFixed(4);
}

function hasTokenSymbol(chain, symbol) {
  return Boolean(chain?.tokens?.some(token => token.symbol === symbol));
}

function preferredTokenSymbol(chain, desiredSymbol) {
  if (hasTokenSymbol(chain, desiredSymbol)) return desiredSymbol;
  return getDefaultToken(chain)?.symbol || '';
}

function BalanceLine({ label, value, muted }) {
  return (
    <div className={`flex items-center justify-between text-xs ${muted ? 'text-slate-500' : 'text-slate-400'}`}>
      <span>{label}</span>
      <span className="font-medium text-slate-300">{value}</span>
    </div>
  );
}

export default function BridgePage() {
  const {
    address,
    activeChainId,
    chainId,
    isConnected,
    connect,
    switchNetwork,
  } = useWallet();

  const walletChainId = activeChainId || chainId || null;
  const initialFrom = BRIDGE_CHAINS.find(chain => chain.chainId === walletChainId)?.id || 'ethereum';
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
  const [balanceRaw, setBalanceRaw] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceMessage, setBalanceMessage] = useState('');
  const [solanaAddress, setSolanaAddress] = useState(null);
  const [solanaError, setSolanaError] = useState(null);

  const fromIsEvm = fromChain?.type === 'evm';
  const toIsEvm = toChain?.type === 'evm';
  const walletOnSourceChain = fromIsEvm && walletChainId === fromChain?.chainId;
  const routeUsesSolana = isSolanaRoute(fromChainId, toChainId);
  const amountParsed = useMemo(
    () => parseBridgeAmountRaw(amount, fromToken?.decimals || 18),
    [amount, fromToken?.decimals]
  );
  const routeStatus = useMemo(() => getBridgeRouteStatus({
    fromChainId,
    toChainId,
    solanaAddress,
  }), [fromChainId, toChainId, solanaAddress]);
  const balanceFormatted = formatTokenBalance(balanceRaw, fromToken?.decimals || 18);
  const spendableRaw = applyMaxReserve(balanceRaw, fromChain, fromToken);
  const spendableFormatted = formatTokenBalance(spendableRaw, fromToken?.decimals || 18);
  const hasBalance = balanceRaw != null && balanceRaw > 0n;
  const hasSpendableBalance = spendableRaw > 0n;
  const amountExceedsBalance = amountParsed.raw && balanceRaw != null && !hasEnoughBalance(amountParsed.raw, balanceRaw);
  const canQuote = !amountParsed.error && amountParsed.raw && !amountExceedsBalance;

  useEffect(() => {
    const connected = getConnectedSolanaAddress();
    if (connected) setSolanaAddress(connected);
  }, []);

  function resetBridgeInput({ clearAmount = false } = {}) {
    if (clearAmount) setAmount('');
    setQuoteState(null);
    setQuoteError(null);
  }

  useEffect(() => {
    let cancelled = false;
    setBalanceRaw(null);
    setBalanceMessage('');

    async function loadBalance() {
      if (!fromChain || !fromToken) return;

      if (fromChain.type === 'evm') {
        if (!address || !isConnected) {
          setBalanceMessage('Conecte sua carteira para ler saldo e preparar a bridge.');
          return;
        }
        if (walletChainId !== fromChain.chainId) {
          const current = EVM_CHAINS.find(chain => chain.chainId === walletChainId)?.name || 'outra rede';
          setBalanceMessage(`Sua carteira está em ${current}, mas a origem selecionada é ${fromChain.name}.`);
          return;
        }
        setBalanceLoading(true);
        try {
          const raw = isNativeToken(fromToken)
            ? await getNativeBalance(fromChain, address)
            : await getErc20Balance(fromChain, fromToken.address, address);
          if (!cancelled) setBalanceRaw(raw);
        } catch (err) {
          if (!cancelled) setBalanceMessage(`Não foi possível ler o saldo em ${fromChain.name}.`);
        } finally {
          if (!cancelled) setBalanceLoading(false);
        }
        return;
      }

      if (fromChain.id === 'solana-mainnet') {
        if (!solanaAddress) {
          setBalanceMessage('Conecte uma carteira Solana, como Phantom, para usar esta rota.');
          return;
        }
        if (fromToken.symbol !== 'SOL') {
          setBalanceMessage('Saldo USDC Solana em preparação.');
          return;
        }
        setBalanceLoading(true);
        try {
          const raw = await getSolBalance(solanaAddress);
          if (!cancelled) setBalanceRaw(raw);
        } catch (err) {
          if (!cancelled) setBalanceMessage('Não foi possível ler o saldo SOL.');
        } finally {
          if (!cancelled) setBalanceLoading(false);
        }
      }
    }

    loadBalance();
    return () => { cancelled = true; };
  }, [fromChain, fromToken, address, isConnected, walletChainId, solanaAddress]);

  const requestQuote = useCallback(async () => {
    setQuoteState(null);
    setQuoteError(null);

    if (amountParsed.error) {
      setQuoteError(amountParsed.error);
      return;
    }
    if (amountExceedsBalance) {
      setQuoteError('Valor maior que o saldo disponível.');
      return;
    }
    if (fromIsEvm && (!address || !isConnected)) {
      setQuoteError('Conecte sua carteira para ler saldo e preparar a bridge.');
      return;
    }
    if (fromIsEvm && !walletOnSourceChain) {
      setQuoteError(`Troque sua carteira para ${fromChain.name} para ler saldo e iniciar bridge.`);
      return;
    }
    if (fromChain?.type === 'non-evm' && !solanaAddress) {
      setQuoteError('Conecte uma carteira Solana, como Phantom, para usar esta rota.');
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
  }, [
    amountParsed,
    amountExceedsBalance,
    fromIsEvm,
    address,
    isConnected,
    walletOnSourceChain,
    fromChain,
    toChain,
    fromToken,
    toToken,
    solanaAddress,
  ]);

  useEffect(() => {
    if (!canQuote || !amount) return;
    const timer = setTimeout(() => { requestQuote(); }, 600);
    return () => clearTimeout(timer);
  }, [amount, canQuote, requestQuote]);

  async function handleConnectSolana() {
    setSolanaError(null);
    try {
      const connected = await connectSolanaWallet();
      setSolanaAddress(connected);
    } catch (err) {
      setSolanaError(err.message);
    }
  }

  function handleFromChainChange(nextFromId) {
    const nextFrom = getBridgeChain(nextFromId);
    const nextFromSymbol = preferredTokenSymbol(nextFrom, fromTokenSymbol);
    setFromChainId(nextFromId);
    setFromTokenSymbol(nextFromSymbol);
    if (hasTokenSymbol(toChain, nextFromSymbol)) setToTokenSymbol(nextFromSymbol);
    resetBridgeInput({ clearAmount: true });
  }

  function handleToChainChange(nextToId) {
    const nextTo = getBridgeChain(nextToId);
    setToChainId(nextToId);
    setToTokenSymbol(preferredTokenSymbol(nextTo, fromTokenSymbol));
    resetBridgeInput();
  }

  function handleFromTokenChange(nextSymbol) {
    setFromTokenSymbol(nextSymbol);
    if (hasTokenSymbol(toChain, nextSymbol)) setToTokenSymbol(nextSymbol);
    resetBridgeInput();
  }

  function handleToTokenChange(nextSymbol) {
    setToTokenSymbol(nextSymbol);
    resetBridgeInput();
  }

  function selectRoute(fromId, toId) {
    const nextFrom = getBridgeChain(fromId);
    const nextTo = getBridgeChain(toId);
    const nextFromSymbol = preferredTokenSymbol(nextFrom, fromTokenSymbol);
    setFromChainId(fromId);
    setToChainId(toId);
    setFromTokenSymbol(nextFromSymbol);
    setToTokenSymbol(preferredTokenSymbol(nextTo, nextFromSymbol));
    resetBridgeInput({ clearAmount: true });
  }

  function applyPercent(percent) {
    if (!hasSpendableBalance) return;
    const raw = percentOfBalance(balanceRaw, percent, fromChain, fromToken);
    setAmount(rawToInput(raw, fromToken.decimals));
    setQuoteState(null);
    setQuoteError(null);
  }

  const primaryMessage = quoteError || quoteState?.message || routeStatus.message;
  const receiveValue = quoteState?.netAmountOut || (loadingQuote ? 'Consultando...' : 'Aguardando cotação');

  return (
    <main className="min-h-screen px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="space-y-3">
          <p className="text-sm font-semibold text-violet-300">Bridge</p>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Mova fundos para redes mais baratas</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Escolha a rede de origem, o token e o destino. A cotação real será conectada ao provedor de bridge.
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
                <p className="text-xs text-slate-500">Rota rápida</p>
                <p className="mt-1 font-semibold">{from.name} {'->'} {to.name}</p>
              </button>
            );
          })}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-2xl border border-white/[0.08] bg-[#090918] p-4 shadow-2xl md:p-5">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200">Você envia</h2>
                <span className="text-xs text-slate-500">
                  Saldo: {balanceLoading ? 'carregando...' : `${balanceFormatted} ${fromToken?.symbol || ''}`}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs text-slate-500">Rede</span>
                  <select value={fromChainId} onChange={e => handleFromChainChange(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-sm outline-none">
                    {BRIDGE_CHAINS.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs text-slate-500">Token</span>
                  <select value={fromTokenSymbol} onChange={e => handleFromTokenChange(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-sm outline-none">
                    {fromChain?.tokens.map(token => <option key={token.symbol} value={token.symbol}>{token.symbol}</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 p-4">
                <input
                  value={amount}
                  onChange={e => {
                    setAmount(normalizeBridgeAmount(e.target.value));
                    setQuoteState(null);
                    setQuoteError(null);
                  }}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-full bg-transparent text-3xl font-bold text-white outline-none placeholder-slate-700"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {[25, 50, 100].map(percent => (
                      <button
                        key={percent}
                        onClick={() => applyPercent(percent)}
                        disabled={!hasSpendableBalance || balanceLoading}
                        className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-violet-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {percent === 100 ? 'MAX' : `${percent}%`}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-500">
                    Disponível para envio: {spendableFormatted} {fromToken?.symbol}
                  </span>
                </div>
              </div>

              {isNativeToken(fromToken) && NATIVE_MAX_RESERVE[fromChain?.id] && (
                <p className="mt-2 text-xs text-slate-500">
                  MAX reserva {NATIVE_MAX_RESERVE[fromChain.id]} {fromChain.nativeSymbol} para gas.
                </p>
              )}

              {balanceMessage && (
                <div className="mt-4 rounded-xl border border-sky-800/40 bg-sky-950/20 p-3 text-sm text-sky-200">
                  <p>{balanceMessage}</p>
                  {fromIsEvm && address && fromChain?.chainId && !walletOnSourceChain && (
                    <button
                      onClick={() => switchNetwork(fromChain.chainId).catch(() => {})}
                      className="mt-3 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-400"
                    >
                      Trocar para {fromChain.name}
                    </button>
                  )}
                  {!isConnected && fromIsEvm && (
                    <button
                      onClick={connect}
                      className="mt-3 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-400"
                    >
                      Conectar carteira
                    </button>
                  )}
                  {fromChain?.id === 'solana-mainnet' && !solanaAddress && (
                    <button
                      onClick={handleConnectSolana}
                      className="mt-3 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-400"
                    >
                      {isPhantomInstalled() ? 'Conectar Phantom' : 'Phantom não detectado'}
                    </button>
                  )}
                </div>
              )}

              {amountExceedsBalance && (
                <p className="mt-3 text-xs text-red-300">Valor maior que o saldo disponível.</p>
              )}
            </div>

            <div className="my-3 flex justify-center">
              <div className="rounded-full border border-white/[0.08] bg-[#090918] px-3 py-2 text-slate-400">↓</div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200">Você recebe</h2>
                <span className="text-xs text-slate-500">{chainLabel(toChain)}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs text-slate-500">Rede</span>
                  <select value={toChainId} onChange={e => handleToChainChange(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-sm outline-none">
                    {BRIDGE_CHAINS.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs text-slate-500">Token</span>
                  <select value={toTokenSymbol} onChange={e => handleToTokenChange(e.target.value)} className="w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-3 text-sm outline-none">
                    {toChain?.tokens.map(token => <option key={token.symbol} value={token.symbol}>{token.symbol}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/30 p-4">
                <p className={`text-2xl font-bold ${quoteState?.netAmountOut ? 'text-white' : 'text-slate-600'}`}>
                  {receiveValue}
                </p>
                <p className="mt-1 text-xs text-slate-500">{toToken?.symbol} em {toChain?.name}</p>
              </div>
            </div>

            <button
              onClick={requestQuote}
              disabled={loadingQuote || !canQuote}
              className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingQuote ? 'Atualizando...' : amount ? 'Atualizar cotação' : 'Informe um valor'}
            </button>
          </div>

          <aside className="rounded-2xl border border-white/[0.08] bg-[#090918] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold">Resumo da rota</h2>
            <div className="mt-4 space-y-3">
              <BalanceLine label="Origem" value={`${fromToken?.symbol || '-'} em ${fromChain?.name || '-'}`} />
              <BalanceLine label="Destino" value={`${toToken?.symbol || '-'} em ${toChain?.name || '-'}`} />
              <BalanceLine label="Valor bruto estimado" value={quoteState?.estimatedAmountOut || 'Aguardando cotação'} muted={!quoteState?.estimatedAmountOut} />
              <BalanceLine label="Taxa Flowfy" value={quoteState?.platformFee || '-'} muted />
              <BalanceLine label="Valor líquido estimado" value={quoteState?.netAmountOut || '-'} muted />
              <BalanceLine label="Gas estimado" value={quoteState?.gasCost || '-'} muted />
              <BalanceLine label="Tempo estimado" value={quoteState?.estimatedTime || '-'} muted />
              <BalanceLine label="Provedor/rota" value={quoteState?.bridgeProvider || 'Aguardando integração'} muted={!quoteState?.bridgeProvider} />
            </div>

            <div className="mt-5 rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 text-sm text-amber-200">
              <p>{primaryMessage}</p>
              {quoteState?.warnings?.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs">
                  {quoteState.warnings.map(warning => <li key={warning}>{warning}</li>)}
                </ul>
              )}
            </div>

            <div className="mt-4 grid gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-xs text-slate-400">
              <p><span className="text-slate-500">Carteira EVM:</span> {shortAddress(address)}</p>
              <p><span className="text-slate-500">Carteira Solana:</span> {shortAddress(solanaAddress)}</p>
              {routeUsesSolana && solanaAddress && <p><span className="text-slate-500">Saldo SOL:</span> {formatSol(balanceRaw)} SOL</p>}
              {solanaError && <p className="text-red-300">{solanaError}</p>}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
