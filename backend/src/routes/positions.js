const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../db/database');
const { checkPositionRange, suggestNewRange } = require('../services/rangeManager');
const { getPoolById } = require('../services/poolScanner');

// GET /api/positions — todas as posições do usuário autenticado
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*,
              h.fees_usd_total AS total_fees_harvested,
              h.harvest_count
       FROM positions p
       LEFT JOIN (
         SELECT position_id,
                SUM(fees_usd_total) AS fees_usd_total,
                COUNT(*) AS harvest_count
         FROM harvests WHERE status = 'confirmed'
         GROUP BY position_id
       ) h ON h.position_id = p.id
       WHERE p.user_id = $1
       ORDER BY p.opened_at DESC`,
      [req.user.userId]
    );

    res.json({ positions: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar posições' });
  }
});

// GET /api/positions/:id/status — status de range de uma posição específica
router.get('/:id/status', requireAuth, async (req, res) => {
  try {
    const posResult = await db.query(
      'SELECT * FROM positions WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (!posResult.rows.length) {
      return res.status(404).json({ error: 'Posição não encontrada' });
    }

    const position = posResult.rows[0];
    const pool = await getPoolById(position.pool_id);
    const rangeStatus = checkPositionRange(position, pool);
    const suggestedRange = suggestNewRange(
      pool.currentPrice,
      position.profile,
      pool.volatility7d
    );

    res.json({ position, rangeStatus, suggestedRange, pool: { id: pool.id, apr7d: pool.apr7d } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/positions — registra uma nova posição (após tx on-chain)
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      poolId, tokenId,
      token0Symbol, token1Symbol,
      token0Address, token1Address,
      tickLower, tickUpper,
      liquidity, capitalUSD,
      initialAPR, profile,
    } = req.body;

    if (!poolId || !tokenId || !tickLower === undefined || !tickUpper === undefined) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    }

    const result = await db.query(
      `INSERT INTO positions
         (user_id, pool_id, token_id, token0_symbol, token1_symbol,
          token0_address, token1_address, tick_lower, tick_upper,
          liquidity, capital_usd, initial_apr, profile)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        req.user.userId, poolId, tokenId,
        token0Symbol, token1Symbol,
        token0Address, token1Address,
        tickLower, tickUpper,
        liquidity, capitalUSD,
        initialAPR, profile,
      ]
    );

    res.status(201).json({ position: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Posição com este token_id já registrada' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/positions/:id/status — fecha posição
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['closed', 'active'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const result = await db.query(
      `UPDATE positions
       SET status = $1, closed_at = CASE WHEN $1 = 'closed' THEN NOW() ELSE NULL END
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [status, req.params.id, req.user.userId]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Posição não encontrada' });
    res.json({ position: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
