/**
 * Range Manager v2 — monitora range de posições V3 e sugere rebalanceamento.
 *
 * Correções v2:
 *  - Tick snapping correto por feeTier (ticks inválidos causam erro no contrato)
 *  - Histerese: evita sugerir rebalanceamento quando não é viável economicamente
 *  - Distância de borda ajustada pela vol anualizada (não pela legacyVolatility7d)
 */

const TICK_BASE = 1.0001;

// Espaçamento de ticks por feeTier (definido pelo protocolo Uniswap V3)
const TICK_SPACING = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

/**
 * Converte tick para preço em termos de token0/token1 (ajustado por decimais).
 */
function tickToPrice(tick, decimals0 = 18, decimals1 = 18) {
  const rawPrice = Math.pow(TICK_BASE, tick);
  return rawPrice * Math.pow(10, decimals0 - decimals1);
}

/**
 * Converte preço para tick e faz snap para o espaçamento correto do feeTier.
 * Sem snap, ticks inválidos causam revert no contrato.
 */
function priceToTick(price, decimals0 = 18, decimals1 = 18) {
  const adjustedPrice = price / Math.pow(10, decimals0 - decimals1);
  return Math.floor(Math.log(adjustedPrice) / Math.log(TICK_BASE));
}

function snapTick(tick, feeTierRaw, roundUp = false) {
  const spacing = TICK_SPACING[feeTierRaw] || 60;
  if (roundUp) {
    return Math.ceil(tick / spacing) * spacing;
  }
  return Math.floor(tick / spacing) * spacing;
}

/**
 * checkPositionRange(position, currentPool) → status detalhado do range.
 */
function checkPositionRange(position, currentPool) {
  const currentTick = parseInt(currentPool.tick);
  const tickLower = parseInt(position.tick_lower ?? position.tickLower);
  const tickUpper = parseInt(position.tick_upper ?? position.tickUpper);

  if (isNaN(currentTick) || isNaN(tickLower) || isNaN(tickUpper)) {
    return { isInRange: null, urgency: 'UNKNOWN', error: 'Ticks inválidos' };
  }

  const isInRange = currentTick >= tickLower && currentTick <= tickUpper;
  const totalRange = tickUpper - tickLower;
  const rangePercentage = totalRange > 0
    ? Math.round(((currentTick - tickLower) / totalRange) * 100)
    : 0;

  const dec0 = parseInt(position.token0Decimals || currentPool.token0?.decimals || 18);
  const dec1 = parseInt(position.token1Decimals || currentPool.token1?.decimals || 18);

  const priceLower = tickToPrice(tickLower, dec0, dec1);
  const priceUpper = tickToPrice(tickUpper, dec0, dec1);
  const currentPrice = parseFloat(currentPool.token0Price || currentPool.currentPrice || 0);

  let distanceToLower = 0;
  let distanceToUpper = 0;

  if (currentPrice > 0) {
    distanceToLower = ((currentPrice - priceLower) / currentPrice) * 100;
    distanceToUpper = ((priceUpper - currentPrice) / currentPrice) * 100;
  }

  const distanceToNearestEdge = Math.min(
    Math.abs(distanceToLower),
    Math.abs(distanceToUpper)
  );

  // Usa vol anualizada para threshold de urgência (mais preciso que legacy vol)
  const annualizedVol = currentPool.annualizedVol || currentPool.volatility7d || 10;
  const urgency = getRebalanceUrgency(distanceToNearestEdge, isInRange, annualizedVol);

  return {
    isInRange,
    rangePercentage,
    currentPrice,
    priceLower: parseFloat(priceLower.toFixed(6)),
    priceUpper: parseFloat(priceUpper.toFixed(6)),
    distanceToLower: parseFloat(distanceToLower.toFixed(2)),
    distanceToUpper: parseFloat(distanceToUpper.toFixed(2)),
    distanceToNearestEdge: parseFloat(distanceToNearestEdge.toFixed(2)),
    urgency,
    recommendation: getRecommendation(urgency, isInRange, distanceToNearestEdge),
  };
}

/**
 * Urgência calculada em relação à volatilidade diária esperada.
 * Alerta quando o preço está a menos de N "dias de volatilidade" da borda.
 */
