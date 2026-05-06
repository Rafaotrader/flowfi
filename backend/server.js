require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Agregador multichain real
let fetchTopPools, fetchPoolById, getTop20Global, getPoolsByChain;
try {
  const sg = require('./src/services/uniswapSubgraph');
  fetchTopPools  = sg.fetchTopPools;
  fetchPoolById  = sg.fetchPoolById;
  getTop20Global = sg.getTop20Global;
  getPoolsByChain = sg.getPoolsByChain;
} catch (e) {
  console.warn('[Aggregator] Serviço indisponível:', e.message);
}

const app = express();
const PORT             = parseInt(process.env.PORT) || 5001;
const FRONTEND_URL     = process.env.FRONTEND_URL || 'http://localhost:5173';
const DEFAULT_CHAIN_ID = parseInt(process.env.DEFAULT_CHAIN_ID) || 8453;

// ─── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:6000',
];

// Accept Vercel preview and production deployments automatically
const VERCEL_ORIGIN = /^https:\/\/[\w-]+(\.vercel\.app)$/;

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    if (VERCEL_ORIGIN.test(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado para origem: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ─── Mock data (Ethereum) ─────────────────────────────────────────────────────

const MOCK_POOLS = [
  {
    id: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
    feeTier: '500', feeTierLabel: '0.05%',
    token0: { symbol: 'USDC', name: 'USD Coin' },
    token1: { symbol: 'WETH', name: 'Wrapped Ether' },
    tvl: 185_000_000, volume24h: 52_000_000, fees24h: 26_000,
    apr7d: 51.2, volatility7d: 2.1, annualizedVol: 38.4,
    feeConsistency: 0.91, dayCount: 14,
    score: 88, label: 'Excelente', riskLevel: 'BAIXO',
    breakdown: { volume: 20, apr: 22, stability: 18, tvl: 15, consistency: 9, alignment: 10 },
    currentPrice: 3486.2,
  },
  {
    id: '0xcbcdf9626bc03e24f779434178a73a0b4bad62ed',
    feeTier: '3000', feeTierLabel: '0.3%',
    token0: { symbol: 'WBTC', name: 'Wrapped Bitcoin' },
    token1: { symbol: 'WETH', name: 'Wrapped Ether' },
    tvl: 94_000_000, volume24h: 18_000_000, fees24h: 54_000,
    apr7d: 38.7, volatility7d: 3.8, annualizedVol: 52.1,
    feeConsistency: 0.84, dayCount: 30,
    score: 79, label: 'Bom', riskLevel: 'MÉDIO',
    breakdown: { volume: 18, apr: 20, stability: 14, tvl: 14, consistency: 8, alignment: 9 },
    currentPrice: 0.0634,
  },
  {
    id: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8',
    feeTier: '3000', feeTierLabel: '0.3%',
    token0: { symbol: 'USDC', name: 'USD Coin' },
    token1: { symbol: 'WETH', name: 'Wrapped Ether' },
    tvl: 126_000_000, volume24h: 34_000_000, fees24h: 102_000,
    apr7d: 29.5, volatility7d: 2.4, annualizedVol: 41.2,
    feeConsistency: 0.88, dayCount: 30,
    score: 75, label: 'Bom', riskLevel: 'BAIXO',
    breakdown: { volume: 19, apr: 18, stability: 17, tvl: 15, consistency: 9, alignment: 7 },
    currentPrice: 3486.2,
  },
  {
    id: '0x4e68ccd3e89f51c3074ca5072bbac773960dfa36',
    feeTier: '3000', feeTierLabel: '0.3%',
    token0: { symbol: 'WETH', name: 'Wrapped Ether' },
    token1: { symbol: 'USDT', name: 'Tether USD' },
    tvl: 68_000_000, volume24h: 22_000_000, fees24h: 66_000,
    apr7d: 35.4, volatility7d: 3.1, annualizedVol: 44.8,
    feeConsistency: 0.79, dayCount: 21,
    score: 71, label: 'Bom', riskLevel: 'MÉDIO',
    breakdown: { volume: 18, apr: 19, stability: 15, tvl: 13, consistency: 7, alignment: 8 },
    currentPrice: 3487.1,
  },
  {
    id: '0x99ac8ca7087fa4a2a1fb6357269965a2014abc35',
    feeTier: '500', feeTierLabel: '0.05%',
    token0: { symbol: 'WBTC', name: 'Wrapped Bitcoin' },
    token1: { symbol: 'USDC', name: 'USD Coin' },
    tvl: 42_000_000, volume24h: 9_800_000, fees24h: 4_900,
    apr7d: 42.6, volatility7d: 4.2, annualizedVol: 61.5,
    feeConsistency: 0.72, dayCount: 14,
    score: 66, label: 'Bom', riskLevel: 'MÉDIO',
    breakdown: { volume: 16, apr: 21, stability: 12, tvl: 11, consistency: 7, alignment: 8 },
    currentPrice: 95_230.4,
  },
  {
    id: '0x7858e59e0c01ea06df3af3d20ac7b0003275d4bf',
    feeTier: '500', feeTierLabel: '0.05%',
    token0: { symbol: 'USDC', name: 'USD Coin' },
    token1: { symbol: 'USDT', name: 'Tether USD' },
    tvl: 31_000_000, volume24h: 14_500_000, fees24h: 7_250,
    apr7d: 8.5, volatility7d: 0.04, annualizedVol: 0.7,
    feeConsistency: 0.97, dayCount: 30,
    score: 61, label: 'Bom', riskLevel: 'BAIXO',
    breakdown: { volume: 17, apr: 10, stability: 20, tvl: 10, consistency: 10, alignment: 10 },
    currentPrice: 1.0002,
  },
];

// ─── Raiz e health ────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    message: `FlowFi API online na porta ${PORT}`,
    version: '1.0.0',
    docs: `http://localhost:${PORT}/api/health`,
    endpoints: [
      'GET  /api/health',
      'GET  /api/pools',
      'GET  /api/pools/top?chainId=8453',
      'POST /api/calculate',
      'POST /api/harvest-preview',
    ],
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'FlowFi',
    port: PORT,
    timestamp: new Date().toISOString(),
    services: { api: 'online', mock: 'ativo' },
  });
});

