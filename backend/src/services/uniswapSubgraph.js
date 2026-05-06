/**
 * Pool Aggregator — dados reais via DeFi Llama Yields API + The Graph (opcional)
 *
 * Fontes:
 *  1. DeFi Llama  → pública, sem API key, cobre Uniswap V3/PancakeSwap V3/QuickSwap
 *  2. The Graph   → quando GRAPH_API_KEY estiver configurado (dados on-chain mais detalhados)
 *
 * Chains: Ethereum (1), Arbitrum (42161), Optimism (10), Polygon (137), Base (8453), BNB (56)
 */

require('dotenv').config();

const DEFI_LLAMA_POOLS_URL = 'https://yields.llama.fi/pools';
const GRAPH_API_KEY        = process.env.GRAPH_API_KEY || '';

// ─── Mapeamento chain ─────────────────────────────────────────────────────────

const CHAIN_INFO = {
  1:     { name: 'Ethereum', llamaName: 'Ethereum', badge: 'ETH',  explorerUrl: 'https://etherscan.io',               color: '#627EEA' },
  42161: { name: 'Arbitrum', llamaName: 'Arbitrum', badge: 'ARB',  explorerUrl: 'https://arbiscan.io',               color: '#28A0F0' },
  10:    { name: 'Optimism', llamaName: 'OP Mainnet', badge: 'OP',  explorerUrl: 'https://optimistic.etherscan.io',   color: '#FF0420' },
  137:   { name: 'Polygon',  llamaName: 'Polygon',  badge: 'POL',  explorerUrl: 'https://polygonscan.com',           color: '#8247E5' },
  8453:  { name: 'Base',     llamaName: 'Base',     badge: 'BASE', explorerUrl: 'https://basescan.org',             color: '#0052FF' },
  56:    { name: 'BNB',      llamaName: 'BSC',      badge: 'BNB',  explorerUrl: 'https://bscscan.com',              color: '#F0B90B' },
};

// Projetos relevantes por chain
const PROJECTS_BY_CHAIN = {
  1:     ['uniswap-v3'],
  42161: ['uniswap-v3'],
  10:    ['uniswap-v3'],
  137:   ['uniswap-v3', 'quickswap-v3'],
  8453:  ['uniswap-v3'],
  56:    ['uniswap-v3', 'pancakeswap-amm', 'pancakeswap-amm-v3'],
};

const FEE_TIER_MAP = { '0.01%': 100, '0.05%': 500, '0.3%': 3000, '1%': 10000 };
const FEE_LABELS   = { 100: '0.01%', 500: '0.05%', 3000: '0.3%', 10000: '1%' };

// ─── Cache em memória (5 minutos) ─────────────────────────────────────────────

