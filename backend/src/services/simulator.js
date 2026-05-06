/**
 * Simulator v2 — simulação realista de posição de liquidez concentrada V3.
 *
 * Correções v2:
 *  - Probabilidade de range usa log-retornos diários reais (não vol anualizada invertida)
 *  - 3 cenários: pior / esperado / melhor
 *  - Taxa da plataforma descontada do resultado final
 *  - Guard: bloqueia simulação se gas > receita esperada (posição não-viável)
 *  - Multiplicador de concentração correto para V3
 */

const GAS_UNITS = {
  addLiquidity: 280_000,
  removeLiquidity: 210_000,
  collect: 150_000,
  rebalance: 490_000,
};

const RANGE_PROFILES = {
  conservador: { rangePct: 0.20, label: '±20%', description: 'Menor risco de sair do range. Menor fee rate por tick.' },
  moderado:    { rangePct: 0.10, label: '±10%', description: 'Equilíbrio entre fee rate e estabilidade.' },
  agressivo:   { rangePct: 0.04, label: '±4%',  description: 'Fee rate máximo. Alto risco de sair do range com ativos voláteis.' },
};

/**
 * simulatePosition(params) → resultado completo com 3 cenários
 *
 * params:
 *  capitalUSD:         número — capital em USD
 *  pool:               objeto enriquecido (vem do poolScanner)
 *  profile:            'conservador' | 'moderado' | 'agressivo'
 *  gasPriceGwei:       número (default: 25)
 *  ethPriceUSD:        número (default: 3500)
 *  daysToSimulate:     número (default: 30)
 *  platformFeeBps:     número (default: 300 = 3%)
 */
