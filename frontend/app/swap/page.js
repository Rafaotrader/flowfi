'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../../components/common/WalletProvider';
import { getSwapQuote, getSwapQuoteEndpoint } from '../../lib/api';
import {
  getPublicClient, getMetaMaskPublicClient, getWalletClient, checkERC20Allowance,
  approveERC20Token, ERC20_FULL_ABI,
  getUniswapV3Quote, executeUniswapV3Swap, SWAP_ROUTER_BY_CHAIN,
} from '../../lib/web3';
import { parseUnits, formatUnits } from 'viem';

// Curated token list per chain
const TOKEN_LIST = {
  8453: [
    { symbol: 'ETH',   address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, name: 'Ethereum' },
    { symbol: 'USDC',  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,  name: 'USD Coin' },
    { symbol: 'WETH',  address: '0x4200000000000000000000000000000000000006', decimals: 18, name: 'Wrapped ETH' },
    { symbol: 'cbBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8,  name: 'Coinbase BTC' },
    { symbol: 'USDT',  address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6,  name: 'Tether USD' },
  ],
  1: [
    { symbol: 'ETH',   address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, name: 'Ethereum' },
    { symbol: 'USDC',  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6,  name: 'USD Coin' },
    { symbol: 'USDT',  address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6,  name: 'Tether USD' },
    { symbol: 'WBTC',  address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8,  name: 'Wrapped BTC' },
    { symbol: 'WETH',  address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, name: 'Wrapped ETH' },
    { symbol: 'DAI',   address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, name: 'Dai' },
  ],
  42161: [
    { symbol: 'ETH',   address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, name: 'Ethereum' },
    { symbol: 'USDC',  address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6,  name: 'USD Coin' },
    { symbol: 'USDT',  address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6,  name: 'Tether USD' },
    { symbol: 'WBTC',  address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8,  name: 'Wrapped BTC' },
    { symbol: 'WETH',  address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, name: 'Wrapped ETH' },
  ],
  10: [
    { symbol: 'ETH',   address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, name: 'Ethereum' },
    { symbol: 'USDC',  address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6,  name: 'USD Coin' },
    { symbol: 'USDT',  address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6,  name: 'Tether USD' },
    { symbol: 'WETH',  address: '0x4200000000000000000000000000000000000006', decimals: 18, name: 'Wrapped ETH' },
  ],
  137: [
    { symbol: 'MATIC', address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, name: 'Polygon' },
    { symbol: 'USDC',  address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6,  name: 'USD Coin' },
    { symbol: 'USDT',  address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6,  name: 'Tether USD' },
    { symbol: 'WETH',  address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, name: 'Wrapped ETH' },
    { symbol: 'WBTC',  address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8,  name: 'Wrapped BTC' },
  ],
  56: [
    { symbol: 'BNB',   address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, name: 'BNB' },
    { symbol: 'USDC',  address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18, name: 'USD Coin' },
    { symbol: 'USDT',  address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, name: 'Tether USD' },
    { symbol: 'WBNB',  address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, name: 'Wrapped BNB' },
  ],
};

const CHAIN_NAMES = { 1: 'Ethereum', 42161: 'Arbitrum', 10: 'Optimism', 137: 'Polygon', 8453: 'Base', 56: 'BNB' };
const SWAP_ENABLED_CHAINS = new Set([1, 42161, 10, 137, 8453]);
const ZEROX_ALLOWANCE_TARGET = '0xdef1c0ded9bec7f1a1670819833240f027b25eff'; // 0x Exchange Proxy
const NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ZEROX_NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function fmtAmount(n, dec = 6) {
  if (!n) return '0';
  const v = parseFloat(n);
  if (isNaN(v)) return '0';
  return v >= 1000 ? v.toFixed(2) : v.toFixed(Math.min(6, dec));
}

function formatImpact(impact) {
  const v = parseFloat(impact);
  if (isNaN(v)) return '—';
  const cls = v > 5 ? 'text-red-400' : v > 1 ? 'text-amber-400' : 'text-emerald-400';
  return <span className={cls}>{v.toFixed(2)}%</span>;
}

function fmtBal(raw, dec) {
  if (raw == null) return '—';
  const v = parseFloat(formatUnits(raw, dec));
  if (isNaN(v)) return '—';
  return v >= 1000 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toFixed(6);
}

function normalizeAmountInput(value) {
  const normalized = String(value || '').replace(',', '.').replace(/[^\d.]/g, '');
  const firstDot = normalized.indexOf('.');
  const cleaned = firstDot === -1
    ? normalized
    : normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, '');
  const [wholeRaw = '', fracRaw = ''] = cleaned.split('.');
  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || (fracRaw ? '0' : '');
  return fracRaw !== undefined && cleaned.includes('.') ? `${whole}.${fracRaw}` : whole;
}

function parseAmountToRaw(amount, decimals) {
  const normalized = normalizeAmountInput(amount);
  if (!normalized || normalized === '.') return { normalized, raw: 0n, error: 'Valor inválido.' };
  if (!/^\d+(\.\d*)?$/.test(normalized)) return { normalized, raw: 0n, error: 'Valor inválido.' };
  if (Number(normalized) <= 0) return { normalized, raw: 0n, error: null };
  try {
    const [int, frac = ''] = normalized.split('.');
    const raw = parseUnits(`${int || '0'}.${frac.slice(0, decimals)}`, decimals);
    return { normalized, raw, error: null };
  } catch (err) {
    return { normalized, raw: 0n, error: err.message || 'Valor inválido.' };
  }
}

function toWei(amount, decimals) {
  return parseAmountToRaw(amount, decimals).raw;
}

function isNativeToken(token) {
  return token?.address?.toLowerCase() === NATIVE_TOKEN_ADDRESS;
}

function tokenAddressFor0x(token) {
  return isNativeToken(token) ? ZEROX_NATIVE_TOKEN : token.address;
}

function buildQuoteDebug({
  chainId, walletChainId, address, sell, buy, sellAmt, parsedAmount, endpoint,
  providerNetwork, provider, result, error,
}) {
  return {
    activeChainId: chainId,
    chainName: CHAIN_NAMES[chainId] || `Chain ${chainId}`,
    walletChainId,
    walletAddress: address || null,
    tokenInSymbol: sell?.symbol,
    tokenInAddress: sell?.address,
    tokenIn0xAddress: sell ? tokenAddressFor0x(sell) : null,
    tokenOutSymbol: buy?.symbol,
    tokenOutAddress: buy?.address,
    tokenOut0xAddress: buy ? tokenAddressFor0x(buy) : null,
    inputAmountOriginal: sellAmt,
    inputAmountNormalized: parsedAmount?.normalized,
    amountRaw: parsedAmount?.raw?.toString?.() || null,
    decimalsUsed: sell?.decimals,
    providerNetwork,
    quoteProvider: provider || null,
    endpoint: endpoint || null,
    httpStatus: error?.status || null,
    httpStatusText: error?.statusText || null,
    apiErrorBody: error?.body || null,
    catchMessage: error?.message || null,
    quoteResult: result || null,
  };
}

