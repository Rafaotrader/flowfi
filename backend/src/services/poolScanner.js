const { fetchTopPools, fetchPoolById, enrichPoolData } = require('./subgraph');
const { calculatePoolScore } = require('./scoreEngine');
const NodeCache = require('node-cache');

const poolCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const CACHE_KEY_TOP = 'top_pools';
const CACHE_KEY_ERROR = 'subgraph_error';
const ERROR_BACKOFF_TTL = 60; // não tenta de novo por 60s após erro

// Controla se já há uma atualização em progresso (stale-while-revalidate)
let refreshInProgress = false;

/**
 * scanTopPools() — busca, enriquece e ranqueia pools.
 *
 * Stale-while-revalidate: serve cache expirado enquanto busca em background.
 * Error backoff: evita spam ao Subgraph quando está fora do ar.
 */
async function scanTopPools({ forceRefresh = false } = {}) {
  // Se cache está válido e não é forçado, retorna imediatamente
  if (!forceRefresh) {
    const cached = poolCache.get(CACHE_KEY_TOP);
    if (cached) {
      // Stale: se cache está perto de expirar, atualiza em background
      const ttl = poolCache.getTtl(CACHE_KEY_TOP);
      const staleThresholdMs = 60_000; // último 1 minuto do TTL
      if (ttl && Date.now() > ttl - staleThresholdMs && !refreshInProgress) {
        refreshPoolsInBackground();
      }
      return cached;
    }
  }

  // Verifica backoff de erro (evita spam quando Subgraph está fora do ar)
  if (!forceRefresh && poolCache.get(CACHE_KEY_ERROR)) {
    const cached = poolCache.get(CACHE_KEY_TOP);
    if (cached) return cached; // retorna stale se existir
    throw new Error('Subgraph indisponível. Tentando novamente em breve.');
  }

  return refreshPools();
}

async function refreshPools() {
  if (refreshInProgress) {
    // Outro refresh em andamento — retorna o que tiver
    const cached = poolCache.get(CACHE_KEY_TOP);
    if (cached) return cached;
    // Aguarda um pouco e tenta novamente
    await new Promise((r) => setTimeout(r, 2000));
    return poolCache.get(CACHE_KEY_TOP) || [];
  }

  refreshInProgress = true;
  try {
    console.log('[Scanner] Buscando pools do Subgraph...');
    const rawPools = await fetchTopPools(0);

    const scored = rawPools
      .map((pool) => {
        try {
          const enriched = enrichPoolData(pool);
          const scoreResult = calculatePoolScore(enriched);
          return { ...enriched, ...scoreResult };
        } catch (err) {
          console.warn(`[Scanner] Erro ao processar pool ${pool.id}:`, err.message);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    poolCache.set(CACHE_KEY_TOP, scored);
    poolCache.del(CACHE_KEY_ERROR); // limpa erro anterior
    console.log(`[Scanner] ${scored.length} pools ranqueados.`);
    return scored;
  } catch (err) {
    console.error('[Scanner] Falha ao buscar pools:', err.message);
    poolCache.set(CACHE_KEY_ERROR, true, ERROR_BACKOFF_TTL);
    throw err;
  } finally {
    refreshInProgress = false;
  }
}

function refreshPoolsInBackground() {
  refreshPools().catch((err) =>
    console.warn('[Scanner] Background refresh falhou:', err.message)
  );
}

/**
 * getPoolById() — pool individual enriquecido com cache de 2min.
 */
async function getPoolById(poolId) {
  const cacheKey = `pool_${poolId.toLowerCase()}`;
  const cached = poolCache.get(cacheKey);
  if (cached) return cached;

  const raw = await fetchPoolById(poolId);
  const enriched = enrichPoolData(raw);
  const scoreResult = calculatePoolScore(enriched);
  const result = { ...enriched, ...scoreResult };

  poolCache.set(cacheKey, result, 120);
  return result;
}

/**
 * getTopPoolsByCategory() — pools separados por perfil de risco.
 */
async function getTopPoolsByCategory() {
  const pools = await scanTopPools();
  return {
    conservador: pools.filter((p) => p.riskLevel === 'BAIXO').slice(0, 10),
    moderado: pools.filter((p) => p.riskLevel === 'MÉDIO').slice(0, 10),
    agressivo: pools.filter((p) => p.riskLevel === 'ALTO').slice(0, 10),
    topOverall: pools.slice(0, 20),
  };
}

/**
 * getTopOpportunityOfDay() — pool com melhor score + TVL mínimo de $1M.
 * Atualizado uma vez por dia no máximo.
 */
async function getTopOpportunityOfDay() {
  const cacheKey = 'top_opportunity_day';
  const cached = poolCache.get(cacheKey);
  if (cached) return cached;

  const pools = await scanTopPools();
  const qualified = pools.filter((p) => p.tvl >= 1_000_000 && p.dayCount >= 3);
  const top = qualified[0] || pools[0] || null;

  if (top) poolCache.set(cacheKey, top, 3600); // válido por 1h
  return top;
}

/**
 * getTrendingPools() — pools com maior crescimento de volume nas últimas 24h vs. média 7d.
 * "Trending" = volume hoje está significativamente acima da média.
 */
async function getTrendingPools(limit = 5) {
  const cacheKey = `trending_${limit}`;
  const cached = poolCache.get(cacheKey);
  if (cached) return cached;

  const pools = await scanTopPools();

  const trending = pools
    .filter((p) => p.volume7d > 0 && p.volume24h > 0 && p.dayCount >= 3)
    .map((p) => {
      const avgDaily7d = p.volume7d / 7;
      const volumeSurge = avgDaily7d > 0 ? (p.volume24h - avgDaily7d) / avgDaily7d : 0;
      return { ...p, volumeSurge };
    })
    .filter((p) => p.volumeSurge > 0.2) // pelo menos 20% acima da média
    .sort((a, b) => b.volumeSurge - a.volumeSurge)
    .slice(0, limit);

  poolCache.set(cacheKey, trending, 300);
  return trending;
}

/**
 * getStablePools() — pools com baixa volatilidade e APR decente (perfil conservador).
 */
async function getStablePools(limit = 10) {
  const pools = await scanTopPools();
  return pools
    .filter((p) => p.riskLevel === 'BAIXO' && p.apr7d >= 3 && p.tvl >= 500_000)
    .slice(0, limit);
}

function invalidateCache() {
  poolCache.flushAll();
  console.log('[Scanner] Cache invalidado.');
}

module.exports = {
  scanTopPools,
  getPoolById,
  getTopPoolsByCategory,
  getTopOpportunityOfDay,
  getTrendingPools,
  getStablePools,
  invalidateCache,
};