let _llamaCache = null;
let _llamaCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function fetchLlamaData() {
  const now = Date.now();
  if (_llamaCache && now - _llamaCacheAt < CACHE_TTL_MS) {
    return _llamaCache;
  }

  const res = await fetch(DEFI_LLAMA_POOLS_URL, {
    headers: { 'Accept': 'application/json' },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`DeFi Llama HTTP ${res.status}`);

  const json = await res.json();
  if (!json.data?.length) throw new Error('DeFi Llama: resposta vazia');

  _llamaCache   = json.data;
  _llamaCacheAt = now;
  console.log(`[Llama] Cache atualizado: ${json.data.length} pools totais`);
  return json.data;
}

// ─── Score (0–100) ────────────────────────────────────────────────────────────

function calculateScore(pool) {
  const tvl    = pool.tvl     || 0;
  const vol24h = pool.volume24h || 0;
  const apr    = pool.apr7d   || 0;
  const cons   = pool.feeConsistency ?? 0.5;
  const volat  = pool.volatility7d  || 10;

  // TVL: log10 scaling. $500k = 0, $1B = 30 pts
  const tvlScore  = tvl > 0 ? Math.max(0, Math.min(30, (Math.log10(tvl) - 5.7) * 9)) : 0;
  // APR: max 200% → 25 pts
  const aprScore  = Math.min(25, (Math.min(apr, 200) / 200) * 25);
  // Volume 24h: log10. $100k = 0, $100M = 20 pts
  const volScore  = vol24h > 0 ? Math.max(0, Math.min(20, (Math.log10(vol24h) - 5) * 5)) : 0;
  // Consistência: 0-1 → 15 pts
  const consScore = Math.min(15, cons * 15);
  // Estabilidade: menos volatilidade = mais pontos (0-10)
  const stabScore = Math.min(10, (1 - Math.min(volat, 100) / 100) * 10);

  return Math.max(0, Math.min(100, Math.round(tvlScore + aprScore + volScore + consScore + stabScore)));
}

// ─── Normalização DeFi Llama → formato padrão ────────────────────────────────

function normalizeLlama(raw, chainId) {
  const net       = CHAIN_INFO[chainId];
  const tvl       = raw.tvlUsd    || 0;
  const volume24h = raw.volumeUsd1d || 0;
  const volume7d  = raw.volumeUsd7d || 0;

  // Fee tier a partir de poolMeta ("0.05%") ou 0.3% default
  const feeTierRaw = FEE_TIER_MAP[raw.poolMeta] || 3000;
  const feeRate    = feeTierRaw / 1_000_000;
  const fees24h    = volume24h * feeRate;
  const fees7d     = volume7d  * feeRate;

  // APR: DeFi Llama já calcula em %. Preferimos apyBase7d (mais estável)
  const apr7d = parseFloat((raw.apyBase7d ?? raw.apyBase ?? 0).toFixed(2));

  // Volatilidade: sigma do DeFi Llama × fator (sigma está em unidade de APY)
  // il7d é o impermanent loss 7d em %
  const volatility7d = parseFloat(
    Math.min(100, Math.max(0, Math.abs(raw.il7d || 0) * 50 + (raw.sigma || 0) * 5)).toFixed(2)
  );

  // Consistência: quanto menor sigma relativo, mais consistente
  const sigmaRel      = raw.mu > 0 ? (raw.sigma || 0) / raw.mu : 1;
  const feeConsistency = parseFloat(Math.max(0, 1 - Math.min(sigmaRel, 1)).toFixed(4));

  // Tokens do símbolo "USDC-WETH"
  const parts = (raw.symbol || '').split('-');
  const t0sym = parts[0] || '?';
  const t1sym = parts.slice(1).join('-') || '?';
  const underlying = raw.underlyingTokens || [];

  const token0 = { id: underlying[0] || null, symbol: t0sym, name: t0sym, decimals: '18' };
  const token1 = { id: underlying[1] || null, symbol: t1sym, name: t1sym, decimals: '18' };

  const pool = {
    id:           raw.pool, // DeFi Llama UUID — único por pool
    chainId,
    networkName:  net.name,
    networkBadge: net.badge,
    networkColor: net.color,
    explorerUrl:  underlying[0]
      ? `${net.explorerUrl}/address/${underlying[0]}`
      : null,
    pairName:     `${t0sym}/${t1sym}`,
    project:      raw.project,
    feeTier:      String(feeTierRaw),
    feeTierRaw,
    feeTierLabel: FEE_LABELS[feeTierRaw] || raw.poolMeta || '0.3%',
    token0,
    token1,
    tvl,
    volume24h:    parseFloat(volume24h.toFixed(2)),
    volume7d:     parseFloat(volume7d.toFixed(2)),
    fees24h:      parseFloat(fees24h.toFixed(2)),
    fees7d:       parseFloat(fees7d.toFixed(2)),
    apr7d,
    volatility7d,
    annualizedVol: parseFloat((volatility7d * Math.sqrt(52)).toFixed(2)),
    feeConsistency,
    dayCount:     Math.round(raw.count / 24) || 7, // count é em horas no DeFi Llama
    ilRisk:       raw.ilRisk || 'yes',
    stablecoin:   raw.stablecoin || false,
    dataSource:   'real',
    poolDayData:  [],
  };

  const score      = calculateScore(pool);
  pool.score       = score;
  pool.label       = score >= 70 ? 'Excelente' : score >= 50 ? 'Bom' : 'Regular';
  pool.riskLevel   = volatility7d > 30 ? 'ALTO' : volatility7d > 15 ? 'MÉDIO' : 'BAIXO';
  pool.breakdown   = {
    volume:      Math.round(Math.max(0, Math.min(20, (Math.log10(Math.max(volume24h, 1)) - 5) * 5))),
    apr:         Math.round(Math.min(25, (Math.min(apr7d, 200) / 200) * 25)),
    stability:   Math.round(Math.min(10, (1 - Math.min(volatility7d, 100) / 100) * 10)),
    tvl:         Math.round(Math.max(0, Math.min(30, (Math.log10(Math.max(tvl, 1)) - 5.7) * 9))),
    consistency: Math.round(feeConsistency * 15),
    alignment:   5,
  };

  return pool;
}

// ─── The Graph (opcional, quando GRAPH_API_KEY disponível) ───────────────────

const SUBGRAPH_IDS = {
  1:     '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV',
  42161: 'FQ6JYszEKApsBpAmiHesRsd9Ygc6mzmpNRANeVQFYoVX',
  10:    'Cghf4LfVqPiFw6fp6Y5X5Ubc8UpmUhSfJL82kvsenAH',
  137:   '3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCDqsU',
  8453:  '43Hwfi3dJSoGpyas9VwNoDAv55yjgGrPpNSmbQZArzMG',
  56:    'A1fvJJzWpd2hfdASBjZDqwgSFMNMQKG9D3b5ZSG9dZzp',
};

const GRAPH_QUERY = `
  query TopPools($first: Int!, $minTvl: String!) {
    pools(first:$first, orderBy:totalValueLockedUSD, orderDirection:desc,
          where:{totalValueLockedUSD_gt:$minTvl, liquidity_gt:"0"}) {
      id feeTier liquidity sqrtPrice totalValueLockedUSD
      token0 { id symbol name decimals }
      token1 { id symbol name decimals }
      poolDayData(first:7, orderBy:date, orderDirection:desc) {
        date volumeUSD feesUSD tvlUSD
      }
    }
  }
`;

function mean(arr) { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length);
}