// Converte decimal string ou BigInt para hex aceito pela MetaMask
function toHex(value) {
  if (!value || value === '0' || value === '0x0') return '0x0';
  if (typeof value === 'string' && value.startsWith('0x')) return value;
  try { return '0x' + BigInt(value).toString(16); } catch { return '0x0'; }
}

// Mensagem de erro legível para o usuário
function parseSwapError(err) {
  const code = err.code ?? err.cause?.code;
  const msg  = (err.message || err.shortMessage || '').toLowerCase();
  console.error('[Swap] erro:', err.code, err.shortMessage || err.message);
  if (code === 4001 || msg.includes('user rejected') || msg.includes('user denied') || msg.includes('cancelled'))
    return 'Transação cancelada pelo usuário.';
  if (msg.includes('insufficient funds') || msg.includes('saldo insuficiente'))
    return 'Você precisa de saldo nativo (ETH/BNB/MATIC) para pagar gas.';
  if (msg.includes('execute') && msg.includes('fail'))
    return 'Transação revertida on-chain. Tente reduzir o valor ou aguardar nova cotação.';
  if (msg.includes('allowance'))
    return 'Allowance insuficiente — tente novamente.';
  if (msg.includes('signatureexpired') || msg.includes('expired'))
    return 'Cotação expirada. Aguarde nova cotação automática.';
  if (msg.includes('gas'))
    return 'Estimativa de gas falhou — tente com valor menor.';
  if (msg.includes('nonce'))
    return 'Nonce inválido. Recarregue a página e tente novamente.';
  if (msg.includes('network') || msg.includes('chain'))
    return 'Rede incorreta. Verifique a rede no MetaMask.';
  if (msg.includes('liquidez') || msg.includes('liquidity'))
    return 'Não encontramos rota para esse par agora. Tente outro par ou valor.';
  const raw = err.shortMessage || err.message || 'Erro desconhecido';
  return raw.length > 160 ? raw.slice(0, 160) + '…' : raw;
}

const COINGECKO_IDS = {
  ETH: 'ethereum', WETH: 'weth', cbBTC: 'coinbase-wrapped-bitcoin',
  WBTC: 'wrapped-bitcoin', cbETH: 'coinbase-wrapped-staked-eth',
  ARB: 'arbitrum', OP: 'optimism', MATIC: 'matic-network', BNB: 'binancecoin',
};
const STABLES_SET = new Set(['USDC', 'USDT', 'DAI', 'USDbC', 'FRAX', 'BUSD']);

async function getSwapEstimate(sellToken, buyToken, sellAmtHuman) {
  const fetchPrice = async (symbol) => {
    if (STABLES_SET.has(symbol)) return 1;
    const id = COINGECKO_IDS[symbol];
    if (!id) throw new Error(`Preço desconhecido para ${symbol}`);
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const d = await res.json();
    const price = d[id]?.usd;
    if (!price) throw new Error(`Preço indisponível para ${symbol}`);
    return price;
  };
  const [priceIn, priceOut] = await Promise.all([fetchPrice(sellToken.symbol), fetchPrice(buyToken.symbol)]);
  const usdValue = sellAmtHuman * priceIn;
  const estimatedOut = (usdValue / priceOut) * 0.995;
  const amtOutRaw = Math.floor(estimatedOut * Math.pow(10, buyToken.decimals));
  const amtOutStr = String(Math.max(0, amtOutRaw));
  return {
    isEstimated: true, _source: 'estimate',
    buyAmount: amtOutStr,
    sellAmount: String(Math.floor(sellAmtHuman * Math.pow(10, sellToken.decimals))),
    grossBuyAmount: amtOutStr, netBuyAmountEstimated: amtOutStr,
    estimatedGas: null, platformFeeEstimated: '0',
    sources: [{ name: 'CoinGecko (estimativa)', proportion: '1' }],
  };
}

// Traduz erros de cotação para mensagem amigável
function parseQuoteError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('configure a chave') || m.includes('zerox_api_key') || m.includes('0x api key'))
    return msg;
  if (m.includes('swap ainda não disponível')) return 'Swap ainda não disponível nesta rede.';
  if (m.includes('liquidez') || m.includes('liquidity') || m.includes('rota'))
    return 'Não encontramos rota para esse par agora. Tente outro valor ou par.';
  if (m.includes('configurado') || m.includes('api') || m.includes('503'))
    return msg;
  if (m.includes('expirou') || m.includes('timeout'))
    return 'Cotação expirou — tente novamente.';
  if (m.includes('saldo') || m.includes('funds'))
    return 'Você precisa de saldo nativo para pagar gas.';
  return msg && msg.length > 120 ? msg.slice(0, 120) + '…' : (msg || 'Erro ao buscar cotação');
}