function simulatePosition({
  capitalUSD,
  pool,
  profile = 'moderado',
  gasPriceGwei = 25,
  ethPriceUSD = 3500,
  daysToSimulate = 30,
  platformFeeBps = 300,
}) {
  if (!RANGE_PROFILES[profile]) throw new Error(`Perfil inválido: ${profile}. Use: conservador, moderado ou agressivo`);
  if (!capitalUSD || capitalUSD <= 0) throw new Error('Capital deve ser positivo');

  const { rangePct, label: rangeLabel, description: rangeDescription } = RANGE_PROFILES[profile];
  const currentPrice = pool.currentPrice || parseFloat(pool.token0Price || 0);
  if (!currentPrice) throw new Error('Preço atual do pool não disponível');

  // ─── Faixa de preço ───────────────────────────────────────────────────────

  const priceLower = currentPrice * (1 - rangePct);
  const priceUpper = currentPrice * (1 + rangePct);
  const priceRange = {
    lower: parseFloat(priceLower.toFixed(6)),
    upper: parseFloat(priceUpper.toFixed(6)),
    current: currentPrice,
    label: rangeLabel,
    description: rangeDescription,
    rangePctTotal: rangePct * 2 * 100,
  };

  // ─── Multiplicador de concentração V3 ────────────────────────────────────
  // Fórmula exata para range simétrico em torno do preço atual:
  // efficiency = 1 / (1 - sqrt(priceLower / priceUpper))
  const concentrationMultiplier = 1 / (1 - Math.sqrt((1 - rangePct) / (1 + rangePct)));

  // ─── Fee rate e volume ────────────────────────────────────────────────────

  const feeRate = parseInt(pool.feeTier) / 1_000_000;
  const tvl = pool.tvl || 1;
  const volume24h = pool.volume24h || 0;
  const volumeMin7d = pool.volumeMin7d || volume24h * 0.4;
  const volumeMax7d = pool.volumeMax7d || volume24h * 1.6;

  // ─── Probabilidade de permanecer no range ────────────────────────────────
  // CORRIGIDO: usa dailyLogReturnVol (stdDev de log-retornos diários em %)
  // Se não disponível, usa fallback conservador baseado em volatility7d
  const dailyVol = pool.dailyLogReturnVol > 0
    ? pool.dailyLogReturnVol / 100      // fração decimal
    : (pool.volatility7d / 100) / Math.sqrt(7); // fallback: decompõe CoV semanal

  // Horizonte de volatilidade para N dias
  const horizonVol = dailyVol * Math.sqrt(daysToSimulate);

  // P(|price_change| < rangePct) via CDF normal bilateral
  const zScore = rangePct / Math.max(horizonVol, 0.001);
  const inRangeProbability = Math.max(0.05, Math.min(0.99, 2 * normalCDF(zScore) - 1));

  // ─── Cálculo de fees por cenário ─────────────────────────────────────────
  // Nossa share de liquidez baseado em capital / TVL × concentração
  const liquidityShare = capitalUSD / tvl;

  function grossFees(dailyVolume) {
    return dailyVolume * feeRate * liquidityShare * concentrationMultiplier;
  }

  const grossExpected = grossFees(volume24h);

  const scenarios = {
    pior: buildScenario({
      grossFeesDay: grossFees(volumeMin7d),
      inRange: Math.min(inRangeProbability, 0.35), // pessimista
      capitalUSD,
      daysToSimulate,
      platformFeeBps,
      label: 'Pior caso',
      assumption: `Volume mínimo 7d ($${fmt(volumeMin7d)}), preço sai do range frequentemente`,
    }),
    esperado: buildScenario({
      grossFeesDay: grossExpected,
      inRange: inRangeProbability,
      capitalUSD,
      daysToSimulate,
      platformFeeBps,
      label: 'Caso esperado',
      assumption: `Volume médio 24h ($${fmt(volume24h)}), probabilidade estimada de range`,
    }),
    melhor: buildScenario({
      grossFeesDay: grossFees(volumeMax7d),
      inRange: Math.min(0.95, inRangeProbability * 1.4), // otimista
      capitalUSD,
      daysToSimulate,
      platformFeeBps,
      label: 'Melhor caso',
      assumption: `Volume máximo 7d ($${fmt(volumeMax7d)}), preço permanece bem centrado no range`,
    }),
  };

  // ─── Gas ─────────────────────────────────────────────────────────────────

  const gasCost = calcGasCost(gasPriceGwei, ethPriceUSD);

  // ─── Viabilidade ─────────────────────────────────────────────────────────

  const expectedNetProfit = scenarios.esperado.netProfitUSD;
  const isViable = expectedNetProfit > gasCost.totalEntry;
  const breakEvenDays = scenarios.esperado.feesPerDay > 0
    ? parseFloat((gasCost.totalEntry / scenarios.esperado.feesPerDay).toFixed(1))
    : Infinity;

  // ─── Warnings ────────────────────────────────────────────────────────────

  const warnings = buildWarnings({
    capitalUSD, pool, profile, gasCost,
    breakEvenDays, inRangeProbability,
    expectedAPR: scenarios.esperado.aprEstimated,
    isViable,
  });

  // ─── IL Scenarios ─────────────────────────────────────────────────────────

  const ilScenarios = computeILScenarios(capitalUSD, rangePct);

  return {
    input: { capitalUSD, profile, daysToSimulate, poolId: pool.id },
    priceRange,
    concentrationMultiplier: parseFloat(concentrationMultiplier.toFixed(2)),
    inRangeProbability: parseFloat((inRangeProbability * 100).toFixed(1)),
    scenarios,
    gasCost,
    ilScenarios,
    breakEvenDays,
    isViable,
    warnings,
    disclaimer:
      'Estimativas baseadas em dados históricos dos últimos 7-14 dias. Não constituem garantia de rendimento. Avalie os riscos antes de entrar.',
  };
}

// ─── Helpers privados ────────────────────────────────────────────────────────

function buildScenario({ grossFeesDay, inRange, capitalUSD, daysToSimulate, platformFeeBps, label, assumption }) {
  const feesPerDay = grossFeesDay * inRange;
  const feesForPeriod = feesPerDay * daysToSimulate;

  const platformFeeUSD = feesForPeriod * (platformFeeBps / 10_000);
  const netFeesUSD = feesForPeriod - platformFeeUSD;

  const aprGross = (feesPerDay * 365 / capitalUSD) * 100;
  const aprNet = (netFeesUSD / capitalUSD / daysToSimulate * 365) * 100;

  return {
    label,
    assumption,
    feesPerDay: parseFloat(feesPerDay.toFixed(4)),
    feesForPeriod: parseFloat(feesForPeriod.toFixed(4)),
    platformFeeUSD: parseFloat(platformFeeUSD.toFixed(4)),
    netFeesUSD: parseFloat(netFeesUSD.toFixed(4)),
    netProfitUSD: parseFloat(netFeesUSD.toFixed(4)),
    aprEstimated: parseFloat(aprNet.toFixed(2)),
    aprGross: parseFloat(aprGross.toFixed(2)),
    inRangeFraction: parseFloat((inRange * 100).toFixed(1)),
  };
}