function normalizeGraph(raw, chainId) {
  const net    = CHAIN_INFO[chainId];
  const tvl    = parseFloat(raw.totalValueLockedUSD) || 0;
  const days   = (raw.poolDayData || []).map(d=>({
    volumeUSD: parseFloat(d.volumeUSD)||0,
    feesUSD:   parseFloat(d.feesUSD)||0,
  }));
  const vol7d   = days.reduce((s,d)=>s+d.volumeUSD,0);
  const fees7d  = days.reduce((s,d)=>s+d.feesUSD,0);
  const vol24h  = days[0]?.volumeUSD ?? vol7d/7;
  const fees24h = days[0]?.feesUSD   ?? fees7d/7;
  const apr7d   = tvl>0 ? (fees7d/tvl)*(365/7)*100 : 0;

  const vols = days.map(d=>d.volumeUSD).filter(v=>v>0);
  const volAvg = mean(vols);
  const volatility7d = volAvg>0 ? parseFloat(((stdDev(vols)/volAvg)*100).toFixed(2)) : 10;

  const feeArr = days.map(d=>d.feesUSD).filter(f=>f>0);
  const feeConsistency = feeArr.length>1
    ? Math.max(0, 1-stdDev(feeArr)/(mean(feeArr)+1)) : 0.5;

  const feeTierRaw  = parseInt(raw.feeTier);
  const pool = {
    id: raw.id, chainId,
    networkName: net.name, networkBadge: net.badge, networkColor: net.color,
    explorerUrl: `${net.explorerUrl}/address/${raw.id}`,
    pairName:    `${raw.token0?.symbol}/${raw.token1?.symbol}`,
    feeTier:     raw.feeTier, feeTierRaw,
    feeTierLabel: FEE_LABELS[feeTierRaw]||`${feeTierRaw/10000}%`,
    token0: raw.token0, token1: raw.token1,
    tvl, volume24h: parseFloat(vol24h.toFixed(2)), volume7d: parseFloat(vol7d.toFixed(2)),
    fees24h: parseFloat(fees24h.toFixed(2)), fees7d: parseFloat(fees7d.toFixed(2)),
    apr7d: parseFloat(apr7d.toFixed(2)), volatility7d,
    annualizedVol: parseFloat((volatility7d*Math.sqrt(52)).toFixed(2)),
    feeConsistency: parseFloat(feeConsistency.toFixed(4)),
    dayCount: days.length, dataSource: 'real', poolDayData: days,
  };
  const score = calculateScore(pool);
  pool.score = score;
  pool.label = score>=70?'Excelente':score>=50?'Bom':'Regular';
  pool.riskLevel = volatility7d>30?'ALTO':volatility7d>15?'MÉDIO':'BAIXO';
  pool.breakdown = {
    volume:      Math.round(Math.max(0,Math.min(20,(Math.log10(Math.max(vol24h,1))-5)*5))),
    apr:         Math.round(Math.min(25,(Math.min(apr7d,200)/200)*25)),
    stability:   Math.round(Math.min(10,(1-Math.min(volatility7d,100)/100)*10)),
    tvl:         Math.round(Math.max(0,Math.min(30,(Math.log10(Math.max(tvl,1))-5.7)*9))),
    consistency: Math.round(feeConsistency*15),
    alignment:   5,
  };
  return pool;
}

