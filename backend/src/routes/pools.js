const express = require('express');
const router = express.Router();
const {
  scanTopPools,
  getPoolById,
  getTopPoolsByCategory,
  getTopOpportunityOfDay,
  getTrendingPools,
  getStablePools,
  invalidateCache,
} = require('../services/poolScanner');
const { getGasPrices } = require('../services/gasOracle');
const { requireAuth } = require('../middleware/auth');

// GET /api/pools — top pools ranqueados por score
router.get('/', async (req, res) => {
  try {
    const { limit = 20, forceRefresh = false } = req.query;
    const pools = await scanTopPools({ forceRefresh: forceRefresh === 'true' });
    res.json({
      pools: pools.slice(0, Math.min(parseInt(limit), 100)),
      total: pools.length,
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /pools]', err.message);
    res.status(502).json({ error: 'Erro ao buscar pools. Tente novamente em instantes.' });
  }
});

// GET /api/pools/categories — pools por perfil de risco
router.get('/categories', async (req, res) => {
  try {
    const categories = await getTopPoolsByCategory();
    res.json(categories);
  } catch (err) {
    res.status(502).json({ error: 'Erro ao categorizar pools' });
  }
});

// GET /api/pools/opportunity — top oportunidade do dia
router.get('/opportunity', async (req, res) => {
  try {
    const pool = await getTopOpportunityOfDay();
    res.json({ pool });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/pools/trending — pools com volume crescente
router.get('/trending', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const pools = await getTrendingPools(parseInt(limit));
    res.json({ pools });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/pools/stable — pools de baixo risco
router.get('/stable', async (req, res) => {
  try {
    const pools = await getStablePools(10);
    res.json({ pools });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/pools/gas — status atual do gas
router.get('/gas', async (req, res) => {
  try {
    const gas = await getGasPrices();
    res.json(gas);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/pools/:id — pool individual com dados detalhados
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPoolById(req.params.id);
    res.json(pool);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: 'Pool não encontrado' });
    }
    res.status(502).json({ error: 'Erro ao buscar pool' });
  }
});

// POST /api/pools/refresh — força atualização do cache (requer auth)
router.post('/refresh', requireAuth, (req, res) => {
  invalidateCache();
  res.json({ message: 'Cache invalidado. Próxima requisição buscará dados frescos.' });
});

module.exports = router;
