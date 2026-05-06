const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getUserAlerts, markAlertsRead } = require('../services/alertEngine');

// GET /api/alerts — alertas do usuário
router.get('/', requireAuth, async (req, res) => {
  try {
    const { unreadOnly = false } = req.query;
    const alerts = await getUserAlerts(req.user.userId, { unreadOnly: unreadOnly === 'true' });
    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/alerts/read — marca alertas como lidos
router.patch('/read', requireAuth, async (req, res) => {
  try {
    const { alertIds } = req.body;
    if (!Array.isArray(alertIds) || !alertIds.length) {
      return res.status(400).json({ error: 'alertIds é obrigatório' });
    }
    await markAlertsRead(req.user.userId, alertIds);
    res.json({ updated: alertIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
