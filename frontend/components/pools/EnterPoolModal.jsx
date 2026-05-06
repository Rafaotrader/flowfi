'use client';

import { useEffect, useMemo, useState } from 'react';
import { addLiquidityToPool } from '../../lib/web3';

const BASE_CHAIN_ID = 8453;
const NATIVE_ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const TOKEN_ADDR_BY_SYMBOL = {
  8453: {
    ETH: NATIVE_ETH,
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    CBBTC: '0xcbB7C0000aB88B473b1f5a45fA9e8cEdaB6FeaA1',
    cbBTC: '0xcbB7C0000aB88B473b1f5a45fA9e8cEdaB6FeaA1',
    WBTC: '0xcbB7C0000aB88B473b1f5a45fA9e8cEdaB6FeaA1',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
};

const TOKEN_DECIMALS_BY_SYMBOL = {
  ETH: 18,
  WETH: 18,
  USDC: 6,
  USDT: 6,
  CBBTC: 8,
  cbBTC: 8,
  WBTC: 8,
};

function isAddress(value) {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeSymbol(symbol) {
  if (!symbol) return '';
  const s = String(symbol).trim();
  if (s.toLowerCase() === 'cbbtc') return 'CBBTC';
  return s.toUpperCase();
}

function isNativeToken(address, symbol) {
  const sym = normalizeSymbol(symbol);
  const addr = String(address || '').toLowerCase();
  return sym === 'ETH' || addr === NATIVE_ETH || addr === '0x0000000000000000000000000000000000000000';
}

function resolveTokenAddress(token, chainId = BASE_CHAIN_ID) {
  const direct = token?.address || token?.id || token?.tokenAddress || token?.contractAddress;
  if (isAddress(direct)) return direct;

  const symbol = normalizeSymbol(token?.symbol || token?.ticker || token?.name);
  const map = TOKEN_ADDR_BY_SYMBOL[chainId] || TOKEN_ADDR_BY_SYMBOL[BASE_CHAIN_ID];
  return map?.[symbol] || null;
}

function getTokenSymbol(token, fallback = 'TOKEN') {
  return token?.symbol || token?.ticker || token?.name || fallback;
}

function parsePoolTokens(pool) {
  const token0 = pool?.token0 || pool?.tokens?.[0] || pool?.tokenA || null;
  const token1 = pool?.token1 || pool?.tokens?.[1] || pool?.tokenB || null;

  if (token0 && token1) return [token0, token1];

  const pair = pool?.pair || pool?.name || pool?.symbol || pool?.poolName || '';
  const [a, b] = String(pair).split('/').map((x) => x?.trim()).filter(Boolean);

  return [
    token0 || { symbol: a || 'USDC' },
    token1 || { symbol: b || 'ETH' },
  ];
}

function padAddress(address) {
  return String(address).toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

async function ethCall(to, data) {
  if (!window.ethereum) throw new Error('MetaMask não encontrada');
  return window.ethereum.request({
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  });
}

async function getErc20Decimals(tokenAddress, fallbackDecimals) {
  try {
    const result = await ethCall(tokenAddress, '0x313ce567');
    const value = Number(BigInt(result));
    return Number.isFinite(value) && value >= 0 ? value : fallbackDecimals;
  } catch (error) {
    console.warn('[Pool] decimals fallback:', tokenAddress, error?.message);
    return fallbackDecimals;
  }
}

async function getTokenBalance({ token, tokenAddress, userAddress, chainId }) {
  const symbol = getTokenSymbol(token);
  const fallbackDecimals = TOKEN_DECIMALS_BY_SYMBOL[normalizeSymbol(symbol)] ?? 18;

  if (isNativeToken(tokenAddress, symbol)) {
    const rawHex = await window.ethereum.request({
      method: 'eth_getBalance',
      params: [userAddress, 'latest'],
    });
    const raw = BigInt(rawHex);
    console.log('[Pool balance raw]', symbol, raw.toString());
    return {
      raw,
      decimals: 18,
      formatted: formatUnits(raw, 18),
    };
  }

  if (!isAddress(tokenAddress)) {
    throw new Error(`Endereço inválido para ${symbol} na chain ${chainId}`);
  }

  const decimals = await getErc20Decimals(tokenAddress, fallbackDecimals);
  const data = `0x70a08231${padAddress(userAddress)}`;
  const rawHex = await ethCall(tokenAddress, data);
  const raw = BigInt(rawHex);
  console.log('[Pool balance raw]', symbol, raw.toString());

  return {
    raw,
    decimals,
    formatted: formatUnits(raw, decimals),
  };
}

function formatUnits(value, decimals = 18) {
  const raw = BigInt(value || 0);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 8);
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function toDisplay(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0.0000';
  if (n === 0) return '0.0000';
  if (n < 0.000001) return '<0.000001';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}

const POSITION_MANAGER_BASE = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';

const VALID_FEE_TIERS = [100, 500, 3000, 10000];

function resolveFeeTier(pool) {
  const raw = Number(pool?.feeTierRaw ?? pool?.feeRaw ?? 0);
  if (VALID_FEE_TIERS.includes(raw)) return raw;
  const label = String(pool?.feeTierLabel ?? pool?.feeTier ?? pool?.fee ?? '');
  if (label.includes('0.01')) return 100;
  if (label.includes('0.05')) return 500;
  if (label.includes('0.3'))  return 3000;
  if (label.includes('1'))    return 10000;
  return 3000;
}

const RANGE_BY_PROFILE = { conservador: 0.5, moderado: 0.2, agressivo: 0.05 };

function parseUnitsLocal(value, decimals) {
  if (!value || isNaN(parseFloat(value))) return 0n;
  const [int = '0', frac = ''] = String(value).split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt((int || '0') + fracPadded);
}

function encodeApprove(spender, amount) {
  const paddedSpender = String(spender).toLowerCase().replace('0x', '').padStart(64, '0');
  const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
  return `0x095ea7b3${paddedSpender}${paddedAmount}`;
}

async function checkAllowanceRaw(tokenAddress, owner, spender) {
  const paddedOwner = String(owner).toLowerCase().replace('0x', '').padStart(64, '0');
  const paddedSpender = String(spender).toLowerCase().replace('0x', '').padStart(64, '0');
  const result = await ethCall(tokenAddress, `0xdd62ed3e${paddedOwner}${paddedSpender}`);
  return BigInt(result);
}

async function waitForReceipt(txHash, maxMs = 120_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const receipt = await window.ethereum
      .request({ method: 'eth_getTransactionReceipt', params: [txHash] })
      .catch(() => null);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}

export default function EnterPoolModal(props) {
  const {
    pool,
    address,
    account,
    walletAddress,
    isOpen = true,
    open = true,
    onClose,
    onConfirm,
  } = props;

  const [detectedAddress, setDetectedAddress] = useState(null);

  useEffect(() => {
    async function detectWallet() {
      if (typeof window === 'undefined' || !window.ethereum) return;
      const accounts = await window.ethereum
        .request({ method: 'eth_accounts' })
        .catch(() => []);
      setDetectedAddress(accounts?.[0] || null);
    }
    detectWallet();
    window.ethereum?.on?.('accountsChanged', detectWallet);
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', detectWallet);
    };
  }, []);

  const userAddress = address || account || walletAddress || detectedAddress;
  const poolChainId = Number(pool?.chainId || pool?.networkId || BASE_CHAIN_ID);
  const [token0, token1] = useMemo(() => parsePoolTokens(pool), [pool]);

  const t0Addr = useMemo(() => resolveTokenAddress(token0, poolChainId), [token0, poolChainId]);
  const t1Addr = useMemo(() => resolveTokenAddress(token1, poolChainId), [token1, poolChainId]);
  const hasAddrs = Boolean(t0Addr && t1Addr);

  const symbol0 = getTokenSymbol(token0, 'TOKEN0');
  const symbol1 = getTokenSymbol(token1, 'TOKEN1');

  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [bal0, setBal0] = useState(null);
  const [bal1, setBal1] = useState(null);
  const [bal0Error, setBal0Error] = useState(false);
  const [bal1Error, setBal1Error] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [riskProfile, setRiskProfile] = useState('moderado');
  const [chainWarning, setChainWarning] = useState('');
  const [enterStep, setEnterStep] = useState('idle');
  const [enterError, setEnterError] = useState(null);
  const [enterTxHash, setEnterTxHash] = useState(null);

  useEffect(() => {
    if (!isOpen || !open) return;

    if (!hasAddrs || !userAddress || !window.ethereum) {
      setBal0(null);
      setBal1(null);
      setBal0Error(false);
      setBal1Error(false);
      setLoadingBalances(false);
      return;
    }

    let cancelled = false;

    const loadBalances = async () => {
      try {
        setLoadingBalances(true);
        setBal0Error(false);
        setBal1Error(false);
        setChainWarning('');

        const mmChainHex = await window.ethereum.request({ method: 'eth_chainId' }).catch(() => null);
        const mmChainId = mmChainHex ? parseInt(mmChainHex, 16) : null;

        console.log('[Pool wallet]', userAddress);
        console.log('[Pool chain]', { poolChainId, metamaskChainId: mmChainId });
        console.log('[Pool token]', { symbol: symbol0, resolvedAddress: t0Addr });
        console.log('[Pool token]', { symbol: symbol1, resolvedAddress: t1Addr });

        if (mmChainId && mmChainId !== poolChainId) {
          setChainWarning(`MetaMask está na rede ${mmChainId}. Troque para a rede da pool (${poolChainId}).`);
        }

        const [nextBal0, nextBal1] = await Promise.all([
          getTokenBalance({ token: token0, tokenAddress: t0Addr, userAddress, chainId: poolChainId }).catch((error) => {
            console.error('[Pool] bal0 error:', error?.message || error);
            return null;
          }),
          getTokenBalance({ token: token1, tokenAddress: t1Addr, userAddress, chainId: poolChainId }).catch((error) => {
            console.error('[Pool] bal1 error:', error?.message || error);
            return null;
          }),
        ]);

        if (cancelled) return;

        if (nextBal0) setBal0(nextBal0);
        else setBal0Error(true);

        if (nextBal1) setBal1(nextBal1);
        else setBal1Error(true);
      } catch (error) {
        console.error('[Pool] fetch error:', error?.message || error);
        if (!cancelled) {
          setBal0Error(true);
          setBal1Error(true);
        }
      } finally {
        if (!cancelled) setLoadingBalances(false);
      }
    };

    loadBalances();

    const reload = () => loadBalances();
    window.ethereum?.on?.('accountsChanged', reload);
    window.ethereum?.on?.('chainChanged', reload);

    return () => {
      cancelled = true;
      window.ethereum?.removeListener?.('accountsChanged', reload);
      window.ethereum?.removeListener?.('chainChanged', reload);
    };
  }, [isOpen, open, hasAddrs, userAddress, t0Addr, t1Addr, poolChainId, symbol0, symbol1, token0, token1]);

  if (!isOpen || !open || !pool) return null;

  const applyPercent = (tokenIndex, percent) => {
    const bal = tokenIndex === 0 ? bal0 : bal1;
    if (!bal?.raw || bal.raw <= 0n) return;
    const partial = (bal.raw * BigInt(percent)) / 100n;
    const formatted = formatUnits(partial, bal.decimals);
    if (tokenIndex === 0) setAmount0(formatted);
    else setAmount1(formatted);
  };

  const handleEnterPool = async () => {
    if (!userAddress) { setEnterError('Conecte a carteira.'); return; }

    const mmChainHex = await window.ethereum?.request({ method: 'eth_chainId' }).catch(() => null);
    const mmChainId = mmChainHex ? parseInt(mmChainHex, 16) : null;
    if (mmChainId !== BASE_CHAIN_ID) {
      setEnterError(`Troque para Base (8453) no MetaMask. Rede atual: ${mmChainId ?? '?'}.`);
      return;
    }

    const hasAmt0 = Boolean(amount0 && parseFloat(amount0) > 0);
    const hasAmt1 = Boolean(amount1 && parseFloat(amount1) > 0);
    if (!hasAmt0 && !hasAmt1) { setEnterError('Informe ao menos um valor.'); return; }

    setEnterStep('approving');
    setEnterError(null);
    setEnterTxHash(null);
    console.log('[Pool enter] amounts', { amount0, amount1 });

    try {
      const spender = POSITION_MANAGER_BASE;

      if (hasAmt0 && isAddress(t0Addr) && !isNativeToken(t0Addr, symbol0)) {
        const amt0Wei = parseUnitsLocal(amount0, bal0?.decimals ?? 18);
        const allowance0 = await checkAllowanceRaw(t0Addr, userAddress, spender);
        console.log('[Pool enter] token0 approve', { token: symbol0, addr: t0Addr, amount: amt0Wei.toString(), allowance: allowance0.toString() });
        if (allowance0 < amt0Wei) {
          setEnterStep('waitingSignature');
          const hash0 = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{ from: userAddress, to: t0Addr, data: encodeApprove(spender, amt0Wei) }],
          });
          setEnterTxHash(hash0);
          setEnterStep('submitted');
          const r0 = await waitForReceipt(hash0);
          if (!r0 || r0.status === '0x0') throw new Error(`Aprovação de ${symbol0} falhou.`);
        }
      }

      if (hasAmt1 && isAddress(t1Addr) && !isNativeToken(t1Addr, symbol1)) {
        const amt1Wei = parseUnitsLocal(amount1, bal1?.decimals ?? 18);
        const allowance1 = await checkAllowanceRaw(t1Addr, userAddress, spender);
        console.log('[Pool enter] token1 approve', { token: symbol1, addr: t1Addr, amount: amt1Wei.toString(), allowance: allowance1.toString() });
        if (allowance1 < amt1Wei) {
          setEnterStep('waitingSignature');
          const hash1 = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{ from: userAddress, to: t1Addr, data: encodeApprove(spender, amt1Wei) }],
          });
          setEnterTxHash(hash1);
          setEnterStep('submitted');
          const r1 = await waitForReceipt(hash1);
          if (!r1 || r1.status === '0x0') throw new Error(`Aprovação de ${symbol1} falhou.`);
        }
      }

      setEnterStep('approved');
    } catch (err) {
      const msg = err?.message || String(err);
      const code = err?.code;
      if (code === 4001 || msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied')) {
        setEnterError('Transação cancelada pelo usuário.');
      } else {
        setEnterError(msg.length > 150 ? msg.slice(0, 150) + '…' : msg);
      }
      setEnterStep('failed');
    }
  };

  const handleMintPosition = async () => {
    if (!userAddress) return;
    const hasAmt0 = Boolean(amount0 && parseFloat(amount0) > 0);
    const hasAmt1 = Boolean(amount1 && parseFloat(amount1) > 0);
    if (!hasAmt0 && !hasAmt1) { setEnterError('Informe ao menos um valor para criar a posição.'); return; }

    setEnterStep('minting');
    setEnterError(null);

    try {
      const fee = resolveFeeTier(pool);
      const rangePercent = RANGE_BY_PROFILE[riskProfile] ?? 0.2;
      const d0 = bal0?.decimals ?? 18;
      const d1 = bal1?.decimals ?? 18;
      const amt0Wei = parseUnitsLocal(hasAmt0 ? amount0 : '0', d0);
      const amt1Wei = parseUnitsLocal(hasAmt1 ? amount1 : '0', d1);

      console.log('[Pool mint params]', {
        token0: t0Addr, token1: t1Addr, fee, rangePercent,
        amount0Desired: amt0Wei.toString(), amount1Desired: amt1Wei.toString(),
        chainId: BASE_CHAIN_ID,
      });

      const { hash } = await addLiquidityToPool({
        token0Addr:     t0Addr,
        token1Addr:     t1Addr,
        fee,
        amount0Desired: amt0Wei,
        amount1Desired: amt1Wei,
        rangePercent,
        chainId:        BASE_CHAIN_ID,
      });

      console.log('[Pool mint tx]', hash);
      setEnterTxHash(hash);
      setEnterStep('mintSuccess');

      // Save mint record to localStorage — parse tokenId from receipt in background
      ;(async () => {
        try {
          const isStable0 = ['USDC', 'USDT', 'DAI', 'USDBC'].includes(normalizeSymbol(symbol0));
          const isStable1 = ['USDC', 'USDT', 'DAI', 'USDBC'].includes(normalizeSymbol(symbol1));
          const investedUSD =
            (isStable0 && hasAmt0 ? parseFloat(amount0) : 0) +
            (isStable1 && hasAmt1 ? parseFloat(amount1) : 0);

          // Parse tokenId from Transfer event: from=0x0 (mint), topic[3]=tokenId
          const receipt = await waitForReceipt(hash, 60_000);
          let tokenId = null;
          if (receipt?.logs) {
            const TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
            const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
            for (const log of receipt.logs) {
              if (log.topics?.[0]?.toLowerCase() === TRANSFER_SIG && log.topics?.[1] === ZERO && log.topics?.[3]) {
                tokenId = String(BigInt(log.topics[3]));
                break;
              }
            }
          }

          const wallet = (userAddress || '').toLowerCase();
          // Key: flowfi.position.<wallet>.<tokenId> (falls back to tx hash if receipt unavailable)
          const storageKey = `flowfi.position.${wallet}.${tokenId ?? hash}`;
          localStorage.setItem(storageKey, JSON.stringify({
            tokenId,
            chainId: BASE_CHAIN_ID,
            token0: t0Addr,
            token1: t1Addr,
            symbol0,
            symbol1,
            amount0: hasAmt0 ? amount0 : '0',
            amount1: hasAmt1 ? amount1 : '0',
            investedUSD: investedUSD > 0 ? investedUSD : null,
            txHash: hash,
            createdAt: Date.now(),
          }));
          console.log('[Pool mint saved]', storageKey, { tokenId });
        } catch (e) {
          console.warn('[Pool mint localStorage]', e?.message);
        }
      })();

      if (typeof onConfirm === 'function') {
        onConfirm({ pool, amount0, amount1, riskProfile, txHash: hash, token0: { ...token0, address: t0Addr }, token1: { ...token1, address: t1Addr } });
      }
    } catch (err) {
      const msg = err?.message || String(err);
      const code = err?.code;
      if (code === 4001 || msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('user denied')) {
        setEnterError('Transação cancelada pelo usuário.');
      } else {
        setEnterError(msg.length > 200 ? msg.slice(0, 200) + '…' : msg);
      }
      setEnterStep('approved'); // volta para 'approved' para permitir retry do mint
    }
  };

  const inProgress = enterStep === 'approving' || enterStep === 'waitingSignature' || enterStep === 'submitted' || enterStep === 'minting';
  const enterDisabled = !userAddress || (!amount0 && !amount1) || loadingBalances || inProgress;

  // Step progress labels
  const STEPS = [
    { key: 'idle',     label: '1. Configurar' },
    { key: 'approving',label: '2. Aprovar'    },
    { key: 'approved', label: '3. Criar'      },
    { key: 'minting',  label: '3. Criar'      },
  ];
  const stepIndex = ['idle','failed'].includes(enterStep) ? 0
    : ['approving','waitingSignature','submitted'].includes(enterStep) ? 1
    : ['approved','minting'].includes(enterStep) ? 2
    : enterStep === 'mintSuccess' ? 3 : 0;

  const fmtTvl = (v) => {
    if (!v) return '—';
    const n = Number(v);
    if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl text-white shadow-2xl overflow-hidden animate-slide-up"
           style={{ background: '#0c0c20', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.07]">
          <div>
            <h2 className="text-xl font-bold">
              Entrar na pool{' '}
              <span className="gradient-text">{symbol0}/{symbol1}</span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Posição de liquidez · {pool?.feeTierLabel || pool?.feeTier || '0.05%'} · {pool?.networkName || 'Base'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto max-h-[80vh] sm:max-h-[75vh] p-5 space-y-4">

          {/* Step progress */}
          <div className="flex items-center gap-2">
            {['Configurar', 'Aprovar tokens', 'Criar posição'].map((label, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center gap-1.5 text-xs font-medium ${
                  i < stepIndex ? 'text-emerald-400' : i === stepIndex ? 'text-violet-400' : 'text-slate-600'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                    i < stepIndex ? 'bg-emerald-950/50 border-emerald-700 text-emerald-400' :
                    i === stepIndex ? 'bg-violet-950/50 border-violet-600 text-violet-300' :
                    'bg-white/[0.03] border-white/[0.08] text-slate-600'
                  }`}>
                    {i < stepIndex ? '✓' : i + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < 2 && <div className={`flex-1 h-px ${i < stepIndex ? 'bg-emerald-800' : 'bg-white/[0.06]'}`} />}
              </div>
            ))}
          </div>

          {/* Pool summary */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'APR estimado', value: pool?.apr7d != null ? `${Number(pool.apr7d).toFixed(1)}%` : pool?.apr ? `${pool.apr}%` : '—', color: 'text-violet-300' },
              { label: 'Valor em pool', value: fmtTvl(pool?.tvl), color: 'text-white' },
              { label: 'Score',         value: pool?.score != null ? `${pool.score}/100` : '—', color: 'text-white' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                <p className="stat-label text-[10px]">{label}</p>
                <p className={`font-bold text-sm mt-0.5 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Chain warning */}
          {chainWarning && (
            <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800/40 rounded-xl p-3 text-xs text-amber-300">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{chainWarning}</span>
            </div>
          )}

          {/* Token 0 input */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{symbol0}</span>
              <span className={`text-xs ${bal0Error ? 'text-red-400' : 'text-slate-500'}`}>
                {!userAddress
                  ? 'Conecte a carteira'
                  : bal0Error
                  ? 'Erro ao carregar saldo'
                  : loadingBalances && !bal0
                  ? 'Carregando…'
                  : `Saldo: ${toDisplay(bal0?.formatted)}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                value={amount0}
                onChange={(e) => setAmount0(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder:text-slate-700 min-w-0"
              />
              <div className="flex shrink-0 gap-1">
                {[25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    disabled={!bal0?.raw || bal0.raw <= 0n}
                    onClick={() => applyPercent(0, pct)}
                    className="rounded-lg px-1.5 py-1 text-[11px] font-bold text-violet-400 border border-violet-800/50 hover:bg-violet-900/30 hover:text-violet-300 disabled:opacity-30 transition-all"
                  >
                    {pct === 100 ? 'MAX' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-slate-600 text-sm font-medium">+</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Token 1 input */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{symbol1}</span>
              <span className={`text-xs ${bal1Error ? 'text-red-400' : 'text-slate-500'}`}>
                {!userAddress
                  ? 'Conecte a carteira'
                  : bal1Error
                  ? 'Erro ao carregar saldo'
                  : loadingBalances && !bal1
                  ? 'Carregando…'
                  : `Saldo: ${toDisplay(bal1?.formatted)}`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                value={amount1}
                onChange={(e) => setAmount1(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-2xl font-bold text-white outline-none placeholder:text-slate-700 min-w-0"
              />
              <div className="flex shrink-0 gap-1">
                {[25, 50, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    disabled={!bal1?.raw || bal1.raw <= 0n}
                    onClick={() => applyPercent(1, pct)}
                    className="rounded-lg px-1.5 py-1 text-[11px] font-bold text-violet-400 border border-violet-800/50 hover:bg-violet-900/30 hover:text-violet-300 disabled:opacity-30 transition-all"
                  >
                    {pct === 100 ? 'MAX' : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Range profile */}
          <div>
            <p className="stat-label mb-2.5">Perfil de range</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'conservador', label: 'Conservador', range: '±50%', emoji: '🛡', active: 'border-emerald-600 bg-emerald-950/40' },
                { key: 'moderado',    label: 'Moderado',    range: '±20%', emoji: '⚖', active: 'border-violet-600 bg-violet-950/40'  },
                { key: 'agressivo',   label: 'Agressivo',   range: '±5%',  emoji: '⚡', active: 'border-red-600 bg-red-950/40'        },
              ].map(({ key, label, range, emoji, active }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRiskProfile(key)}
                  className={`rounded-xl border p-3 text-left transition-all duration-150 ${
                    riskProfile === key
                      ? `${active} text-white`
                      : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/[0.14]'
                  }`}
                >
                  <span className="text-lg block mb-1">{emoji}</span>
                  <span className="font-semibold text-sm block">{label}</span>
                  <span className="text-[11px] opacity-70 mt-0.5 block">{range}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Risk disclaimer */}
          <div className="flex items-start gap-2 bg-amber-950/20 border border-amber-900/25 rounded-xl p-3 text-xs text-amber-400/80">
            <span className="shrink-0 mt-0.5">⚠</span>
            <div className="space-y-0.5">
              <p>Pools podem perder valor por impermanent loss.</p>
              <p>Valores baixos podem demorar mais para gerar taxas.</p>
              <p>Taxas de rede são cobradas em cada transação.</p>
            </div>
          </div>

          {/* Approved banner */}
          {(enterStep === 'approved' || enterStep === 'minting') && !enterError && (
            <div className="flex items-center gap-2 bg-violet-950/40 border border-violet-800/40 rounded-xl p-3 text-sm text-violet-300">
              <span className="text-base">✓</span>
              Tokens aprovados. Clique em "Criar posição na pool" para confirmar na MetaMask.
            </div>
          )}

          {/* Success */}
          {enterStep === 'mintSuccess' && (
            <div className="flex items-center gap-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-4 text-sm text-emerald-400">
              <span className="text-xl">🎉</span>
              <div>
                <p className="font-semibold">Posição criada com sucesso!</p>
                {enterTxHash && (
                  <a
                    href={`https://basescan.org/tx/${enterTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline text-emerald-300 hover:no-underline mt-0.5 block"
                  >
                    Ver transação no BaseScan ↗
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {enterError && (
            <div className="flex items-start gap-2 bg-red-950/30 border border-red-900/40 rounded-xl p-3 text-sm text-red-400">
              <span className="shrink-0 mt-0.5">✕</span>
              <span>{enterError}</span>
            </div>
          )}

          {/* CTA button */}
          {enterStep !== 'mintSuccess' && (
            <button
              type="button"
              disabled={enterDisabled}
              onClick={enterStep === 'approved' ? handleMintPosition : handleEnterPool}
              className="btn-primary w-full py-3.5 text-base font-bold"
            >
              {inProgress && <span className="spinner-sm" />}
              {enterStep === 'approving'        && 'Aprovando tokens…'}
              {enterStep === 'waitingSignature'  && 'Confirme na MetaMask…'}
              {enterStep === 'submitted'         && 'Aguardando confirmação on-chain…'}
              {enterStep === 'approved'          && 'Criar posição na pool →'}
              {enterStep === 'minting'           && 'Criando posição…'}
              {enterStep === 'failed'            && 'Tentar novamente'}
              {enterStep === 'idle'              && 'Aprovar tokens'}
            </button>
          )}

          {enterStep === 'mintSuccess' && (
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-outline flex-1 py-3">
                Fechar
              </button>
              <a href="/positions" className="btn-primary flex-1 py-3 text-center">
                Ver minhas posições →
              </a>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
