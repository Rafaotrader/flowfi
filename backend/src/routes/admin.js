const express = require('express');
const router = express.Router();
const db = require('../db/database');
const jwt = require('jsonwebtoken');

// Middleware simples de admin via header secret
function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

// GET /api/admin/metrics — métricas globais da plataforma
router.get('/metrics', requireAdmin, async (req, res) => {
  try {
    const metrics = await db.query('SELECT * FROM platform_metrics');
    res.json(metrics.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/revenue/daily — receita diária
router.get('/revenue/daily', requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const result = await db.query(
      `SELECT * FROM daily_revenue LIMIT $1`,
      [parseInt(days)]
    );
    res.json({ revenue: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/revenue/monthly — receita mensal agrupada
router.get('/revenue/monthly', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        DATE_TRUNC('month', date) AS month,
        SUM(revenue_usd) AS revenue_usd,
        SUM(harvest_count) AS harvest_count
      FROM daily_revenue
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12
    `);
    res.json({ revenue: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — lista de usuários
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.*,
             COUNT(DISTINCT p.id) AS positions_count,
             COUNT(DISTINCT h.id) AS harvests_count,
             COALESCE(SUM(h.fees_usd_total), 0) AS total_fees_usd
      FROM users u
      LEFT JOIN positions p ON p.user_id = u.id
      LEFT JOIN harvests h ON h.user_id = u.id AND h.status = 'confirmed'
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/harvests — últimos harvests
router.get('/harvests', requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT h.*, u.wallet_address, p.token0_symbol, p.token1_symbol
      FROM harvests h
      JOIN users u ON h.user_id = u.id
      JOIN positions p ON h.position_id = p.id
      ORDER BY h.created_at DESC
      LIMIT 50
    `);
    res.json({ harvests: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