// ─── Pools ────────────────────────────────────────────────────────────────────

app.get('/api/pools', async (req, res) => {
  const limit   = Math.min(parseInt(req.query.limit) || 20, 100);
  const chainId = parseInt(req.query.chainId) || DEFAULT_CHAIN_ID;
  if (getPoolsByChain) {
    try {
      const result = await getPoolsByChain(chainId, limit);
      return res.json({ ...result, total: result.pools.length });
    } catch (err) {
      console.warn('[/api/pools] real data failed, using static fallback:', err.message);
    }
  }
  res.json({ pools: MOCK_POOLS.slice(0, limit), total: MOCK_POOLS.length, dataSource: 'static', source: 'static' });
});

app.get('/api/pools/top', async (req, res) => {
  const chainId = parseInt(req.query.chainId) || DEFAULT_CHAIN_ID;
  if (!getPoolsByChain) {
    return res.status(503).json({ error: 'Agregador indisponível', pools: [] });
  }
  try {
    const result = await getPoolsByChain(chainId, 20);
    res.json({ ...result, total: result.pools.length });
  } catch (err) {
    console.error('[/api/pools/top]', err.message);
    res.status(500).json({ error: err.message, pools: [] });
  }
});

// Top 20 global — combina todas as redes
app.get('/api/pools/global', async (req, res) => {
  if (!getTop20Global) {
    return res.status(503).json({ error: 'Agregador indisponível', pools: [] });
  }
  const rawChains = req.query.chains;
  const chainIds  = rawChains
    ? rawChains.split(',').map(Number).filter(Boolean)
    : [1, 42161, 10, 137, 8453, 56];
  try {
    const result = await getTop20Global(chainIds, 30);
    res.json(result);
  } catch (err) {
    console.error('[/api/pools/global]', err.message);
    res.status(500).json({ error: err.message, pools: [] });
  }
});

app.get('/api/pools/categories', async (req, res) => {
  if (getTop20Global) {
    try {
      const { pools } = await getTop20Global([1, 42161, 10, 137, 8453, 56], 30);
      return res.json({
        conservador: pools.filter(p => p.riskLevel === 'BAIXO'),
        moderado:    pools.filter(p => p.riskLevel === 'MÉDIO'),
        agressivo:   pools.filter(p => p.riskLevel === 'ALTO'),
        topOverall:  pools.slice(0, 5),
      });
    } catch {}
  }
  res.json({ conservador: [], moderado: [], agressivo: [], topOverall: MOCK_POOLS.slice(0, 5) });
});

app.get('/api/pools/opportunity', async (req, res) => {
  if (getTop20Global) {
    try {
      const { pools } = await getTop20Global([8453, 42161, 1], 5);
      return res.json({ pool: pools[0] || null });
    } catch {}
  }
  res.json({ pool: MOCK_POOLS[0] });
});