export default function SwapPage() {
  const { address, activeChainId, chainId, isConnected, connect } = useWallet();
  const currentChainId = activeChainId || chainId || 8453;
  const hasTokenList = Boolean(TOKEN_LIST[currentChainId]);
  const isSwapSupported = hasTokenList && SWAP_ENABLED_CHAINS.has(currentChainId);
  const showSwapDebug = process.env.NODE_ENV === 'development'
    || process.env.NEXT_PUBLIC_SWAP_DEBUG === 'true'
    || (typeof window !== 'undefined' && window.localStorage?.getItem('flowfy_swap_debug') === '1');

  const tokens  = hasTokenList ? TOKEN_LIST[currentChainId] : TOKEN_LIST[8453];
  const [sell,  setSell]  = useState(tokens[0]);
  const [buy,   setBuy]   = useState(tokens[1]);
  const [sellAmt, setSellAmt] = useState('');
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,  setError]  = useState(null);
  const [txStep, setTxStep] = useState('idle'); // idle|approving|signing|swapping|confirming|success|error
  const [txHash, setTxHash] = useState(null);
  const [txError, setTxError] = useState(null);
  const [sellBal, setSellBal] = useState(null); // BigInt
  const [buyBal,  setBuyBal]  = useState(null); // BigInt
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balanceTick, setBalanceTick] = useState(0); // increment to force refetch
  const [gasBlockOverride, setGasBlockOverride] = useState(false);
  const [quoteDebug, setQuoteDebug] = useState(null);

  // Reset tokens + state when chain changes
  useEffect(() => {
    const list = TOKEN_LIST[currentChainId] || TOKEN_LIST[8453];
    setSell(list[0]);
    setBuy(list[1]);
    setQuote(null);
    setQuoteDebug(null);
    setSellAmt('');
    setSellBal(null);
    setBuyBal(null);
    setBalancesLoading(false);
    setError(isSwapSupported ? null : 'Swap ainda não disponível nesta rede.');
    setTxStep('idle');
    setTxError(null);
    setTxHash(null);
    setGasBlockOverride(false);
  }, [currentChainId, isSwapSupported]);

  // Reset quote + tx state when wallet address changes
  useEffect(() => {
    setQuote(null);
    setQuoteDebug(null);
    setSellAmt('');
    setSellBal(null);
    setBuyBal(null);
    setBalancesLoading(false);
    setTxStep('idle');
    setTxError(null);
    setTxHash(null);
    setGasBlockOverride(false);
    setBalanceTick(t => t + 1);
  }, [address]);

  // Fetch wallet balances — cancelled flag prevents stale state on rapid changes
  useEffect(() => {
    if (!address || !isConnected || !isSwapSupported) { setSellBal(null); setBuyBal(null); setBalancesLoading(false); return; }
    let cancelled = false;
    setBalancesLoading(true);
    const cid = currentChainId;
    const client = getMetaMaskPublicClient(cid);
    async function fetchBal(token) {
      console.log('[balance] chainId', cid);
      console.log('[balance] token', token);
      console.log('[balance] address', address);
      if (typeof window !== 'undefined' && window.ethereum) {
        const providerChainHex = await window.ethereum.request({ method: 'eth_chainId' }).catch(() => null);
        console.log('[balance] provider network', providerChainHex ? parseInt(providerChainHex, 16) : null);
      }
      const raw = isNativeToken(token)
        ? await client.getBalance({ address })
        : await client.readContract({ address: token.address, abi: ERC20_FULL_ABI, functionName: 'balanceOf', args: [address] });
      console.log('[balance] raw', raw.toString());
      console.log('[balance] formatted', formatUnits(raw, token.decimals));
      return raw;
    }
    Promise.allSettled([fetchBal(sell), fetchBal(buy)])
      .then(([sellResult, buyResult]) => {
        if (cancelled) return;
        setSellBal(sellResult.status === 'fulfilled' ? sellResult.value : null);
        setBuyBal(buyResult.status === 'fulfilled' ? buyResult.value : null);
      })
      .finally(() => { if (!cancelled) setBalancesLoading(false); });
    return () => { cancelled = true; };
  }, [address, isConnected, isSwapSupported, sell, buy, currentChainId, balanceTick]);

  // fetchQuote must be defined BEFORE the debounced useEffect that uses it in deps
  const fetchQuote = useCallback(async () => {
    const parsedAmount = parseAmountToRaw(sellAmt, sell.decimals);
    let providerNetwork = null;
    if (typeof window !== 'undefined' && window.ethereum) {
      const providerChainHex = await window.ethereum.request({ method: 'eth_chainId' }).catch(() => null);
      providerNetwork = providerChainHex ? parseInt(providerChainHex, 16) : null;
    }

    const baseDebug = (patch = {}) => buildQuoteDebug({
      chainId: currentChainId,
      walletChainId: chainId,
      address,
      sell,
      buy,
      sellAmt,
      parsedAmount,
      providerNetwork,
      ...patch,
    });

    if (!sellAmt || parsedAmount.error || parsedAmount.raw <= 0n) {
      setQuote(null);
      setQuoteDebug(baseDebug({ error: parsedAmount.error ? new Error(parsedAmount.error) : null }));
      return;
    }
    if (balancesLoading) {
      setQuote(null);
      setQuoteDebug(baseDebug({ error: new Error('Saldo ainda carregando; quote pausada.') }));
      return;
    }
    if (!isSwapSupported) {
      setQuote(null);
      setError('Swap ainda não disponível nesta rede.');
      const dbg = baseDebug({ error: new Error('Swap ainda não disponível nesta rede.') });
      setQuoteDebug(dbg);
      console.warn('[Flowfy Swap Debug] unsupported swap chain', dbg);
      return;
    }
    const sellAmountWei = parsedAmount.raw;
    if (sellAmountWei === 0n) return;
    setLoading(true);
    setError(null);
    setQuoteDebug(baseDebug());
    console.group('[Flowfy Swap] fetchQuote');
    console.group('[Flowfy Swap Debug]');
    console.log('activeChainId:', currentChainId);
    console.log('walletChainId:', chainId);
    console.log('sellToken:', sell);
    console.log('buyToken:', buy);
    console.log('sellAmount:', sellAmt);
    console.log('normalizedAmount:', parsedAmount.normalized);
    console.log('decimals:', sell.decimals);
    console.log('amountInRaw:', sellAmountWei.toString());
    console.log('provider network:', providerNetwork);
    console.groupEnd();
    console.log('Tokens:', sell.symbol, '→', buy.symbol, '| Amount:', sellAmt, '| Chain:', currentChainId);
    try {
      const qty         = parseFloat(parsedAmount.normalized) || 0;
      const sym         = sell.symbol.toUpperCase();
      const tradeUsdEst = (sym === 'USDC' || sym === 'USDT') ? qty
        : (sym === 'ETH' || sym === 'WETH') ? qty * 3000 : 0;
      const excludedSources = tradeUsdEst > 0 && tradeUsdEst < 20
        ? 'Uniswap_V2,Curve,Balancer_V2' : undefined;

      let data;
      let zeroXError = null;
      const zeroXParams = {
        chainId: currentChainId,
        sellToken: tokenAddressFor0x(sell),
        buyToken:  tokenAddressFor0x(buy),
        sellAmount: sellAmountWei.toString(),
        ...(address && { takerAddress: address }),
        ...(excludedSources && { excludedSources }),
      };
      const zeroXEndpoint = getSwapQuoteEndpoint(zeroXParams);

      // Tier 1: 0x backend
      try {
        console.log('[Tier 1] Tentando 0x backend…');
        console.log('[Tier 1] endpoint:', zeroXEndpoint);
        data = await getSwapQuote(zeroXParams);
        data._source = '0x';
        console.log('[Tier 1] ✓ 0x OK | buyAmount:', data.buyAmount);
      } catch (e0x) {
        zeroXError = e0x;
        console.warn('[Tier 1] ✗ 0x falhou:', e0x);
        const msg = `${e0x?.message || ''} ${e0x?.body?.detail || ''}`.toLowerCase();
        const isConfigError = e0x?.status === 401 || e0x?.status === 403
          || (e0x?.status === 503 && msg.includes('zerox_api_key'))
          || (msg.includes('zero') && msg.includes('api') && msg.includes('key'))
          || (msg.includes('0x') && msg.includes('api') && msg.includes('key'))
          || msg.includes('swap não configurado') || msg.includes('swap nao configurado');

        if (isConfigError) {
          const configError = new Error('Cotação indisponível: configure a chave da API 0x.');
          configError.status = e0x.status;
          configError.statusText = e0x.statusText;
          configError.url = zeroXEndpoint;
          configError.body = e0x.body;
          throw configError;
        }

        // Tier 2: Uniswap V3 QuoterV2 on-chain (no API key)
        try {
          console.log('[Tier 2] Tentando Uniswap V3 QuoterV2…');
          data = await getUniswapV3Quote(sell.address, buy.address, sellAmountWei.toString(), currentChainId);
          data._source = 'uniswap';
          console.log('[Tier 2] ✓ UniV3 OK | buyAmount:', data.buyAmount, '| fee:', data.fee);
        } catch (eUni) {
          console.warn('[Tier 2] ✗ UniV3 falhou:', eUni);
          const combined = new Error(`0x falhou: ${zeroXError?.message || 'erro desconhecido'} | Uniswap V3 falhou: ${eUni?.message || 'erro desconhecido'}`);
          combined.status = zeroXError?.status || null;
          combined.statusText = zeroXError?.statusText || null;
          combined.url = zeroXEndpoint;
          combined.body = {
            zeroX: zeroXError?.body || null,
            zeroXMessage: zeroXError?.message || null,
            uniswapMessage: eUni?.message || null,
          };
          throw combined;
        }
      }

      console.log('[Flowfy Swap Debug] quote provider:', data._source || (data.isUniswapDirect ? 'uniswap' : '0x'));
      console.log('[Flowfy Swap Debug] quote result:', data);
      setQuoteDebug(baseDebug({ endpoint: zeroXEndpoint, provider: data._source || (data.isUniswapDirect ? 'uniswap' : '0x'), result: data }));
      setQuote(data);
    } catch (err) {
      console.error('[Flowfy Swap Debug] error real:', err);
      setQuoteDebug(baseDebug({ endpoint: err.url || null, error: err }));
      setError(err.message);
      setQuote(null);
    } finally {
      setLoading(false);
      console.groupEnd();
    }
  }, [sellAmt, sell, buy, balancesLoading, isSwapSupported, currentChainId, chainId, address]);

  // Debounced quote fetch — fetchQuote in deps so takerAddress is always current
  useEffect(() => {
    const parsedAmount = parseAmountToRaw(sellAmt, sell.decimals);
    if (!sellAmt || parsedAmount.error || parsedAmount.raw <= 0n || balancesLoading) { setQuote(null); return; }
    const timer = setTimeout(fetchQuote, 600);
    return () => clearTimeout(timer);
  }, [sellAmt, sell, buy, currentChainId, balancesLoading, fetchQuote]);

  const executeSwap = useCallback(async () => {
    if (!quote || !address) return;
    if (!isSwapSupported) {
      setTxError('Swap ainda não disponível nesta rede.');
      setTxStep('error');
      return;
    }

    // ── Uniswap V3 path (fallback quando backend 0x indisponível) ──
    if (quote.isUniswapDirect) {
      setTxStep('idle');
      setTxError(null);
      setTxHash(null);
      try {
        const cid = currentChainId;
        const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        const isETH  = sell.address.toLowerCase() === NATIVE;
        const sellAmtWei = toWei(sellAmt, sell.decimals);

        if (!isETH) {
          const routerAddr = SWAP_ROUTER_BY_CHAIN[cid];
          if (!routerAddr) throw new Error('Swap ainda não disponível nesta rede.');
          const allowance = await checkERC20Allowance(sell.address, address, routerAddr, cid);
          if (allowance < sellAmtWei) {
            setTxStep('approving');
            const { hash: aprHash } = await approveERC20Token(sell.address, routerAddr, undefined, cid);
            setTxHash(aprHash);
            await getPublicClient(cid).waitForTransactionReceipt({ hash: aprHash });
            setTxHash(null);
          }
        }

        setTxStep('swapping');
        const { hash } = await executeUniswapV3Swap({
          quote, sellToken: sell.address, buyToken: buy.address,
          sellAmount: sellAmtWei.toString(), recipient: address, chainId: cid,
        });
        setTxHash(hash);
        setTxStep('confirming');
        try {
          await getPublicClient(cid).waitForTransactionReceipt({ hash, timeout: 180_000 });
          setTxStep('success');
          setQuote(null); setSellAmt(''); setBalanceTick(t => t + 1);
        } catch (waitErr) {
          const isTimeout = waitErr.name === 'WaitForTransactionReceiptTimeoutError'
            || (waitErr.message || '').toLowerCase().includes('timed out');
          if (!isTimeout) throw waitErr;
          const receipt = await getPublicClient(cid).getTransactionReceipt({ hash }).catch(() => null);
          if (receipt?.status === 'success') {
            setTxStep('success'); setQuote(null); setSellAmt(''); setBalanceTick(t => t + 1);
          } else if (receipt?.status === 'reverted') {
            setTxError('Transação revertida pela rede.'); setTxStep('error');
          } else {
            setTxStep('pending');
          }
        }
      } catch (err) {
        setTxError(parseSwapError(err));
        setTxStep('error');
      }
      return;
    }

    // ── Validar calldata (0x path) ──
    if (!quote.to || !quote.data) {
      setError('Cotação sem calldata. Aguarde nova cotação ou reconecte a carteira.');
      return;
    }

    // ── Validar rede ──
    const expectedChainId = quote.chainId || currentChainId;
    if (chainId && chainId !== expectedChainId) {
      setTxError(`Troque para ${CHAIN_NAMES[expectedChainId] || 'Base'} (chainId ${expectedChainId}) no MetaMask antes de executar.`);
      setTxStep('error');
      return;
    }

    setTxStep('idle');
    setTxError(null);
    setTxHash(null);

    try {
      const cid           = currentChainId;
      const publicClient  = getPublicClient(cid);
      const isETH         = sell.address.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const sellAmtWei    = toWei(sellAmt, sell.decimals);

      console.log('[Swap initial quote]', quote);

      // ── PASSO 1: Approve ERC20 (se necessário) ──
      let finalQuote = quote;
      if (!isETH) {
        // Prioriza spender indicado no retorno atual da 0x
        const spender = quote.issues?.allowance?.spender
          || quote.allowanceTarget
          || '0x000000000022d473030f116ddee9f6b43ac78ba3';
        console.log('[Swap approve spender]', spender);

        const allowance = await checkERC20Allowance(sell.address, address, spender, cid);
        if (allowance < sellAmtWei) {
          setTxStep('approving');
          const { hash: aprHash } = await approveERC20Token(sell.address, spender, undefined, cid);
          setTxHash(aprHash);
          await publicClient.waitForTransactionReceipt({ hash: aprHash });
          setTxHash(null);

          // Buscar NOVA quote após approve confirmado — nunca usar quote antiga
          setTxStep('refreshingQuote');
          finalQuote = await getSwapQuote({
            chainId: cid,
            sellToken: sell.address,
            buyToken: buy.address,
            sellAmount: sellAmtWei.toString(),
            takerAddress: address,
          });
          console.log('[Swap final quote after approve]', finalQuote);

          if (!finalQuote.to || !finalQuote.data) {
            throw new Error('Nova cotação inválida após approve. Tente novamente.');
          }
        }
      }

      // ── PASSO 2: Assinar Permit2 EIP-712 (ERC20 sells, 0x v2) ──
      let txData = finalQuote.data;
      if (!isETH && finalQuote.permit2?.eip712) {
        setTxStep('signing');
        const walletClient = await getWalletClient(cid);
        const [account]    = await walletClient.getAddresses();
        const eip712       = finalQuote.permit2.eip712;
        const signature    = await walletClient.signTypedData({
          account,
          domain:      eip712.domain,
          types:       eip712.types,
          primaryType: eip712.primaryType,
          message:     eip712.message,
        });
        txData = finalQuote.data + signature.slice(2);
      }

      // ── PASSO 3: Montar tx com campos exatos da 0x ──
      // Sem gas/gasPrice — MetaMask estima no L2 (Base EIP-1559).
      const tx = {
        from:  address,
        to:    finalQuote.to,
        data:  txData,
        value: toHex(finalQuote.value || '0'),
      };

      console.log('[Swap final tx]', tx);
      console.log('[Swap] chainId:', cid, '| sell:', sell.symbol, '→', buy.symbol);
      console.log('[Swap] permit2:', finalQuote.permit2 ? 'sim' : 'não', '| isETH:', isETH);

      // ── PASSO 4: Enviar via window.ethereum direto ──
      if (!window.ethereum) throw new Error('MetaMask não encontrado. Instale a extensão.');
      setTxStep('swapping');
      const hash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [tx],
      });
      setTxHash(hash);

      // ── PASSO 5: Aguardar confirmação on-chain (timeout 3 min) ──
      setTxStep('confirming');
      try {
        await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
        setTxStep('success');
        setQuote(null);
        setSellAmt('');
        setBalanceTick(t => t + 1);
      } catch (waitErr) {
        const isTimeout =
          waitErr.name === 'WaitForTransactionReceiptTimeoutError' ||
          (waitErr.message || '').toLowerCase().includes('timed out');
        if (!isTimeout) throw waitErr; // erro real → outer catch
        // Timeout — consulta receipt manualmente antes de declarar pendente
        const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
        if (receipt?.status === 'success') {
          setTxStep('success');
          setQuote(null); setSellAmt(''); setBalanceTick(t => t + 1);
        } else if (receipt?.status === 'reverted') {
          setTxError('Transação revertida pela rede.'); setTxStep('error');
        } else {
          setTxStep('pending'); // enviada mas ainda não confirmada — não é erro
        }
      }

    } catch (err) {
      setTxError(parseSwapError(err));
      setTxStep('error');
    }
  }, [quote, address, isSwapSupported, currentChainId, chainId, sell, buy, sellAmt]);

  // Verifica receipt de tx pendente — chamado pelo botão "Verificar novamente"
  const verifyTx = useCallback(async () => {
    if (!txHash) return;
    setTxStep('confirming');
    const publicClient = getPublicClient(currentChainId);
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      if (receipt?.status === 'success') {
        setTxStep('success'); setQuote(null); setSellAmt(''); setBalanceTick(t => t + 1);
      } else if (receipt?.status === 'reverted') {
        setTxError('Transação revertida pela rede.'); setTxStep('error');
      } else {
        setTxStep('pending');
      }
    } catch {
      setTxStep('pending');
    }
  }, [txHash, currentChainId]);

  const swap = () => { setSell(buy); setBuy(sell); setSellAmt(''); setQuote(null); setTxStep('idle'); setTxError(null); setTxHash(null); };

  const explorerBase = {
    1: 'https://etherscan.io', 42161: 'https://arbiscan.io',
    10: 'https://optimistic.etherscan.io', 137: 'https://polygonscan.com',
    8453: 'https://basescan.org',
  }[currentChainId] || 'https://basescan.org';

  // Valor recebido: preferir netBuyAmountEstimated (após taxa) ou buyAmount bruto
  const buyAmtDisplay = quote
    ? fmtAmount(parseFloat(quote.netBuyAmountEstimated || quote.buyAmount) / 10 ** buy.decimals)
    : '';

  // Preço humano: 1 sell = X buy (calculado dos valores brutos + decimais dos tokens)
  // v2 API não retorna `price` diretamente
  const humanPrice = quote && quote.sellAmount && quote.buyAmount
    ? (parseFloat(quote.buyAmount) / 10 ** buy.decimals) /
      (parseFloat(quote.sellAmount) / 10 ** sell.decimals)
    : null;

  const sellAmtWei = toWei(sellAmt, sell.decimals);
  const hasInsufficientBalance = sellBal != null && sellAmtWei > 0n && sellAmtWei > sellBal;

  // Gas viability: gasUSD vs tradeUSD
  const gasInfo = useMemo(() => {
    if (!quote?.estimatedGas || !sellAmt) return null;
    const gasUnits = parseInt(quote.estimatedGas) || 0;
    if (!gasUnits) return null;

    // gas price from quote or chain-based fallback (L2 ~0.005 gwei, mainnet ~25 gwei)
    let gasPriceGwei = (currentChainId === 1 ? 25 : 0.005);
    if (quote.gasPrice) {
      try { gasPriceGwei = Number(BigInt(quote.gasPrice)) / 1e9; } catch {}
    }

    const ETH_USD = 3000; // fallback price
    const gasUsd = (gasUnits * gasPriceGwei * 1e-9) * ETH_USD;

    // Estimate trade USD from sell token
    const sym    = sell.symbol.toUpperCase();
    const buySym = buy.symbol.toUpperCase();
    const qty    = parseFloat(sellAmt) || 0;
    let tradeUsd = 0;

    if (sym === 'USDC' || sym === 'USDT') {
      tradeUsd = qty;
    } else if (sym === 'ETH' || sym === 'WETH') {
      tradeUsd = qty * ETH_USD;
    } else if ((buySym === 'USDC' || buySym === 'USDT') && quote.buyAmount) {
      tradeUsd = parseFloat(quote.buyAmount) / (10 ** buy.decimals);
    }

    if (!tradeUsd) return { gasUsd, ratio: null, level: null, tradeUsd: 0 };
    const ratio = gasUsd / tradeUsd;
    // baixo ≤3% · alto 3-10% · inviável >10%
    const level = ratio <= 0.03 ? 'baixo' : ratio <= 0.10 ? 'alto' : 'inviável';
    return { gasUsd, ratio, level, tradeUsd };
  }, [quote, sell, buy, sellAmt, currentChainId]);

  // Smart platform fee: tiered by trade size
  const platformFeeInfo = useMemo(() => {
    if (!quote) return { display: '0.5%', note: null };
    const usd = gasInfo?.tradeUsd || 0;
    if (usd > 0 && usd < 10) return { display: '$0.05 (fixo)', note: 'Taxa mínima para operações pequenas.' };
    if (usd >= 10 && usd < 50) return { display: '0.25%', note: null };
    return { display: '0.5%', note: null };
  }, [quote, gasInfo]);

  return (
    <div className="max-w-lg mx-auto space-y-6 py-4 animate-fade-in">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-950/40 border border-violet-800/30 rounded-full text-xs text-violet-400 font-medium mb-3">
          <span>⇅</span> {quote?.isEstimated ? 'CoinGecko · Estimativa de preço' : quote?.isUniswapDirect ? 'Uniswap V3 · Rota direta' : '0x Protocol · Melhor rota automática'}
        </div>
        <h1 className="text-3xl font-bold text-white">Swap</h1>
        <p className="text-slate-500 mt-1.5 text-sm">
          Troque tokens com a melhor rota disponível.{' '}
          <span className="text-violet-400">Taxa plataforma: {platformFeeInfo.display}.</span>
        </p>
      </div>

      {/* Swap card */}
      <div className="bg-surface-1 border border-white/[0.07] rounded-2xl p-5 space-y-3 shadow-card">

        {/* Sell */}
        <div className="bg-surface-2 rounded-xl p-4 border border-white/[0.05]">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-slate-500">Você envia</p>
            <select
              value={sell.address}
              onChange={e => { setSell(tokens.find(t => t.address === e.target.value)); setQuote(null); setTxStep('idle'); setTxError(null); setTxHash(null); }}
              className="bg-surface-3 border border-white/[0.08] text-white text-sm rounded-lg px-2 py-1.5 outline-none hover:border-white/20 transition-colors"
            >
              {tokens.filter(t => t.address !== buy.address).map(t => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
            </select>
          </div>
          <input
            type="text" inputMode="decimal" placeholder="0.00"
            value={sellAmt}
            onChange={e => {
              setSellAmt(normalizeAmountInput(e.target.value));
              setQuote(null);
              setTxStep('idle');
              setTxError(null);
              setTxHash(null);
              setGasBlockOverride(false);
            }}
            onBlur={e => setSellAmt(normalizeAmountInput(e.target.value))}
            className="w-full bg-transparent text-2xl font-bold text-white outline-none placeholder-slate-700"
          />
          {isConnected && (
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${hasInsufficientBalance ? 'text-red-400' : 'text-slate-600'}`}>
                Saldo: {balancesLoading ? 'carregando...' : sellBal != null ? `${fmtBal(sellBal, sell.decimals)} ${sell.symbol}` : '—'}
              </span>
              {sellBal != null && sellBal > 0n && (
                <button
                  onClick={() => { setSellAmt(formatUnits(sellBal, sell.decimals)); setQuote(null); setTxStep('idle'); setTxError(null); setTxHash(null); }}
                  className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors"
                >
                  MAX
                </button>
              )}
            </div>
          )}
        </div>

        {/* Swap arrow */}
        <div className="flex justify-center">
          <button onClick={swap}
            className="bg-surface-3 hover:bg-surface-4 border border-white/[0.08] hover:border-white/[0.16] rounded-xl p-2.5 text-slate-400 hover:text-white transition-all duration-150">
            ⇅
          </button>
        </div>

        {/* Buy */}
        <div className="bg-surface-2 rounded-xl p-4 border border-white/[0.05]">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-slate-500">Você recebe</p>
            <select
              value={buy.address}
              onChange={e => { setBuy(tokens.find(t => t.address === e.target.value)); setQuote(null); setTxStep('idle'); setTxError(null); setTxHash(null); }}
              className="bg-surface-3 border border-white/[0.08] text-white text-sm rounded-lg px-2 py-1.5 outline-none hover:border-white/20 transition-colors"
            >
              {tokens.filter(t => t.address !== sell.address).map(t => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
            </select>
          </div>
          <div className="text-2xl font-bold text-white min-h-[2rem]">
            {loading ? (
              <span className="text-slate-600 text-lg">Buscando…</span>
            ) : buyAmtDisplay ? (
              buyAmtDisplay
            ) : (
              <span className="text-slate-700">0.00</span>
            )}
          </div>
          {isConnected && buyBal != null && (
            <p className="text-xs text-slate-600 mt-2">
              Saldo: {fmtBal(buyBal, buy.decimals)} {buy.symbol}
            </p>
          )}
        </div>

        {/* Quote details */}
        {quote && !loading && (
          <div className="bg-surface-2/50 border border-white/[0.06] rounded-xl p-4 space-y-2 text-sm">
            <p className="stat-label mb-2">Detalhes da cotação</p>

            {humanPrice != null && (
              <div className="flex justify-between text-slate-400">
                <span>Cotação</span>
                <span className="text-white font-medium">
                  1 {sell.symbol} ≈ {fmtAmount(humanPrice)} {buy.symbol}
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-400">
              <span>Valor bruto estimado</span>
              <span className="text-white">
                {fmtAmount(parseFloat(quote.grossBuyAmount || quote.buyAmount) / 10 ** buy.decimals)} {buy.symbol}
              </span>
            </div>

            <div className="flex justify-between text-slate-400">
              <span>Taxa plataforma ({platformFeeInfo.display})</span>
              <span className="text-violet-400">
                -{fmtAmount(parseFloat(quote.platformFeeEstimated || '0') / 10 ** buy.decimals)} {buy.symbol}
              </span>
            </div>
            {platformFeeInfo.note && (
              <p className="text-xs text-violet-400/60">{platformFeeInfo.note}</p>
            )}

            <div className="flex justify-between text-slate-400 border-t border-white/[0.06] pt-2">
              <span className="font-medium text-white">Você recebe (líquido)</span>
              <span className="text-emerald-400 font-semibold">
                {fmtAmount(parseFloat(quote.netBuyAmountEstimated || quote.buyAmount) / 10 ** buy.decimals)} {buy.symbol}
              </span>
            </div>

            {quote.minBuyAmount && (
              <div className="flex justify-between text-slate-400">
                <span>Mínimo garantido</span>
                <span className="text-slate-300">
                  {fmtAmount(parseFloat(quote.minBuyAmount) / 10 ** buy.decimals)} {buy.symbol}
                </span>
              </div>
            )}

            {quote.estimatedGas && (
              <div className="flex justify-between text-slate-400 items-center">
                <span>Gas estimado</span>
                <span className="flex items-center gap-2 flex-wrap justify-end">
                  <span>{parseInt(quote.estimatedGas).toLocaleString()} units</span>
                  {gasInfo?.gasUsd != null && (
                    <span className="text-slate-500 text-xs">
                      ≈ {gasInfo.gasUsd < 0.01 ? '<$0.01' : `$${gasInfo.gasUsd.toFixed(3)}`}
                    </span>
                  )}
                  {gasInfo?.level && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${
                      gasInfo.level === 'baixo'
                        ? 'border-emerald-800 bg-emerald-950/30 text-emerald-400'
                        : gasInfo.level === 'alto'
                        ? 'border-amber-800 bg-amber-950/30 text-amber-400'
                        : 'border-red-900 bg-red-950/60 text-red-300'
                    }`}>
                      Gas {gasInfo.level}
                    </span>
                  )}
                </span>
              </div>
            )}

            {quote.sources?.filter(s => parseFloat(s.proportion) > 0).length > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Roteado via</span>
                <span className="text-slate-300 text-right max-w-[55%] truncate">
                  {quote.sources.filter(s => parseFloat(s.proportion) > 0).map(s => s.name).join(', ')}
                </span>
              </div>
            )}

            {quote.isPreviewOnly && (
              <p className="text-xs text-amber-600/80 pt-1">
                Preview sem carteira. Conecte para obter cotação executável.
              </p>
            )}
          </div>
        )}

        {/* Estimated quote warning — non-executable */}
        {quote?.isEstimated && (
          <div className="rounded-xl p-3 text-xs space-y-2 border bg-amber-950/30 border-amber-700/40 text-amber-300">
            <p className="font-medium">⚠ Cotação estimada — não executável</p>
            <p>Não foi possível obter cotação real via 0x ou Uniswap V3. O valor mostrado é uma estimativa baseada em preços de mercado e pode diferir do real.</p>
            <button
              onClick={() => { setError(null); fetchQuote(); }}
              className="text-xs text-amber-200 font-medium underline"
            >
              Tentar cotação real
            </button>
          </div>
        )}

        {/* Gas alto — aviso (3–10%), não bloqueia */}
        {gasInfo?.level === 'alto' && (
          <div className="rounded-xl p-3 text-xs space-y-1 border bg-amber-950/30 border-amber-800/40 text-amber-300">
            <p className="font-medium">⚠ Gas alto para este valor</p>
            <p>Gas representa <strong>{(gasInfo.ratio * 100).toFixed(1)}%</strong> da operação. Essa operação pode não compensar.</p>
          </div>
        )}

        {/* Gas inviável — bloqueia (>10%) */}
        {gasInfo?.level === 'inviável' && (
          <div className="rounded-xl p-3 text-xs space-y-1.5 border bg-red-950/30 border-red-800/40 text-red-300">
            <p className="font-medium">🚫 Gas muito alto para este valor</p>
            <p>Gas representa <strong>{(gasInfo.ratio * 100).toFixed(1)}%</strong> da operação. Aumente o valor ou tente outra rota/rede.</p>
            {!gasBlockOverride && (
              <button onClick={() => setGasBlockOverride(true)} className="text-xs text-red-400 underline">
                Prosseguir mesmo assim
              </button>
            )}
          </div>
        )}

        {/* Valor mínimo recomendado em Base */}
        {currentChainId === 8453 && gasInfo?.tradeUsd > 0 && gasInfo.tradeUsd < 25 && gasInfo.level !== 'inviável' && (
          <div className="rounded-xl p-3 text-xs border border-slate-700 bg-slate-900/50 text-slate-400">
            Para evitar que o gas consuma seu resultado, recomendamos operar acima de US$25 na Base.
          </div>
        )}

        {/* L2 suggestion when on mainnet */}
        {currentChainId === 1 && quote && (
          <div className="rounded-xl p-3 text-xs border border-amber-800/30 bg-amber-950/20 text-amber-400">
            Você está na Ethereum mainnet (gas alto). Troque para Base, Arbitrum ou Optimism para pagar menos gas.
          </div>
        )}

        {/* API error */}
        {error && (
          <div className="rounded-xl p-4 text-sm space-y-2 border bg-red-950/20 border-red-800/40 text-red-300">
            <p className="font-medium">
              {error === 'Swap ainda não disponível nesta rede.'
                ? 'Rede sem swap'
                : error.toLowerCase().includes('liquidez') || error.toLowerCase().includes('rota') || error.toLowerCase().includes('liquidity')
                ? 'Rota indisponível'
                : error.toLowerCase().includes('funds') || error.toLowerCase().includes('saldo')
                ? 'Saldo insuficiente'
                : 'Erro ao buscar cotação'}
            </p>
            <p className="text-xs opacity-80">{parseQuoteError(error)}</p>
            {quoteDebug?.apiErrorBody?.detail && (
              <p className="text-xs opacity-80">Detalhe API: {quoteDebug.apiErrorBody.detail}</p>
            )}
            <button
              onClick={() => { setError(null); fetchQuote(); }}
              disabled={!isSwapSupported}
              className="text-xs text-red-300 underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {showSwapDebug && quoteDebug && (
          <div className="rounded-xl p-3 text-xs border border-sky-800/40 bg-sky-950/20 text-sky-200 space-y-2">
            <p className="font-semibold">Debug temporário da cotação</p>
            <div className="grid grid-cols-1 gap-1 text-sky-100/80">
              <p><span className="text-sky-400">chain:</span> {quoteDebug.activeChainId} ({quoteDebug.chainName})</p>
              <p><span className="text-sky-400">wallet:</span> {quoteDebug.walletAddress || 'desconectada'}</p>
              <p><span className="text-sky-400">tokenIn:</span> {quoteDebug.tokenInSymbol} · {quoteDebug.tokenInAddress}</p>
              <p><span className="text-sky-400">tokenOut:</span> {quoteDebug.tokenOutSymbol} · {quoteDebug.tokenOutAddress}</p>
              <p><span className="text-sky-400">input:</span> {quoteDebug.inputAmountOriginal} → {quoteDebug.inputAmountNormalized} · raw {quoteDebug.amountRaw}</p>
              <p><span className="text-sky-400">decimals/provider:</span> {quoteDebug.decimalsUsed} · {quoteDebug.providerNetwork ?? 'n/a'}</p>
              <p className="break-all"><span className="text-sky-400">endpoint:</span> {quoteDebug.endpoint || 'n/a'}</p>
              <p><span className="text-sky-400">HTTP:</span> {quoteDebug.httpStatus || 'n/a'} {quoteDebug.httpStatusText || ''}</p>
              {quoteDebug.catchMessage && <p><span className="text-sky-400">catch:</span> {quoteDebug.catchMessage}</p>}
            </div>
            {quoteDebug.apiErrorBody && (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] text-sky-100">
                {JSON.stringify(quoteDebug.apiErrorBody, null, 2)}
              </pre>
            )}
          </div>
        )}

        {/* Tx step feedback — todos os estados */}
        {txStep !== 'idle' && txStep !== 'error' && (
          <div className={`flex items-start gap-3 rounded-xl p-4 text-sm border ${
            txStep === 'success' ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400'
            : txStep === 'pending' ? 'bg-amber-950/30 border-amber-800/40 text-amber-300'
            : 'bg-violet-950/30 border-violet-800/40 text-violet-300'
          }`}>
            {txStep !== 'success' && txStep !== 'pending' && (
              <span className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5" />
            )}
            {txStep === 'pending' && <span className="shrink-0 mt-0.5">⏳</span>}
            <div className="flex-1 space-y-2">
              <span className="block">
                {txStep === 'approving'       && `Aprovando ${sell.symbol} — confirme no MetaMask…`}
                {txStep === 'refreshingQuote' && 'Approve confirmado. Buscando nova cotação…'}
                {txStep === 'signing'         && 'Assine a permissão Permit2 no MetaMask…'}
                {txStep === 'swapping'        && 'Aguardando assinatura no MetaMask…'}
                {txStep === 'confirming' && (
                  <>
                    Transação enviada — aguardando confirmação…{' '}
                    {txHash && (
                      <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                         className="underline text-violet-300 ml-1">Ver no explorer</a>
                    )}
                  </>
                )}
                {txStep === 'pending' && (
                  <>
                    Transação enviada. Aguardando confirmação na rede.{' '}
                    {txHash && (
                      <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                         className="underline text-amber-200 ml-1">Ver no explorer</a>
                    )}
                  </>
                )}
                {txStep === 'success' && (
                  <>
                    Swap concluído com sucesso!{' '}
                    {txHash && (
                      <a href={`${explorerBase}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                         className="underline ml-1">Ver transação</a>
                    )}
                  </>
                )}
              </span>
              {txStep === 'pending' && (
                <button onClick={verifyTx} className="text-xs font-medium text-amber-200 underline">
                  Verificar novamente
                </button>
              )}
            </div>
          </div>
        )}

        {txStep === 'error' && txError && (
          <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-4 text-sm text-red-400 space-y-2">
            <p className="font-medium">Falha no swap</p>
            <p className="text-xs opacity-80">{txError}</p>
            <button
              onClick={() => { setTxStep('idle'); setTxError(null); }}
              className="text-xs text-red-300 underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* CTA */}
        {!isConnected ? (
          <button onClick={connect} className="btn-primary w-full">
            Conectar Carteira
          </button>
        ) : (
          <button
            onClick={executeSwap}
            disabled={
              !isSwapSupported ||
              !quote || loading || hasInsufficientBalance ||
              quote?.isEstimated ||
              (gasInfo?.level === 'inviável' && !gasBlockOverride) ||
              txStep === 'approving' || txStep === 'signing' ||
              txStep === 'swapping'  || txStep === 'confirming' ||
              txStep === 'refreshingQuote'
            }
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(txStep === 'approving' || txStep === 'signing' || txStep === 'swapping' || txStep === 'confirming' || txStep === 'refreshingQuote') ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Aguarde…</>
            ) : !isSwapSupported ? 'Swap ainda não disponível nesta rede.'
              : loading ? 'Buscando cotação…'
              : hasInsufficientBalance ? `Saldo insuficiente de ${sell.symbol}`
              : !quote ? 'Insira um valor para cotar'
              : quote?.isEstimated ? 'Aguardando cotação executável'
              : gasInfo?.level === 'inviável' && !gasBlockOverride ? 'Operação não recomendada'
              : gasInfo?.level === 'alto' ? `Gas alto — Trocar ${sell.symbol} → ${buy.symbol}`
              : `Trocar agora — ${sell.symbol} → ${buy.symbol}`}
          </button>
        )}
      </div>

      {/* Risk disclaimer */}
      <div className="bg-surface-1 border border-white/[0.06] rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300">⚠ Avisos e Riscos</h3>
        <ul className="space-y-1.5 text-xs text-slate-500">
          <li>• <strong className="text-slate-400">Slippage:</strong> O valor recebido pode ser menor que o cotado devido à variação de preço durante a transação.</li>
          <li>• <strong className="text-slate-400">Impacto de preço:</strong> Transações grandes movem o preço do pool — verifique o impacto antes de confirmar.</li>
          <li>• <strong className="text-slate-400">Gas:</strong> Taxas de rede são cobradas independentemente do sucesso da transação.</li>
          <li>• <strong className="text-slate-400">Taxa da plataforma:</strong> Uma taxa de {platformFeeInfo.display} é aplicada sobre o valor recebido.</li>
          <li>• <strong className="text-slate-400">DeFi:</strong> Contratos inteligentes podem ter vulnerabilidades. Opere com valores que está disposto a perder.</li>
        </ul>
        <p className="text-xs text-slate-600">
          Swap roteado via <strong className="text-slate-500">0x Protocol</strong>. Este produto não é um serviço regulamentado de câmbio.
        </p>
      </div>

      {/* Supported chains info */}
      <div className="text-center text-xs text-slate-600 space-y-1">
        <p>Redes suportadas: Ethereum · Base · Arbitrum · Optimism · Polygon</p>
        <p>Rede conectada: <span className="text-slate-400">{CHAIN_NAMES[currentChainId] || 'Desconectado'}</span></p>
      </div>
    </div>
  );
}