function getRebalanceUrgency(distancePct, isInRange, annualizedVol) {
  if (!isInRange) return 'CRITICAL';

  // Volatilidade diária esperada em %
  const dailyVolPct = annualizedVol / Math.sqrt(365);

  // Quantos dias esperados até a borda? (distância / vol/dia)
  const daysToEdge = dailyVolPct > 0 ? distancePct / dailyVolPct : 999;

  if (daysToEdge < 1)  return 'CRITICAL';  // menos de 1 dia
  if (daysToEdge < 3)  return 'HIGH';      // menos de 3 dias
  if (daysToEdge < 7)  return 'MEDIUM';    // menos de 1 semana
  return 'LOW';
}

function getRecommendation(urgency, isInRange, distancePct) {
  if (!isInRange) {
    return {
      action: 'REBALANCE_NOW',
      message: 'Posição FORA do range — não está acumulando fees. Rebalanceie imediatamente ou retire liquidez.',
    };
  }
  if (urgency === 'CRITICAL') {
    return {
      action: 'REBALANCE_URGENT',
      message: `Preço a ${distancePct.toFixed(1)}% da borda. Saída do range iminente. Rebalanceie agora.`,
    };
  }
  if (urgency === 'HIGH') {
    return {
      action: 'PREPARE_REBALANCE',
      message: `Preço a ${distancePct.toFixed(1)}% da borda. Monitore de perto e prepare-se para rebalancear.`,
    };
  }
  if (urgency === 'MEDIUM') {
    return {
      action: 'MONITOR',
      message: `Posição no range (${distancePct.toFixed(1)}% da borda). Monitoramento recomendado.`,
    };
  }
  return {
    action: 'HOLD',
    message: 'Posição bem centrada no range. Nenhuma ação necessária.',
  };
}

/**
 * Sugere nova faixa com ticks válidos (snapped ao tickSpacing do pool).
 *
 * Lógica de histerese: só sugere rebalance se o custo de gas for recuperável
 * em menos de `maxBreakEvenDays` com as fees atuais do pool.
 */
function suggestNewRange({
  currentPrice,
  profile = 'moderado',
  annualizedVol = 10,
  feeTierRaw = 3000,
  decimals0 = 18,
  decimals1 = 18,
  gasCostUSD = 0,
  dailyFeesUSD = 0,
  maxBreakEvenDays = 14,
}) {
  const RANGE_WIDTHS = {
    conservador: 0.20,
    moderado: 0.10,
    agressivo: 0.04,
  };

  const baseWidth = RANGE_WIDTHS[profile] || 0.10;

  // Ajuste: pools mais voláteis precisam de faixa mais larga
  const dailyVolFrac = annualizedVol / Math.sqrt(365) / 100;
  const volAdj = Math.min(baseWidth, dailyVolFrac * 7); // até 1 semana de vol adicional
  const finalWidth = Math.min(0.40, baseWidth + volAdj);

  const priceLower = currentPrice * (1 - finalWidth);
  const priceUpper = currentPrice * (1 + finalWidth);

  const rawTickLower = priceToTick(priceLower, decimals0, decimals1);
  const rawTickUpper = priceToTick(priceUpper, decimals0, decimals1);

  // Snap: tickLower arredonda para baixo, tickUpper para cima
  const tickLower = snapTick(rawTickLower, feeTierRaw, false);
  const tickUpper = snapTick(rawTickUpper, feeTierRaw, true);

  // Histerese: verifica se o rebalanceamento é economicamente viável
  const breakEvenDays = dailyFeesUSD > 0 ? gasCostUSD / dailyFeesUSD : Infinity;
  const isRebalanceViable = breakEvenDays <= maxBreakEvenDays;

  return {
    priceLower: parseFloat(priceLower.toFixed(6)),
    priceUpper: parseFloat(priceUpper.toFixed(6)),
    tickLower,
    tickUpper,
    widthPct: parseFloat((finalWidth * 2 * 100).toFixed(1)),
    breakEvenDays: isFinite(breakEvenDays) ? parseFloat(breakEvenDays.toFixed(1)) : null,
    isRebalanceViable,
    hysteresisNote: isRebalanceViable
      ? null
      : `Break-even estimado de ${breakEvenDays.toFixed(0)} dias. Considere aguardar para reduzir custo de gas relativo.`,
  };
}

module.exports = { checkPositionRange, suggestNewRange, tickToPrice, priceToTick, snapTick, TICK_SPACING };
