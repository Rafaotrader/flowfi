const express = require('express');
const router = express.Router();
const { simulatePosition, RANGE_PROFILES } = require('../services/simulator');
const { getPoolById } = require('../services/poolScanner');
const { getGasPrices } = require('../services/gasOracle');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.get('/profiles', (req, res) => {
  res.json(RANGE_PROFILES);
});

// POST /api/simulator/simulate
router.post('/simulate', async (req, res) => {
  try {
    const {
      capitalUSD,
      poolId,
      profile = 'moderado',
      gasPriceGwei,      // se não enviado, busca do oracle
      ethPriceUSD = 3500,
      daysToSimulate = 30,
    } = req.body;

    if (!capitalUSD || !poolId) {
      return res.status(400).json({ error: 'capitalUSD e poolId são obrigatórios' });
    }
    if (parseFloat(capitalUSD) <= 0 || parseFloat(capitalUSD) > 10_000_000) {
      return res.status(400).json({ error: 'Capital deve ser entre $1 e $10.000.000' });
    }
    if (!['conservador', 'moderado', 'agressivo'].includes(profile)) {
      return res.status(400).json({ error: 'Perfil inválido. Use: conservador, moderado ou agressivo' });
    }

    // Busca pool e gas em paralelo
    const [pool, gasData] = await Promise.all([
      getPoolById(poolId),
      gasPriceGwei ? Promise.resolve({ standard: parseFloat(gasPriceGwei) }) : getGasPrices().catch(() => ({ standard: 25 })),
    ]);

    const result = simulatePosition({
      capitalUSD: parseFloat(capitalUSD),
      pool,
      profile,
      gasPriceGwei: parseFloat(gasPriceGwei || gasData.standard),
      ethPriceUSD: parseFloat(ethPriceUSD),
      daysToSimulate: parseInt(daysToSimulate),
    });

    // Salva histórico de simulação se autenticado (sem bloquear resposta)
    const token = req.headers.authorization?.slice(7);
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        db.query(
          'SELECT save_simulation($1,$2,$3,$4,$5,$6)',
          [decoded.userId, poolId, parseFloat(capitalUSD), profile, parseInt(daysToSimulate), JSON.stringify(result)]
        ).catch(() => {}); // não bloqueia a resposta
      } catch {}
    }

    // Inclui contexto do gas na resposta
    result.gasContext = {
      currentGwei: gasData.standard,
      level: gasData.level,
      recommendation: gasData.recommendation,
    };

    res.json(result);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/simulator/history — histórico de simulações do usuário
router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, pool_id, capital_usd, profile, days,
              result->'scenarios'->'esperado'->>'aprEstimated' AS apr_estimated,
              created_at
       FROM simulations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.userId]
    );
    res.json({ simulations: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