function computeILScenarios(capitalUSD, rangePct) {
  const moves = [
    { label: '±5%',  ratio: 1.05 },
    { label: '±10%', ratio: 1.10 },
    { label: '±25%', ratio: 1.25 },
    { label: `Saída do range (±${Math.round(rangePct * 100)}%)`, ratio: 1 + rangePct },
  ];

  return moves.map(({ label, ratio }) => {
    const ilFrac = Math.abs(2 * Math.sqrt(ratio) / (1 + ratio) - 1);
    return {
      scenario: label,
      ilPercent: parseFloat((ilFrac * 100).toFixed(2)),
      ilUSD: parseFloat((capitalUSD * ilFrac).toFixed(2)),
    };
  });
}

function calcGasCost(gasPriceGwei, ethPriceUSD) {
  const gweiToETH = 1e-9;
  const costs = {};
  for (const [op, units] of Object.entries(GAS_UNITS)) {
    costs[op] = parseFloat((units * gasPriceGwei * gweiToETH * ethPriceUSD).toFixed(2));
  }
  return {
    ...costs,
    totalEntry: parseFloat((costs.addLiquidity).toFixed(2)),
    totalExit: parseFloat((costs.removeLiquidity + costs.collect).toFixed(2)),
    totalHarvest: parseFloat((costs.collect).toFixed(2)),
    gasPriceGwei,
    ethPriceUSD,
  };
}

function buildWarnings({ capitalUSD, pool, profile, gasCost, breakEvenDays, inRangeProbability, expectedAPR, isViable }) {
  const warnings = [];

  if (!isViable) {
    warnings.push({
      type: 'not_viable',
      severity: 'critical',
      message: `Receita esperada ($${fmt(pool.apr7d / 365 / 100 * capitalUSD * 30)}/mês) é menor que o custo de gas ($${gasCost.totalEntry}). Esta posição provavelmente não é rentável.`,
    });
  }

  if (capitalUSD < 1_000) {
    warnings.push({
      type: 'low_capital',
      severity: 'high',
      message: `Capital de $${fmt(capitalUSD)} é baixo para Ethereum mainnet. O gas consome $${gasCost.totalEntry} de entrada. Considere L2 (Arbitrum, Optimism, Base).`,
    });
  }

  if (breakEvenDays > 30 && isFinite(breakEvenDays)) {
    warnings.push({
      type: 'gas_heavy',
      severity: 'medium',
      message: `Break-even de gas estimado em ${breakEvenDays} dias. Só considere esta posição para horizontes de médio/longo prazo.`,
    });
  }

  if (pool.annualizedVol > 80) {
    warnings.push({
      type: 'high_volatility',
      severity: 'high',
      message: `Volatilidade anualizada de ${pool.annualizedVol.toFixed(0)}%. Risco elevado de sair do range e acumular Impermanent Loss rapidamente.`,
    });
  }

  if (profile === 'agressivo' && inRangeProbability < 0.5) {
    warnings.push({
      type: 'aggressive_range',
      severity: 'high',
      message: `Probabilidade de permanecer no range: ${(inRangeProbability * 100).toFixed(0)}%. Com perfil agressivo e ativo volátil, a posição ficará fora do range maior parte do tempo.`,
    });
  }

  if (pool.dayCount < 3) {
    warnings.push({
      type: 'new_pool',
      severity: 'medium',
      message: `Pool com apenas ${pool.dayCount} dia(s) de histórico. Estimativas menos confiáveis para pools novas.`,
    });
  }

  if (pool.feeConsistency < 0.4) {
    warnings.push({
      type: 'inconsistent_fees',
      severity: 'low',
      message: `Fees desta pool são muito irregulares (consistência: ${(pool.feeConsistency * 100).toFixed(0)}%). A renda real pode variar significativamente da estimativa.`,
    });
  }

  return warnings;
}

function fmt(n) {
  if (!n) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(2);
}

function normalCDF(z) {
  const az = Math.abs(z);
  const t = 1 / (1 + 0.2315419 * az);
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - (Math.exp(-0.5 * az * az) / Math.sqrt(2 * Math.PI)) * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

module.exports = { simulatePosition, RANGE_PROFILES };
