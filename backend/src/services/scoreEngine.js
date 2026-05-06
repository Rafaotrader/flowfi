/**
 * Score Engine v2 — score de 0 a 100 para pools de liquidez Uniswap V3.
 *
 * Pesos:
 *  Volume 24h         → 20 pts  (atividade de mercado)
 *  APR estimado 7d    → 25 pts  (retorno)
 *  Estabilidade       → 20 pts  (1/volatilidade — risco de IL)
 *  TVL                → 15 pts  (profundidade e segurança)
 *  Consistência fees  → 10 pts  (previsibilidade de renda)
 *  Alinhamento tier   → 10 pts  (fee tier adequado à volatilidade do par)
 *
 * Penalidades:
 *  -10 pts: pool nova (< 3 dias de dados)
 *  -5 pts:  APR > 500% (provavelmente não sustentável)
 */

const WEIGHTS = {
  volume: 20,
  apr: 25,
  stability: 20,
  tvl: 15,
  feeConsistency: 10,
  feeAlignment: 10,
};

const THRESHOLDS = {
  volume24h: { excellent: 10_000_000, good: 1_000_000, fair: 100_000 },
  apr:       { excellent: 50, good: 20, fair: 5 },
  stability: { low: 2, medium: 8, high: 25 },     // annualizedVol %
  tvl:       { excellent: 50_000_000, good: 5_000_000, fair: 500_000 },
};

// Volatilidade anualizada ideal para cada fee tier (zona verde)
const FEE_TIER_OPTIMAL_VOL = {
  100:   { min: 0,   max: 3   },  // 0.01% — estáveis (USDC/USDT)
  500:   { min: 1,   max: 40  },  // 0.05% — correlacionados (ETH/WBTC)
  3000:  { min: 15,  max: 150 },  // 0.30% — pares padrão (ETH/USDC)
  10000: { min: 50,  max: 500 },  // 1.00% — exóticos/voláteis
};

function calculatePoolScore(poolData) {
  const {
    volume24h = 0,
    apr7d = 0,
    annualizedVol = 0,
    tvl = 0,
    feeConsistency = 0,
    feeTierRaw,
    dayCount = 0,
  } = poolData;

  const volumeScore = scoreVolume(volume24h);
  const aprScore = scoreAPR(apr7d);
  const stabilityScore = scoreStability(annualizedVol);
  const tvlScore = scoreTVL(tvl);
  const consistencyScore = scoreFeeConsistency(feeConsistency);
  const alignmentScore = scoreFeeAlignment(feeTierRaw, annualizedVol);

  let total =
    volumeScore + aprScore + stabilityScore +
    tvlScore + consistencyScore + alignmentScore;

  // Penalidades
  if (dayCount < 3) total -= 10; // pool nova, histórico insuficiente
  if (apr7d > 500) total -= 5;   // APR implausível, provável pool não testada

  const score = Math.min(100, Math.max(0, Math.round(total)));

  return {
    score,
    breakdown: {
      volume: Math.round(volumeScore),
      apr: Math.round(aprScore),
      stability: Math.round(stabilityScore),
      tvl: Math.round(tvlScore),
      consistency: Math.round(consistencyScore),
      alignment: Math.round(alignmentScore),
    },
    riskLevel: getRiskLevel(annualizedVol, tvl, apr7d, dayCount),
    label: getScoreLabel(score),
    estimatedAPR: apr7d,
    ilRisk: computeILRisk(annualizedVol, apr7d, poolData.feeTierBps),
  };
}

// ─── Sub-scores ──────────────────────────────────────────────────────────────

function scoreVolume(v) {
  const { excellent, good, fair } = THRESHOLDS.volume24h;
  if (v >= excellent) return WEIGHTS.volume;
  if (v >= good) return lerp(WEIGHTS.volume * 0.65, WEIGHTS.volume, norm(v, good, excellent));
  if (v >= fair) return lerp(WEIGHTS.volume * 0.25, WEIGHTS.volume * 0.65, norm(v, fair, good));
  return lerp(0, WEIGHTS.volume * 0.25, v / fair);
}

function scoreAPR(apr) {
  const { excellent, good, fair } = THRESHOLDS.apr;
  // APR > 500% recebe penalidade global — aqui só capamos em 300 para evitar distorção
  const capped = Math.min(apr, 300);
  if (capped >= excellent) return lerp(WEIGHTS.apr * 0.8, WEIGHTS.apr, norm(capped, excellent, 300));
  if (capped >= good) return lerp(WEIGHTS.apr * 0.55, WEIGHTS.apr * 0.8, norm(capped, good, excellent));
  if (capped >= fair) return lerp(WEIGHTS.apr * 0.15, WEIGHTS.apr * 0.55, norm(capped, fair, good));
  return lerp(0, WEIGHTS.apr * 0.15, capped / fair);
}

function scoreStability(annualizedVol) {
  // Volatilidade BAIXA = pontuação ALTA
  const { low, medium, high } = THRESHOLDS.stability;
  if (annualizedVol <= low) return WEIGHTS.stability;
  if (annualizedVol <= medium)
    return lerp(WEIGHTS.stability * 0.6, WEIGHTS.stability, 1 - norm(annualizedVol, low, medium));
  if (annualizedVol <= high)
    return lerp(WEIGHTS.stability * 0.2, WEIGHTS.stability * 0.6, 1 - norm(annualizedVol, medium, high));
  // Ultra-volátil: cai linearmente até 0 em 100% anualizado
  return lerp(0, WEIGHTS.stability * 0.2, Math.max(0, 1 - (annualizedVol - high) / 75));
}