async function fetchFromGraph(chainId, limit) {
  if (!GRAPH_API_KEY || !SUBGRAPH_IDS[chainId]) return null;
  const url = `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/${SUBGRAPH_IDS[chainId]}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: GRAPH_QUERY, variables: { first: limit*3, minTvl: '500000' } }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Graph HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return (json.data?.pools || [])
    .map(p => normalizeGraph(p, chainId))
    .filter(p => p.tvl > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Pools reais de uma chain específica.
 */
async function getPoolsByChain(chainId, limit = 20) {
  const net = CHAIN_INFO[chainId];
  if (!net) {
    return { pools: [], dataSource: 'error', chainId, networkName: 'Unknown', error: `Chain ${chainId} não suportada` };
  }

  // Tenta The Graph primeiro se API key disponível
  if (GRAPH_API_KEY) {
    try {
      const pools = await fetchFromGraph(chainId, limit);
      if (pools?.length) {
        console.log(`[Graph] ✓ ${net.name}: ${pools.length} pools`);
        return { pools, dataSource: 'real', source: 'thegraph', chainId, networkName: net.name };
      }
    } catch (err) {
      console.warn(`[Graph] ${net.name} falhou: ${err.message} — usando DeFi Llama`);
    }
  }

  // DeFi Llama como fonte primária (sem key)
  try {
    const allData  = await fetchLlamaData();
    const projects = PROJECTS_BY_CHAIN[chainId] || ['uniswap-v3'];
    const llamaChain = net.llamaName;

    const minTvl = chainId === 10 ? 100_000 : 500_000; // Optimism has fewer large pools on DeFi Llama
    const filtered = allData.filter(p =>
      projects.includes(p.project) &&
      p.chain === llamaChain &&
      (p.tvlUsd || 0) >= minTvl &&
      !p.outlier
    );

    if (!filtered.length) throw new Error(`Sem pools em ${net.name} (DeFi Llama)`);

    const pools = filtered
      .map(p => normalizeLlama(p, chainId))
      .filter(p => p.tvl > 0 && p.volume24h >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log(`[Llama] ✓ ${net.name}: ${pools.length} pools (de ${filtered.length} elegíveis)`);
    return { pools, dataSource: 'real', source: 'defillama', chainId, networkName: net.name };
  } catch (err) {
    console.error(`[Llama] ✗ ${net.name}: ${err.message}`);
    return { pools: [], dataSource: 'error', chainId, networkName: net.name, error: err.message };
  }
}

/**
 * Top 20 global — combina todas as chains, falhas não bloqueiam outras.
 */
async function getTop20Global(chainIds = [1, 42161, 10, 137, 8453, 56], limitPerChain = 30) {
  // Uma única chamada ao DeFi Llama (cacheada) serve todas as chains
  const allData = await fetchLlamaData().catch(() => null);

  const results = await Promise.allSettled(
    chainIds.map(cid => getPoolsByChain(cid, limitPerChain))
  );

  const allPools = [];
  const sources  = {};

  for (let i = 0; i < results.length; i++) {
    const chainId = chainIds[i];
    const net     = CHAIN_INFO[chainId];
    if (results[i].status === 'fulfilled') {
      const { pools, dataSource, error } = results[i].value;
      allPools.push(...pools);
      sources[net?.name || chainId] = { dataSource, count: pools.length, error };
    } else {
      sources[net?.name || chainId] = { dataSource: 'error', count: 0, error: results[i].reason?.message };
    }
  }

  const top20 = allPools.sort((a, b) => b.score - a.score).slice(0, 20);
  const hasSomeReal = top20.some(p => p.dataSource === 'real');

  return {
    pools:      top20,
    total:      allPools.length,
    dataSource: hasSomeReal ? 'real' : 'error',
    sources,
    fetchedAt:  new Date().toISOString(),
  };
}

// Compatibilidade com imports antigos
async function fetchTopPools(chainId = 8453, limit = 20) {
  return getPoolsByChain(chainId, limit);
}

async function fetchPoolById(poolId, chainId = 8453) {
  try {
    const { pools } = await getPoolsByChain(chainId, 50);
    const found = pools.find(p => p.id === poolId || p.id?.toLowerCase() === poolId?.toLowerCase());
    return { pool: found || pools[0] || null, dataSource: found ? 'real' : 'error' };
  } catch (err) {
    return { pool: null, dataSource: 'error', error: err.message };
  }
}

module.exports = {
  getPoolsByChain,
  getTop20Global,
  calculateScore,
  normalizeLlama,
  fetchTopPools,
  fetchPoolById,
};
