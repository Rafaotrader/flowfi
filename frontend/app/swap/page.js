'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../../components/common/WalletProvider';
import { getSwapQuote } from '../../lib/api';
import {
  getPublicClient, getWalletClient, checkERC20Allowance,
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
};

const CHAIN_NAMES = { 1: 'Ethereum', 42161: 'Arbitrum', 10: 'Optimism', 137: 'Polygon', 8453: 'Base' };
const ZEROX_ALLOWANCE_TARGET = '0xdef1c0ded9bec7f1a1670819833240f027b25eff'; // 0x Exchange Proxy

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

// Safe parseUnits — trunca decimais extras para não lançar erro
function toWei(amount, decimals) {
  if (!amount || isNaN(parseFloat(amount))) return 0n;
  try {
    const [int, frac = ''] = amount.split('.');
    return parseUnits(`${int}.${frac.slice(0, decimals)}`, decimals);
  } catch {
    return 0n;
  }
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

// Traduz erros de cotação para mensagem amigável
function parseQuoteError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('liquidez') || m.includes('liquidity') || m.includes('rota'))
    return 'Não encontramos rota para esse par agora. Tente outro valor ou par.';
  if (m.includes('configurado') || m.includes('api') || m.includes('503'))
    return 'Serviço temporariamente indisponível. Tente novamente em instantes.';
  if (m.includes('expirou') || m.includes('timeout'))
    return 'Cotação expirou — tente novamente.';
  if (m.includes('saldo') || m.includes('funds'))
    return 'Você precisa de saldo nativo para pagar gas.';
  return msg && msg.length > 120 ? msg.slice(0, 120) + '…' : (msg || 'Erro ao buscar cotação');
}