function scoreTVL(tvl) {
  const { excellent, good, fair } = THRESHOLDS.tvl;
  if (tvl >= excellent) return WEIGHTS.tvl;
  if (tvl >= good) return lerp(WEIGHTS.tvl * 0.6, WEIGHTS.tvl, norm(tvl, good, excellent));
  if (tvl >= fair) return lerp(WEIGHTS.tvl * 0.25, WEIGHTS.tvl * 0.6, norm(tvl, fair, good));
  return lerp(0, WEIGHTS.tvl * 0.25, tvl / fair);
}

function scoreFeeConsistency(feeConsistency) {
  // feeConsistency: 0 = caótico, 1 = renda perfeitamente previsível
  return WEIGHTS.feeConsistency * Math.pow(feeConsistency, 0.5);
}

function scoreFeeAlignment(feeTierRaw, annualizedVol) {
  const range = FEE_TIER_OPTIMAL_VOL[feeTierRaw];
  if (!range) return WEIGHTS.feeAlignment * 0.4; // tier desconhecido
  if (annualizedVol === 0) return WEIGHTS.feeAlignment * 0.5; // sem dados

  if (annualizedVol >= range.min && annualizedVol <= range.max) {
    return WEIGHTS.feeAlignment; // alinhamento perfeito
  }

  // Penalidade proporcional ao desvio da zona ideal
  const excess = annualizedVol < range.min
    ? range.min - annualizedVol
    : annualizedVol - range.max;
  const rangeWidth = range.max - range.min;
  const penalty = Math.min(1, excess / Math.max(rangeWidth, 1));
  return WEIGHTS.feeAlignment * Math.max(0, 1 - penalty);
}

// ─── Risk Level ───────────────────────────────────────────────────────────────

function getRiskLevel(annualizedVol, tvl, apr7d, dayCount) {
  let riskScore = 0;

  if (annualizedVol > 80)  riskScore += 3;
  else if (annualizedVol > 30) riskScore += 2;
  else if (annualizedVol > 10) riskScore += 1;

  if (tvl < 500_000)   riskScore += 2;
  else if (tvl < 5_000_000) riskScore += 1;

  if (apr7d > 300) riskScore += 2;
  else if (apr7d > 100) riskScore += 1;

  if (dayCount < 3) riskScore += 2; // pool nova = risco desconhecido

  if (riskScore >= 5) return 'ALTO';
  if (riskScore >= 2) return 'MÉDIO';
  return 'BAIXO';
}

// ─── IL Risk ─────────────────────────────────────────────────────────────────

/**
 * Calcula cenários de Impermanent Loss e tempo de break-even via fees.
 *
 * Usa a fórmula V2 como aproximação conservadora para V3 concentrated.
 * IL real em V3 pode ser maior (amplificação pela concentração) ou
 * menor (posição sai do range antes de acumular IL máximo).
 */
function computeILRisk(annualizedVol, apr7d, feeTierBps) {
  const scenarios = [
    { label: '±10% de movimento', priceRatio: 1.10 },
    { label: '±25% de movimento', priceRatio: 1.25 },
    { label: '±50% de movimento', priceRatio: 1.50 },
    { label: '±100% de movimento', priceRatio: 2.00 },
  ];

  const dailyAPR = apr7d / 365; // % por dia

  return scenarios.map(({ label, priceRatio }) => {
    const ilPct = Math.abs(2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1) * 100;

    // Dias de fees necessários para compensar o IL (se IL = 0.5%, APR = 50% → 0.137%/dia → ~3.6 dias)
    const breakEvenDays = dailyAPR > 0 ? ilPct / dailyAPR : Infinity;

    // Probabilidade desse movimento ocorrer em 30 dias (estimativa via vol anualizada)
    const dailyVol = annualizedVol / Math.sqrt(365);
    const horizonVol = dailyVol * Math.sqrt(30);
    const movePct = (priceRatio - 1) * 100;
    const probOccur = horizonVol > 0
      ? Math.max(0, 1 - normalCDF(movePct / horizonVol)) * 2  // two-tailed
      : 0;

    return {
      scenario: label,
      ilPercent: parseFloat(ilPct.toFixed(2)),
      breakEvenDays: isFinite(breakEvenDays) ? parseFloat(breakEvenDays.toFixed(1)) : null,
      probabilityIn30d: parseFloat(Math.min(1, probOccur).toFixed(3)),
    };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScoreLabel(score) {
  if (score >= 80) return 'Excelente';
  if (score >= 60) return 'Bom';
  if (score >= 40) return 'Regular';
  if (score >= 20) return 'Fraco';
  return 'Ruim';
}

// Normaliza v entre [min, max] → [0, 1]
function norm(v, min, max) {
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normalCDF(z) {
  const az = Math.abs(z);
  const t = 1 / (1 + 0.2315419 * az);
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - (Math.exp(-0.5 * az * az) / Math.sqrt(2 * Math.PI)) * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

module.exports = { calculatePoolScore };
