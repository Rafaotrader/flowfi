const { GraphQLClient, gql } = require('graphql-request');

const SUBGRAPH_URLS = [
  'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
  'https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
];

let clientIndex = 0;
function getClient() {
  return new GraphQLClient(SUBGRAPH_URLS[clientIndex % SUBGRAPH_URLS.length], {
    timeout: 15_000,
  });
}

async function withRetry(fn, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn(getClient());
    } catch (err) {
      lastErr = err;
      clientIndex++; // tenta URL alternativa na próxima tentativa
      const delay = 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

const TOP_POOLS_QUERY = gql`
  query TopPools($skip: Int!) {
    pools(
      first: 50
      skip: $skip
      orderBy: volumeUSD
      orderDirection: desc
      where: { liquidity_gt: "0", totalValueLockedUSD_gt: "100000" }
    ) {
      id
      feeTier
      liquidity
      sqrtPrice
      tick
      token0Price
      token1Price
      volumeUSD
      txCount
      totalValueLockedUSD
      token0 { id symbol name decimals }
      token1 { id symbol name decimals }
      poolDayData(first: 14, orderBy: date, orderDirection: desc) {
        date
        volumeUSD
        feesUSD
        tvlUSD
        open
        high
        low
        close
      }
    }
  }
`;

const POOL_BY_ID_QUERY = gql`
  query PoolById($id: ID!) {
    pool(id: $id) {
      id
      feeTier
      liquidity
      sqrtPrice
      tick
      token0Price
      token1Price
      volumeUSD
      totalValueLockedUSD
      token0 { id symbol name decimals }
      token1 { id symbol name decimals }
      poolDayData(first: 30, orderBy: date, orderDirection: desc) {
        date
        volumeUSD
        feesUSD
        tvlUSD
        open
        high
        low
        close
      }
      poolHourData(first: 48, orderBy: periodStartUnix, orderDirection: desc) {
        periodStartUnix
        volumeUSD
        feesUSD
        tvlUSD
        open
        close
        high
        low
      }
    }
  }
`;

async function fetchTopPools(page = 0) {
  return withRetry((client) =>
    client.request(TOP_POOLS_QUERY, { skip: page * 50 }).then((d) => d.pools)
  );
}

async function fetchPoolById(poolId) {
  return withRetry(async (client) => {
    const data = await client.request(POOL_BY_ID_QUERY, { id: poolId.toLowerCase() });
    if (!data.pool) throw new Error(`Pool ${poolId} not found`);
    return data.pool;
  });
}

/**
 * Enriquece o pool com métricas derivadas necessárias para score e simulação.
 *
 * Métricas calculadas:
 *  - volume24h, fees24h, tvl
 *  - volume7d, fees7d
 *  - volumeMin7d, volumeMax7d (para cenários)
 *  - apr7d (% anual)
 *  - feeConsistency (0-1: 1 = fees previsíveis)
 *  - dailyLogReturnVol (% — volatilidade real de log-retornos diários)
 *  - annualizedVol (% — vol anualizada, para alinhamento de fee tier)
 *  - legacyVolatility7d (% CoV — mantido para compatibilidade com scoreEngine)
 *  - dayCount (quantos dias de dados reais disponíveis)
 */
function enrichPoolData(pool) {
  const dayData = pool.poolDayData || [];

  const volume24h = parseFloat(dayData[0]?.volumeUSD || 0);
  const fees24h = parseFloat(dayData[0]?.feesUSD || 0);
  const tvl = parseFloat(pool.totalValueLockedUSD || 0);
  const dayCount = dayData.length;

  // Volumes e fees dos últimos 7 dias
  const last7 = dayData.slice(0, 7);
  const dailyVolumes = last7.map((d) => parseFloat(d.volumeUSD || 0));
  const dailyFees = last7.map((d) => parseFloat(d.feesUSD || 0));

  const volume7d = dailyVolumes.reduce((s, v) => s + v, 0);
  const fees7d = dailyFees.reduce((s, v) => s + v, 0);
  const volumeMin7d = Math.min(...dailyVolumes.filter((v) => v > 0)) || 0;
  const volumeMax7d = Math.max(...dailyVolumes) || 0;

  // APR: baseado nos dias reais disponíveis (não hardcodado em 7)
  const actualDays = last7.length || 1;
  const apr7d = tvl > 0 ? ((fees7d / actualDays) * 365) / tvl : 0;

  // Consistência de fees: 1 = perfeitamente previsível, 0 = muito irregular
  const feesAvg = fees7d / actualDays;
  const feesStdDev = stdDev(dailyFees);
  const feeConsistency = feesAvg > 0
    ? Math.max(0, 1 - feesStdDev / feesAvg)
    : 0;

  // Volatilidade por log-retornos diários (padrão de mercado financeiro)
  // dayData está em DESC: closes[0] = hoje, closes[1] = ontem
  const closes = dayData
    .map((d) => parseFloat(d.close))
    .filter((v) => v > 0 && isFinite(v));

  let dailyLogReturnVol = 0;
  let annualizedVol = 0;
  let legacyVolatility7d = 0;

  if (closes.length >= 2) {
    // Log-retornos: ln(hoje / ontem)
    const logReturns = [];
    for (let i = 0; i < closes.length - 1; i++) {
      if (closes[i + 1] > 0) {
        logReturns.push(Math.log(closes[i] / closes[i + 1]));
      }
    }
    if (logReturns.length >= 1) {
      dailyLogReturnVol = stdDev(logReturns) * 100; // % por dia
      annualizedVol = dailyLogReturnVol * Math.sqrt(365);
    }

    // CoV legado (para exibição de "volatilidade da semana" no UI)
    const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
    legacyVolatility7d = mean > 0 ? (stdDev(closes) / mean) * 100 : 0;
  }

  const feeTierBps = parseInt(pool.feeTier) / 10_000; // feeTier 3000 → 0.3 bps (fee rate %)

  return {
    ...pool,
    volume24h,
    fees24h,
    volume7d,
    fees7d,
    volumeMin7d,
    volumeMax7d,
    tvl,
    apr7d: apr7d * 100,              // em %
    feeConsistency,
    dailyLogReturnVol,               // % vol diária real (para probabilidade de range)
    annualizedVol,                   // % anualizada (para alinhamento fee tier)
    volatility7d: legacyVolatility7d, // % CoV semanal (para UI)
    dayCount,
    feeTierBps,
    feeTierRaw: parseInt(pool.feeTier), // 100, 500, 3000, 10000
    currentPrice: parseFloat(pool.token0Price || 0),
  };
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

module.exports = { fetchTopPools, fetchPoolById, enrichPoolData };
