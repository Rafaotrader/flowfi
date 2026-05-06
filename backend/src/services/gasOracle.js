/**
 * Gas Oracle — busca preço atual do gas e determina se é um bom momento para transações.
 *
 * Fontes (em ordem de prioridade):
 *  1. Etherscan Gas Tracker API
 *  2. Blocknative estimação
 *  3. Fallback conservador ($30 Gwei)
 */

const NodeCache = require('node-cache');
const gasCache = new NodeCache({ stdTTL: 30, checkperiod: 15 }); // cache de 30s

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const CACHE_KEY = 'gas_prices';

// Thresholds em Gwei para classificar o gas
const GAS_LEVELS = {
  cheap: 15,    // < 15 Gwei = barato, momento ótimo para transações
  normal: 35,   // 15-35 Gwei = normal
  expensive: 60, // 35-60 Gwei = caro, considere aguardar
  // > 60 Gwei = muito caro, evitar
};

/**
 * getGasPrices() → { slow, standard, fast, instant, level, recommendation }
 * Usa cache de 30s para não sobrecarregar a API.
 */
async function getGasPrices() {
  const cached = gasCache.get(CACHE_KEY);
  if (cached) return cached;

  try {
    let prices = await fetchFromEtherscan();
    if (!prices) prices = getFallbackPrices();

    const enriched = {
      ...prices,
      level: classifyGasLevel(prices.standard),
      recommendation: getGasRecommendation(prices.standard),
      isGoodTime: prices.standard <= GAS_LEVELS.normal,
      timestamp: new Date().toISOString(),
    };

    gasCache.set(CACHE_KEY, enriched);
    return enriched;
  } catch (err) {
    console.warn('[GasOracle] Erro ao buscar gas prices:', err.message);
    return {
      ...getFallbackPrices(),
      level: 'unknown',
      recommendation: 'Dados de gas indisponíveis no momento.',
      isGoodTime: null,
      timestamp: new Date().toISOString(),
      error: 'Usando estimativa conservadora',
    };
  }
}

async function fetchFromEtherscan() {
  if (!ETHERSCAN_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${ETHERSCAN_API_KEY}`;
    const res = await fetch(url, { signal: controller.signal });
    const json = await res.json();

    if (json.status !== '1' || !json.result) return null;

    return {
      slow: parseFloat(json.result.SafeGasPrice),
      standard: parseFloat(json.result.ProposeGasPrice),
      fast: parseFloat(json.result.FastGasPrice),
      instant: parseFloat(json.result.FastGasPrice) * 1.2,
      source: 'etherscan',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getFallbackPrices() {
  return {
    slow: 20,
    standard: 30,
    fast: 45,
    instant: 60,
    source: 'fallback',
  };
}

function classifyGasLevel(standardGwei) {
  if (standardGwei <= GAS_LEVELS.cheap) return 'cheap';
  if (standardGwei <= GAS_LEVELS.normal) return 'normal';
  if (standardGwei <= GAS_LEVELS.expensive) return 'expensive';
  return 'very_expensive';
}

function getGasRecommendation(standardGwei) {
  if (standardGwei <= GAS_LEVELS.cheap) {
    return `Gas baixo (${standardGwei} Gwei) — ótimo momento para transações!`;
  }
  if (standardGwei <= GAS_LEVELS.normal) {
    return `Gas normal (${standardGwei} Gwei) — momento adequado para transações.`;
  }
  if (standardGwei <= GAS_LEVELS.expensive) {
    return `Gas caro (${standardGwei} Gwei) — considere aguardar para reduzir custos.`;
  }
  return `Gas muito caro (${standardGwei} Gwei) — recomendado aguardar. Custos podem consumir parte significativa dos fees.`;
}

/**
 * estimateTransactionCostUSD(gasUnits, ethPriceUSD)
 * Calcula custo estimado em USD dado gas units e preço do ETH.
 */
async function estimateTransactionCostUSD(gasUnits, ethPriceUSD = 3500) {
  const { standard } = await getGasPrices();
  const ethCost = gasUnits * standard * 1e-9;
  return {
    gasPriceGwei: standard,
    gasUnits,
    ethCost: parseFloat(ethCost.toFixed(8)),
    usdCost: parseFloat((ethCost * ethPriceUSD).toFixed(2)),
  };
}

module.exports = { getGasPrices, estimateTransactionCostUSD };
