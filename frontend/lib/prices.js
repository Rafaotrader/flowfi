'use client';

// ── Stablecoin set (always $1) ────────────────────────────────────────────────
const STABLES = new Set(['USDC', 'USDT', 'DAI', 'USDbC', 'FRAX', 'BUSD', 'LUSD', 'USDS']);

// ── CoinGecko ID map ──────────────────────────────────────────────────────────
const CG_IDS = {
  'WETH':  'weth',
  'ETH':   'ethereum',
  'cbBTC': 'coinbase-wrapped-bitcoin',
  'WBTC':  'wrapped-bitcoin',
  'cbETH': 'coinbase-wrapped-staked-eth',
  'ARB':   'arbitrum',
  'OP':    'optimism',
  'MATIC': 'matic-network',
  'POL':   'matic-network',
  'BNB':   'binancecoin',
};

// Module-level cache (lives for the page session)
let _cache = {};
let _cacheTs = 0;
const CACHE_TTL = 90_000; // 90 seconds

export function isStablecoin(symbol) {
  return STABLES.has(symbol);
}

/**
 * Returns a map of symbol → USD price.
 * Stablecoins always return 1. Unknown tokens are omitted (caller shows "Estimativa indisponível").
 */
export async function getTokenPricesUSD(symbols = []) {
  const result = {};
  const toFetch = [];

  for (const sym of symbols) {
    if (!sym) continue;
    if (STABLES.has(sym)) { result[sym] = 1; continue; }
    if (CG_IDS[sym]) toFetch.push(sym);
    // Unknown symbol: skip — caller decides how to handle
  }

  if (toFetch.length === 0) return result;

  // Return cache if fresh
  const cacheIsFresh = Date.now() - _cacheTs < CACHE_TTL;
  if (cacheIsFresh) {
    for (const sym of toFetch) {
      if (_cache[sym] != null) result[sym] = _cache[sym];
    }
    if (toFetch.every(s => result[s] != null)) return result;
  }

  // Fetch from CoinGecko
  try {
    const ids = [...new Set(toFetch.map(s => CG_IDS[s]).filter(Boolean))].join(',');
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();

    for (const sym of toFetch) {
      const id = CG_IDS[sym];
      if (id && data[id]?.usd != null) {
        result[sym] = data[id].usd;
        _cache[sym] = data[id].usd;
      }
    }
    _cacheTs = Date.now();
  } catch {
    // CoinGecko failed — return stale cache values if available
    for (const sym of toFetch) {
      if (_cache[sym] != null) result[sym] = _cache[sym];
    }
  }

  return result;
}

/**
 * Convert amounts to USD given a price map.
 * Returns null if price is unknown.
 */
export function toUSD(amount, symbol, prices) {
  if (isStablecoin(symbol)) return amount;
  const price = prices?.[symbol];
  if (price == null) return null;
  return amount * price;
}

export function fmtUSD(n) {
  if (n == null) return null;
  if (n === 0) return '$0.00';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}K`;
  if (n < 0.01 && n > 0) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