app.get('/api/pools/trending', async (req, res) => {
  if (getTop20Global) {
    try {
      const { pools } = await getTop20Global([1, 42161, 8453], 20);
      const trending = [...pools].sort((a, b) => b.volume24h - a.volume24h).slice(0, 5)
        .map(p => ({ ...p, volumeSurge: parseFloat((p.volume24h / Math.max(p.volume7d / 7, 1)).toFixed(2)) }));
      return res.json({ pools: trending });
    } catch {}
  }
  res.json({ pools: MOCK_POOLS.slice(0, 3) });
});

app.get('/api/pools/stable', (req, res) => {
  res.json({ pools: MOCK_POOLS.filter((p) => p.riskLevel === 'BAIXO') });
});

app.get('/api/pools/gas', (req, res) => {
  res.json({
    slow: 12, standard: 18, fast: 28, instant: 40,
    level: 'cheap',
    recommendation: 'Gas baixo (18 Gwei) — ótimo momento para transações!',
    isGoodTime: true,
    source: 'mock',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/pools/:id', async (req, res) => {
  const chainId = parseInt(req.query.chainId) || DEFAULT_CHAIN_ID;
  try {
    if (fetchPoolById) {
      const { pool, dataSource } = await fetchPoolById(req.params.id, chainId);
      return res.json({ ...pool, dataSource });
    }
  } catch (err) {
    console.warn('[/api/pools/:id] Subgraph falhou:', err.message);
  }
  const pool = MOCK_POOLS.find((p) => p.id === req.params.id.toLowerCase());
  if (!pool) return res.status(404).json({ error: 'Pool não encontrado' });
  res.json({ ...pool, dataSource: 'mock' });
});

// ─── Simulador ────────────────────────────────────────────────────────────────

app.post('/api/simulate', (req, res) => {
  const { capitalUSD = 10000, poolId, profile = 'moderado', daysToSimulate = 30, poolData } = req.body;
  // Use real pool data from frontend if provided; otherwise look up in static list
  const pool = (poolData?.tvl && poolData?.volume24h !== undefined)
    ? poolData
    : (MOCK_POOLS.find((p) => p.id === poolId) || MOCK_POOLS[0]);

  const profileConfig  = { conservador: 0.20, moderado: 0.10, agressivo: 0.04 };
  const rangePct       = profileConfig[profile] || 0.10;
  const concentration  = 1 / (1 - Math.sqrt((1 - rangePct) / (1 + rangePct)));
  const feeTierNum     = parseInt(pool.feeTierRaw || pool.feeTier) || 3000;
  const feeRate        = feeTierNum / 1_000_000;
  const tvl            = parseFloat(pool.tvl) || 1_000_000;
  const volume24h      = parseFloat(pool.volume24h) || 0;
  const liquidityShare = capitalUSD / Math.max(tvl, capitalUSD);
  const grossFeeDay    = volume24h * feeRate * liquidityShare * concentration;

  const scenarios = {
    pior:     buildMockScenario(grossFeeDay * 0.4, 0.35, capitalUSD, daysToSimulate, 'Pior caso'),
    esperado: buildMockScenario(grossFeeDay,       0.72, capitalUSD, daysToSimulate, 'Caso esperado'),
    melhor:   buildMockScenario(grossFeeDay * 1.6, 0.92, capitalUSD, daysToSimulate, 'Melhor caso'),
  };
  const gasPriceGwei = pool.chainId === 8453 ? 0.05 : 18;
  const ethPriceUSD  = 3500;
  const gasEntry     = gasPriceGwei * 280_000 * 1e-9 * ethPriceUSD;

  const currentPrice = pool.currentPrice || null;
  res.json({
    input: { capitalUSD, profile, daysToSimulate, poolId: pool.id },
    priceRange: currentPrice ? {
      lower: parseFloat((currentPrice * (1 - rangePct)).toFixed(6)),
      upper: parseFloat((currentPrice * (1 + rangePct)).toFixed(6)),
      current: currentPrice,
      label: `±${rangePct * 100}%`,
      rangePctTotal: rangePct * 2 * 100,
    } : {
      lower: null, upper: null, current: null,
      label: `±${rangePct * 100}%`,
      rangePctTotal: rangePct * 2 * 100,
    },
    concentrationMultiplier: parseFloat(concentration.toFixed(2)),
    inRangeProbability: profile === 'conservador' ? 78.4 : profile === 'moderado' ? 61.2 : 38.7,
    scenarios,
    gasCost: {
      addLiquidity:    parseFloat(gasEntry.toFixed(4)),
      collect:         parseFloat((gasPriceGwei * 150_000 * 1e-9 * ethPriceUSD).toFixed(4)),
      removeLiquidity: parseFloat((gasPriceGwei * 210_000 * 1e-9 * ethPriceUSD).toFixed(4)),
      rebalance:       parseFloat((gasPriceGwei * 490_000 * 1e-9 * ethPriceUSD).toFixed(4)),
      gasPriceGwei, ethPriceUSD,
    },
    breakEvenDays: parseFloat((gasEntry / scenarios.esperado.feesPerDay).toFixed(1)),
    isViable: scenarios.esperado.feesPerDay > 0 && gasEntry < scenarios.esperado.netFeesUSD,
    warnings: [],
    disclaimer: 'Estimativas baseadas em dados históricos. Não constituem garantia de rendimento.',
    source: 'mock',
  });
});

app.post('/api/simulator/simulate', (req, res) => {
  req.url = '/api/simulate';
  app.handle(req, res);
});

// ─── Calculadora de estratégia ────────────────────────────────────────────────

function erf(x) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign * y;
}
function normalCDF(x) { return 0.5 * (1 + erf(x / Math.sqrt(2))); }

app.post('/api/calculate', async (req, res) => {
  const { poolId, amountUsd = 1000, profile = 'balanced', chainId: reqChainId = DEFAULT_CHAIN_ID } = req.body;
  const chainId = parseInt(reqChainId) || DEFAULT_CHAIN_ID;

  let pool = null;
  try {
    if (fetchPoolById) {
      const result = await fetchPoolById(poolId, chainId);
      pool = result.pool;
    }
  } catch {}
  if (!pool) pool = MOCK_POOLS.find(p => p.id === (poolId || '').toLowerCase()) || MOCK_POOLS[0];

  const profiles = {
    conservative: { rangePct: 0.20, label: 'Conservador' },
    balanced:     { rangePct: 0.10, label: 'Equilibrado'  },
    aggressive:   { rangePct: 0.04, label: 'Agressivo'    },
  };
  const cfg      = profiles[profile] || profiles.balanced;
  const rangePct = cfg.rangePct;
  const capital  = parseFloat(amountUsd) || 1000;

  const concentration  = 1 / (1 - Math.sqrt((1 - rangePct) / (1 + rangePct)));
  const feeTierRaw     = parseInt(pool.feeTier || pool.feeTierRaw) || 3000;
  const feeRate        = feeTierRaw / 1_000_000;
  const tvl            = pool.tvl || 1_000_000;
  const volume24h      = pool.volume24h || 0;
  const liquidityShare = capital / Math.max(tvl, capital);

  const estimatedDailyFees   = volume24h * feeRate * liquidityShare * concentration;
  const estimatedMonthlyFees = estimatedDailyFees * 30;
  const estimatedApr         = capital > 0 ? (estimatedMonthlyFees * 12 / capital) * 100 : 0;
  const { fee: platformFeePreview, pct: platformFeePct } = calcPlatformFee(estimatedMonthlyFees);

  const vol7d    = pool.volatility7d || 10;
  const monthVol = ((vol7d / 100) / Math.sqrt(7)) * Math.sqrt(30);
  const zScore   = rangePct / Math.max(monthVol, 0.001);
  const inRangeP = Math.max(0.01, Math.min(0.99, 2 * normalCDF(zScore) - 1));
  const outOfRangeProbability = parseFloat(((1 - inRangeP) * 100).toFixed(1));

  const impermanentLossRisk = rangePct <= 0.05 ? 'ALTO' : rangePct <= 0.15 ? 'MÉDIO' : 'BAIXO';
  const currentPrice = pool.currentPrice || null;
  const minPrice = currentPrice != null ? parseFloat((currentPrice * (1 - rangePct)).toFixed(6)) : null;
  const maxPrice = currentPrice != null ? parseFloat((currentPrice * (1 + rangePct)).toFixed(6)) : null;
  const gasEstimateUsd = parseFloat((18 * 280_000 * 1e-9 * 3500).toFixed(2));

  function buildScenario(volMult, inRangeF) {
    const fees = volume24h * volMult * feeRate * liquidityShare * concentration * inRangeF * 30;
    return {
      monthlyFees: parseFloat(fees.toFixed(4)),
      apr:         parseFloat((fees * 12 / capital * 100).toFixed(2)),
    };
  }

  const warnings = [];
  if (tvl < 1_000_000)     warnings.push('TVL abaixo de $1M — risco de slippage elevado.');
  if (volume24h < 100_000) warnings.push('Volume baixo — fees estimadas podem ser menores.');
  if (vol7d > 30)          warnings.push('Alta volatilidade — maior probabilidade de sair do range.');
  if (gasEstimateUsd > estimatedDailyFees * 7) warnings.push('Gas alto em relação às fees — aguarde condições favoráveis.');

  res.json({
    pool:     { id: pool.id, pair: `${pool.token0?.symbol}/${pool.token1?.symbol}`, feeTierLabel: pool.feeTierLabel },
    amountUsd: capital,
    profile:   cfg.label,
    recommendedRangePercent: rangePct * 100,
    minPrice, currentPrice, maxPrice,
    estimatedDailyFees:   parseFloat(estimatedDailyFees.toFixed(4)),
    estimatedMonthlyFees: parseFloat(estimatedMonthlyFees.toFixed(4)),
    estimatedApr:         parseFloat(estimatedApr.toFixed(2)),
    impermanentLossRisk,
    outOfRangeProbability,
    gasEstimateUsd,
    platformFeePreview: parseFloat(platformFeePreview.toFixed(4)),
    platformFeePct,
    bestCase:     buildScenario(1.5, 0.90),
    expectedCase: buildScenario(1.0, inRangeP),
    worstCase:    buildScenario(0.3, 0.40),
    warnings,
    disclaimer: 'Estimativa educacional. Resultados não garantidos.',
  });
});

// ─── Harvest preview ─────────────────────────────────────────────────────────

app.post('/api/harvest-preview', (req, res) => {
  if (req.body.profitAmount !== undefined) {
    const profit = parseFloat(req.body.profitAmount) || 120;
    const gas    = parseFloat(req.body.gasEstimate)   || 8;
    const { fee: platformFee, pct: platformFeePct } = calcPlatformFee(profit);
    const userReceives = parseFloat((profit - platformFee).toFixed(2));
    const isGasProfitable = gas < userReceives;

    return res.json({
      canHarvest: true,
      input: { amount0: profit, amount1: 0, token0Symbol: 'USD', token1Symbol: '' },
      platformFeePct, platformFeePercent: platformFeePct,
      split: { userAmount0: userReceives, userAmount1: 0, platformFee0: platformFee, platformFee1: 0 },
      usd: { feesTotal: profit, platformFee, userReceives },
      gasCost: { estimatedUSD: gas, gasPriceGwei: 18, gasUnits: 150_000, isGasProfitable },
      profitabilityWarning: isGasProfitable ? null : {
        severity: 'high',
        message: `Gas ($${gas.toFixed(2)}) maior que receita líquida ($${userReceives.toFixed(2)}). Aguarde mais fees acumularem.`,
      },
      disclaimer: `Taxa de ${platformFeePct}% cobrada sobre os fees gerados, nunca sobre o capital investido.`,
      source: 'mock',
    });
  }

  const {
    amount0Raw = 150, amount1Raw = 0.04,
    token0Symbol = 'USDC', token1Symbol = 'WETH',
    token0PriceUSD = 1, token1PriceUSD = 3486,
    gasPriceGwei = 18, ethPriceUSD = 3500,
  } = req.body;

  const a0 = parseFloat(amount0Raw);
  const a1 = parseFloat(amount1Raw);
  const feesUSDTotal    = a0 * parseFloat(token0PriceUSD) + a1 * parseFloat(token1PriceUSD);
  const { fee: platformFeeUSD, rate: feeRate, pct: platformFeePct } = calcPlatformFee(feesUSDTotal);
  const platformFee0    = a0 * feeRate;
  const platformFee1    = a1 * feeRate;
  const userReceivesUSD = feesUSDTotal - platformFeeUSD;
  const gasCostUSD      = 150_000 * parseFloat(gasPriceGwei) * 1e-9 * parseFloat(ethPriceUSD);
  const isGasProfitable = gasCostUSD < userReceivesUSD;

  res.json({
    canHarvest: true,
    input: { amount0: a0, amount1: a1, token0Symbol, token1Symbol },
    platformFeePct, platformFeePercent: platformFeePct,
    split: {
      userAmount0: parseFloat((a0 - platformFee0).toFixed(8)),
      userAmount1: parseFloat((a1 - platformFee1).toFixed(8)),
      platformFee0: parseFloat(platformFee0.toFixed(8)),
      platformFee1: parseFloat(platformFee1.toFixed(8)),
    },
    usd: {
      feesTotal: parseFloat(feesUSDTotal.toFixed(2)),
      platformFee: parseFloat(platformFeeUSD.toFixed(2)),
      userReceives: parseFloat(userReceivesUSD.toFixed(2)),
    },
    gasCost: { estimatedUSD: parseFloat(gasCostUSD.toFixed(2)), gasPriceGwei, gasUnits: 150_000, isGasProfitable },
    profitabilityWarning: isGasProfitable ? null : {
      severity: 'high',
      message: `Gas ($${gasCostUSD.toFixed(2)}) maior que receita líquida ($${userReceivesUSD.toFixed(2)}). Aguarde mais fees acumularem.`,
    },
    disclaimer: `Taxa de ${platformFeePct}% cobrada sobre os fees gerados, nunca sobre o capital investido.`,
    source: 'mock',
  });
});

// ─── Harvest preview (tokenId-based) ─────────────────────────────────────────

app.post('/api/harvest/preview', (req, res) => {
  const { tokenId, amount0 = 0, amount1 = 0, token0Symbol = '—', token1Symbol = '—', feesUSD } = req.body;
  if (!tokenId) return res.status(400).json({ error: 'tokenId é obrigatório' });

  const reqChainId = parseInt(req.body.chainId) || DEFAULT_CHAIN_ID;
  const a0 = Math.max(0, parseFloat(amount0) || 0);
  const a1 = Math.max(0, parseFloat(amount1) || 0);

  // Use feesUSD for the tiered threshold if provided; otherwise fall back to token sum
  const valueForThreshold = feesUSD != null ? parseFloat(feesUSD) : (a0 + a1);
  const { rate, pct: platformFeePct } = calcPlatformFee(valueForThreshold);
  const pFee0 = parseFloat((a0 * rate).toFixed(8));
  const pFee1 = parseFloat((a1 * rate).toFixed(8));
  const gas = calcGasUSD(150_000, reqChainId);

  res.json({
    tokenId: tokenId.toString(),
    canHarvest: a0 > 0 || a1 > 0,
    input:  { amount0: a0, amount1: a1, token0Symbol, token1Symbol },
    platformFeePct,
    platformFeePercent: platformFeePct,
    split: {
      userAmount0:  parseFloat((a0 - pFee0).toFixed(8)),
      userAmount1:  parseFloat((a1 - pFee1).toFixed(8)),
      platformFee0: pFee0,
      platformFee1: pFee1,
    },
    gasCost: { estimatedUSD: gas.cost, gasPriceGwei: gas.gasPriceGwei, gasUnits: 150_000 },
    contractAddress: process.env.HARVESTER_CONTRACT_ADDRESS || null,
    disclaimer: `Taxa de ${platformFeePct}% sobre fees gerados, nunca sobre o capital.`,
    source: 'mock',
  });
});

// ─── Harvest execute (stub — ativo após deploy em testnet) ────────────────────

app.post('/api/harvest/execute', (req, res) => {
  const { tokenId } = req.body;
  const contractAddress = process.env.HARVESTER_CONTRACT_ADDRESS;

  if (!contractAddress) {
    return res.status(503).json({
      status: 'pending_deploy',
      tokenId: tokenId?.toString() || null,
      message: 'Contrato PollYieldFlowHarvester não deployado. Execute o saque diretamente via MetaMask quando o contrato estiver disponível.',
    });
  }

  res.status(202).json({
    status: 'ready',
    contractAddress,
    tokenId: tokenId?.toString() || null,
    message: 'Use o frontend com MetaMask para assinar a transação harvestWithFee.',
  });
});

// ─── Swap ─────────────────────────────────────────────────────────────────────

// 0x API v2: endpoint unificado com chainId param e header 0x-version: v2
const ZEROX_V2_BASE = 'https://api.0x.org';

app.get('/api/swap/quote', async (req, res) => {
  const ZEROX_API_KEY    = process.env.ZEROX_API_KEY || '';
  const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_SWAP_FEE_BPS || '50');

  if (!ZEROX_API_KEY) {
    console.warn('[swap/quote] ZEROX_API_KEY não configurada');
    return res.status(503).json({
      error: 'Swap não configurado',
      detail: 'Adicione ZEROX_API_KEY em backend/.env. Obtenha grátis em https://dashboard.0x.org',
    });
  }

  const { chainId = '8453', sellToken, buyToken, sellAmount, takerAddress } = req.query;

  console.log('[swap/quote] REQ:', { chainId, sellToken, buyToken, sellAmount, takerAddress: takerAddress || '(nenhum)' });
  console.log('[swap/quote] SELL AMOUNT WEI:', sellAmount, '| feeBps:', PLATFORM_FEE_BPS);

  if (!sellToken || !buyToken || !sellAmount) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios: sellToken, buyToken, sellAmount' });
  }

  const cid = parseInt(chainId) || 8453;

  // v2: /price para preview (sem taker), /quote para execução (com taker)
  const endpoint = takerAddress ? '/swap/permit2/quote' : '/swap/permit2/price';
  const slippageBps = req.query.slippageBps || '100'; // 1% default
  const params = new URLSearchParams({ chainId: cid, sellToken, buyToken, sellAmount, slippageBps });
  if (takerAddress) params.set('taker', takerAddress);

  const url = `${ZEROX_V2_BASE}${endpoint}?${params}`;
  console.log('[swap/quote] 0x REQUEST:', endpoint, '| chainId:', cid);

  try {
    const r = await fetch(url, {
      headers: { '0x-api-key': ZEROX_API_KEY, '0x-version': 'v2' },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await r.json();

    console.log('[swap/quote] 0x RESPONSE status:', r.status, '| liquidityAvailable:', body.liquidityAvailable);

    if (!r.ok) {
      const errMsg = body.message
        || body.data?.details?.[0]?.reason
        || body.reason
        || `Erro 0x API (${r.status})`;
      console.error('[swap/quote] 0x ERRO:', errMsg, '| body:', JSON.stringify(body).slice(0, 300));
      return res.status(r.status < 500 ? 400 : 502).json({ error: errMsg });
    }

    if (body.liquidityAvailable === false) {
      return res.status(400).json({ error: 'Liquidez insuficiente para este par nesta rede' });
    }

    console.log('[swap/quote] 0x OK | buyAmount:', body.buyAmount, '| minBuyAmount:', body.minBuyAmount, '| gas:', body.gas || body.transaction?.gas);

    // Fee breakdown via BigInt puro (sem perda de precisão)
    const grossBuyAmt  = BigInt(body.buyAmount || '0');
    const feeAmt       = grossBuyAmt * BigInt(PLATFORM_FEE_BPS) / 10000n;
    const netBuyAmt    = grossBuyAmt - feeAmt;
    const zeroExFeeAmt = BigInt(body.fees?.zeroExFee?.amount || '0');

    console.log('[swap/quote] FEE CALC | gross:', grossBuyAmt.toString(), '| fee:', feeAmt.toString(), '| net:', netBuyAmt.toString(), '| 0xFee:', zeroExFeeAmt.toString());

    // Fontes de rota (fills → formato compatível com frontend)
    const sources = body.route?.fills?.map(f => ({
      name: f.source,
      proportion: String(parseInt(f.proportionBps || '0') / 100),
    })) || [];

    res.json({
      // Tx fields — v2 aninha em `transaction` (null para preview sem taker)
      to:              body.transaction?.to   || null,
      data:            body.transaction?.data || null,
      value:           body.transaction?.value || '0',
      gas:             body.transaction?.gas  || body.gas || null,
      allowanceTarget: body.allowanceTarget   || '0x000000000022d473030f116ddee9f6b43ac78ba3',
      // Permit2 EIP-712 para ERC20 sells (null = ETH sell, não precisa)
      permit2:         body.permit2 || null,
      // Quote amounts
      sellAmount:      body.sellAmount,
      buyAmount:       body.buyAmount,
      minBuyAmount:    body.minBuyAmount || null,
      grossBuyAmount:  grossBuyAmt.toString(),
      platformFeeEstimated:  feeAmt.toString(),
      netBuyAmountEstimated: netBuyAmt.toString(),
      zeroExFeeEstimated:    zeroExFeeAmt.toString(),
      // Gas fields para MetaMask (todos do objeto transaction da 0x — sem alterar)
      gasPrice:             body.transaction?.gasPrice         || null,
      maxFeePerGas:         body.transaction?.maxFeePerGas     || null,
      maxPriorityFeePerGas: body.transaction?.maxPriorityFeePerGas || null,
      // Analytics
      estimatedGas:    body.gas || body.transaction?.gas || null,
      totalNetworkFee: body.totalNetworkFee || null,
      sources,
      // Metadata
      platformFeeBps:     PLATFORM_FEE_BPS,
      platformFeePercent: PLATFORM_FEE_BPS / 100,
      chainId:            cid,
      isPreviewOnly:      !takerAddress,
    });
  } catch (err) {
    console.error('[/api/swap/quote] EXCEPTION:', err.name, err.message);
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.status(502).json({
      error: isTimeout
        ? 'Cotação expirou — tente novamente'
        : `Falha ao buscar cotação: ${err.message}`,
    });
  }
});

// ─── Auth mock ───────────────────────────────────────────────────────────────

app.get('/api/auth/nonce/:walletAddress', (req, res) => {
  const nonce = Math.floor(Math.random() * 1_000_000).toString();
  res.json({ nonce, message: `Assine esta mensagem para autenticar no FlowFi.\nNonce: ${nonce}` });
});

app.post('/api/auth/verify', (req, res) => {
  res.json({ token: 'mock-jwt-token', walletAddress: req.body.walletAddress });
});

// ─── Rotas reais ─────────────────────────────────────────────────────────────

if (process.env.DATABASE_URL) {
  try {
    app.use('/api/pools',     require('./src/routes/pools'));
    app.use('/api/simulator', require('./src/routes/simulator'));
    app.use('/api/positions', require('./src/routes/positions'));
    app.use('/api/harvest',   require('./src/routes/harvest'));
    app.use('/api/alerts',    require('./src/routes/alerts'));
    app.use('/api/admin',     require('./src/routes/admin'));
    console.log('✓ Rotas reais carregadas (DATABASE_URL configurado)');
  } catch (err) {
    console.warn('⚠ Rotas reais indisponíveis, usando mocks:', err.message);
  }
}

// ─── 404 e erro ──────────────────────────────────────────────────────────────

app.use((req, res) => res.status(404).json({ error: 'Endpoint não encontrado' }));

app.use((err, req, res, next) => {
  console.error('[Erro]', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`\n  FlowFi API rodando em http://localhost:${PORT}`);
  console.log(`   Frontend esperado em : ${FRONTEND_URL}`);
  console.log(`   Banco de dados       : ${process.env.DATABASE_URL ? 'configurado' : 'nao configurado (usando mocks)'}`);
  console.log(`   Rede padrão          : Base (chainId ${DEFAULT_CHAIN_ID})`);
  console.log(`   Platform wallet      : ${process.env.PLATFORM_WALLET || 'não configurada'}`);
  console.log(`   Endpoints            : GET /api/health | GET /api/pools/top?chainId=8453 | POST /api/calculate\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ERRO: Porta ${PORT} ja esta em uso!`);
    console.error(`   Para liberar no Windows:`);
    console.error(`     netstat -ano | findstr :${PORT}`);
    console.error(`     taskkill /PID <PID> /F`);
    console.error(`   Ou: PORT=5001 npm run dev\n`);
    process.exit(1);
  } else {
    console.error('Erro ao iniciar servidor:', err.message);
    process.exit(1);
  }
});