export default function SwapPage() {
  const { address, chainId, isConnected, connect } = useWallet();

  const tokens  = TOKEN_LIST[chainId] || TOKEN_LIST[8453];
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
  const [balanceTick, setBalanceTick] = useState(0); // increment to force refetch
  const [gasBlockOverride, setGasBlockOverride] = useState(false);

  // Reset tokens + state when chain changes
  useEffect(() => {
    const list = TOKEN_LIST[chainId] || TOKEN_LIST[8453];
    setSell(list[0]);
    setBuy(list[1]);
    setQuote(null);
    setSellAmt('');
    setTxStep('idle');
    setTxError(null);
    setTxHash(null);
    setGasBlockOverride(false);
  }, [chainId]);

  // Reset quote + tx state when wallet address changes
  useEffect(() => {
    setQuote(null);
    setSellAmt('');
    setTxStep('idle');
    setTxError(null);
    setTxHash(null);
    setGasBlockOverride(false);
    setBalanceTick(t => t + 1);
  }, [address]);

  // Fetch wallet balances — cancelled flag prevents stale state on rapid changes
  useEffect(() => {
    if (!address || !isConnected) { setSellBal(null); setBuyBal(null); return; }
    let cancelled = false;
    const cid = chainId || 8453;
    const client = getPublicClient(cid);
    const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    function fetchBal(token) {
      return token.address.toLowerCase() === NATIVE
        ? client.getBalance({ address })
        : client.readContract({ address: token.address, abi: ERC20_FULL_ABI, functionName: 'balanceOf', args: [address] });
    }
    fetchBal(sell).then(v => { if (!cancelled) setSellBal(v); }).catch(() => { if (!cancelled) setSellBal(null); });
    fetchBal(buy).then(v  => { if (!cancelled) setBuyBal(v);  }).catch(() => { if (!cancelled) setBuyBal(null);  });
    return () => { cancelled = true; };
  }, [address, isConnected, sell, buy, chainId, balanceTick]);

  // fetchQuote must be defined BEFORE the debounced useEffect that uses it in deps
  const fetchQuote = useCallback(async () => {
    if (!sellAmt || parseFloat(sellAmt) <= 0) return;
    const sellAmountWei = toWei(sellAmt, sell.decimals);
    if (sellAmountWei === 0n) return;
    setLoading(true);
    setError(null);
    try {
      const qty    = parseFloat(sellAmt) || 0;
      const sym    = sell.symbol.toUpperCase();
      const tradeUsdEst = (sym === 'USDC' || sym === 'USDT') ? qty
        : (sym === 'ETH' || sym === 'WETH') ? qty * 3000
        : 0;
      const excludedSources = tradeUsdEst > 0 && tradeUsdEst < 20
        ? 'Uniswap_V2,Curve,Balancer_V2' : undefined;

      let data;
      try {
        data = await getSwapQuote({
          chainId: chainId || 8453,
          sellToken: sell.address,
          buyToken:  buy.address,
          sellAmount: sellAmountWei.toString(),
          ...(address && { takerAddress: address }),
          ...(excludedSources && { excludedSources }),
        });
      } catch {
        // Backend unavailable → fall back to Uniswap V3 QuoterV2 on-chain (no API key needed)
        data = await getUniswapV3Quote(sell.address, buy.address, sellAmountWei.toString(), chainId || 8453);
      }
      setQuote(data);
    } catch (err) {
      setError(err.message);
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [sellAmt, sell, buy, chainId, address]);

  // Debounced quote fetch — fetchQuote in deps so takerAddress is always current
  useEffect(() => {
    if (!sellAmt || parseFloat(sellAmt) <= 0) { setQuote(null); return; }
    const timer = setTimeout(fetchQuote, 600);
    return () => clearTimeout(timer);
  }, [sellAmt, sell, buy, chainId, fetchQuote]);

  const executeSwap = useCallback(async () => {
    if (!quote || !address) return;

    // ── Uniswap V3 path (fallback quando backend 0x indisponível) ──
    if (quote.isUniswapDirect) {
      setTxStep('idle');
      setTxError(null);
      setTxHash(null);
      try {
        const cid = chainId || 8453;
        const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        const isETH  = sell.address.toLowerCase() === NATIVE;
        const sellAmtWei = toWei(sellAmt, sell.decimals);

        if (!isETH) {
          const routerAddr = SWAP_ROUTER_BY_CHAIN[cid] || SWAP_ROUTER_BY_CHAIN[8453];
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
    const expectedChainId = quote.chainId || 8453;
    if (chainId && chainId !== expectedChainId) {
      setTxError(`Troque para ${CHAIN_NAMES[expectedChainId] || 'Base'} (chainId ${expectedChainId}) no MetaMask antes de executar.`);
      setTxStep('error');
      return;
    }

    setTxStep('idle');
    setTxError(null);
    setTxHash(null);

    try {
      const cid           = chainId || 8453;
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
  }, [quote, address, chainId, sell, buy, sellAmt]);

  // Verifica receipt de tx pendente — chamado pelo botão "Verificar novamente"
  const verifyTx = useCallback(async () => {
    if (!txHash) return;
    setTxStep('confirming');
    const publicClient = getPublicClient(chainId || 8453);
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
  }, [txHash, chainId]);

  const swap = () => { setSell(buy); setBuy(sell); setSellAmt(''); setQuote(null); setTxStep('idle'); setTxError(null); setTxHash(null); };

  const explorerBase = {
    1: 'https://etherscan.io', 42161: 'https://arbiscan.io',
    10: 'https://optimistic.etherscan.io', 137: 'https://polygonscan.com',
    8453: 'https://basescan.org',
  }[chainId] || 'https://basescan.org';

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
    let gasPriceGwei = (chainId === 1 ? 25 : 0.005);
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
  }, [quote, sell, buy, sellAmt, chainId]);

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
          <span>⇅</span> {quote?.isUniswapDirect ? 'Uniswap V3 · Rota direta' : '0x Protocol · Melhor rota automática'}
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
            type="number" min="0" step="any" placeholder="0.00"
            value={sellAmt}
            onChange={e => { setSellAmt(e.target.value); setQuote(null); setTxStep('idle'); setTxError(null); setTxHash(null); setGasBlockOverride(false); }}
            className="w-full bg-transparent text-2xl font-bold text-white outline-none placeholder-slate-700"
          />
          {isConnected && (
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${hasInsufficientBalance ? 'text-red-400' : 'text-slate-600'}`}>
                Saldo: {sellBal != null ? `${fmtBal(sellBal, sell.decimals)} ${sell.symbol}` : '—'}
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
        {chainId === 8453 && gasInfo?.tradeUsd > 0 && gasInfo.tradeUsd < 25 && gasInfo.level !== 'inviável' && (
          <div className="rounded-xl p-3 text-xs border border-slate-700 bg-slate-900/50 text-slate-400">
            Para evitar que o gas consuma seu resultado, recomendamos operar acima de US$25 na Base.
          </div>
        )}

        {/* L2 suggestion when on mainnet */}
        {chainId === 1 && quote && (
          <div className="rounded-xl p-3 text-xs border border-amber-800/30 bg-amber-950/20 text-amber-400">
            Você está na Ethereum mainnet (gas alto). Troque para Base, Arbitrum ou Optimism para pagar menos gas.
          </div>
        )}

        {/* API error */}
        {error && (
          <div className="rounded-xl p-4 text-sm space-y-2 border bg-red-950/20 border-red-800/40 text-red-300">
            <p className="font-medium">
              {error.toLowerCase().includes('liquidez') || error.toLowerCase().includes('rota') || error.toLowerCase().includes('liquidity')
                ? 'Rota indisponível'
                : error.toLowerCase().includes('funds') || error.toLowerCase().includes('saldo')
                ? 'Saldo insuficiente'
                : 'Erro ao buscar cotação'}
            </p>
            <p className="text-xs opacity-80">{parseQuoteError(error)}</p>
            <button
              onClick={() => { setError(null); fetchQuote(); }}
              className="text-xs text-red-300 underline"
            >
              Tentar novamente
            </button>
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
              !quote || loading || hasInsufficientBalance ||
              (gasInfo?.level === 'inviável' && !gasBlockOverride) ||
              txStep === 'approving' || txStep === 'signing' ||
              txStep === 'swapping'  || txStep === 'confirming' ||
              txStep === 'refreshingQuote'
            }
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(txStep === 'approving' || txStep === 'signing' || txStep === 'swapping' || txStep === 'confirming' || txStep === 'refreshingQuote') ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Aguarde…</>
            ) : loading ? 'Buscando cotação…'
              : hasInsufficientBalance ? `Saldo insuficiente de ${sell.symbol}`
              : !quote ? 'Insira um valor para cotar'
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
        <p>Rede conectada: <span className="text-slate-400">{CHAIN_NAMES[chainId] || 'Desconectado'}</span></p>
      </div>
    </div>
  );
}