module.exports = app;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcGasUSD(gasUnits, chainId) {
  // Base tem gas muito mais barato que Ethereum (~0.05 Gwei vs ~18 Gwei)
  const gasPriceGwei = chainId === 8453 ? 0.05 : 18;
  const ethPriceUSD  = 3500;
  return {
    cost: parseFloat((gasPriceGwei * gasUnits * 1e-9 * ethPriceUSD).toFixed(4)),
    gasPriceGwei,
    ethPriceUSD,
  };
}

function calcPlatformFee(usdValue) {
  const safeVal = (!usdValue || isNaN(usdValue) || usdValue < 0) ? 0 : usdValue;
  const threshold = parseFloat(process.env.HARVEST_FEE_THRESHOLD_USD || '500');
  const lowRate   = parseInt(process.env.HARVEST_FEE_LOW_BPS  || '500')  / 10000; // 0.05 (5%)
  const highRate  = parseInt(process.env.HARVEST_FEE_HIGH_BPS || '1000') / 10000; // 0.10 (10%)
  const rate = safeVal > threshold ? highRate : lowRate;
  const pct  = rate * 100;
  return { fee: parseFloat((safeVal * rate).toFixed(4)), rate, pct };
}

function buildMockScenario(grossFeeDay, inRange, capitalUSD, days, label) {
  const feesPerDay    = grossFeeDay * inRange;
  const feesForPeriod = feesPerDay * days;
  const { fee: platformFeeUSD, pct: platformFeePct } = calcPlatformFee(feesForPeriod);
  const netFeesUSD    = feesForPeriod - platformFeeUSD;
  return {
    label,
    feesPerDay:    parseFloat(feesPerDay.toFixed(4)),
    feesForPeriod: parseFloat(feesForPeriod.toFixed(4)),
    platformFeeUSD: parseFloat(platformFeeUSD.toFixed(4)),
    platformFeePct,
    netFeesUSD:    parseFloat(netFeesUSD.toFixed(4)),
    netProfitUSD:  parseFloat(netFeesUSD.toFixed(4)),
    aprEstimated:  parseFloat(((netFeesUSD / capitalUSD / days) * 365 * 100).toFixed(2)),
    aprGross:      parseFloat(((feesForPeriod / capitalUSD / days) * 365 * 100).toFixed(2)),
    inRangeFraction: parseFloat((inRange * 100).toFixed(1)),
    assumption: label,
  };
}
