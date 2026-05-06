const db = require('../db/database');
const { checkPositionRange } = require('./rangeManager');
const { getPoolById } = require('./poolScanner');

/**
 * Alert Engine — detecta condições críticas e cria alertas para o usuário.
 *
 * Roda em background via setInterval no server.js.
 * Alertas são salvos no PostgreSQL e entregues via WebSocket ou polling.
 */

const ALERT_TYPES = {
  OUT_OF_RANGE: 'out_of_range',
  NEAR_RANGE_EDGE: 'near_range_edge',
  APR_DROP: 'apr_drop',
  NEW_OPPORTUNITY: 'new_opportunity',
  REBALANCE_NEEDED: 'rebalance_needed',
};

/**
 * Verifica todas as posições ativas e gera alertas necessários.
 * Chamado a cada 5 minutos pelo scheduler.
 */
async function runAlertCheck() {
  console.log('[AlertEngine] Iniciando verificação de alertas...');

  try {
    const positions = await db.query(
      `SELECT p.*, u.email, u.wallet_address
       FROM positions p
       JOIN users u ON p.user_id = u.id
       WHERE p.status = 'active'`
    );

    for (const position of positions.rows) {
      await checkPositionAlerts(position);
    }

    console.log(`[AlertEngine] ${positions.rows.length} posições verificadas.`);
  } catch (err) {
    console.error('[AlertEngine] Erro na verificação:', err.message);
  }
}

async function checkPositionAlerts(position) {
  try {
    const pool = await getPoolById(position.pool_id);
    const rangeStatus = checkPositionRange(position, pool);

    // Alerta: fora do range
    if (!rangeStatus.isInRange) {
      await createAlert(position.user_id, {
        type: ALERT_TYPES.OUT_OF_RANGE,
        severity: 'critical',
        positionId: position.id,
        poolId: position.pool_id,
        title: 'Posição Fora do Range',
        message: `Sua posição ${position.token0_symbol}/${position.token1_symbol} saiu do range e não está acumulando fees. Rebalanceie agora.`,
        data: { rangeStatus, currentPrice: pool.currentPrice },
      });
    }

    // Alerta: próximo da borda
    else if (rangeStatus.urgency === 'HIGH') {
      await createAlert(position.user_id, {
        type: ALERT_TYPES.NEAR_RANGE_EDGE,
        severity: 'warning',
        positionId: position.id,
        poolId: position.pool_id,
        title: 'Posição Próxima da Borda',
        message: `Posição ${position.token0_symbol}/${position.token1_symbol} a ${rangeStatus.distanceToNearestEdge.toFixed(1)}% da borda do range.`,
        data: { rangeStatus },
      });
    }

    // Alerta: APR caiu significativamente
    const currentAPR = pool.apr7d;
    const recordedAPR = parseFloat(position.initial_apr || 0);
    if (recordedAPR > 0 && currentAPR < recordedAPR * 0.5) {
      await createAlert(position.user_id, {
        type: ALERT_TYPES.APR_DROP,
        severity: 'warning',
        positionId: position.id,
        poolId: position.pool_id,
        title: 'APR Caiu Significativamente',
        message: `O APR do pool ${position.token0_symbol}/${position.token1_symbol} caiu de ${recordedAPR.toFixed(1)}% para ${currentAPR.toFixed(1)}%.`,
        data: { previousAPR: recordedAPR, currentAPR },
      });
    }
  } catch (err) {
    console.warn(`[AlertEngine] Erro ao verificar posição ${position.id}:`, err.message);
  }
}

async function createAlert(userId, alertData) {
  // Evita duplicatas: não cria o mesmo tipo de alerta para a mesma posição nas últimas 4h
  const recent = await db.query(
    `SELECT id FROM alerts
     WHERE user_id = $1 AND type = $2 AND position_id = $3
       AND created_at > NOW() - INTERVAL '4 hours'
     LIMIT 1`,
    [userId, alertData.type, alertData.positionId]
  );

  if (recent.rows.length > 0) return; // já alertado recentemente

  await db.query(
    `INSERT INTO alerts (user_id, type, severity, position_id, pool_id, title, message, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      alertData.type,
      alertData.severity,
      alertData.positionId,
      alertData.poolId,
      alertData.title,
      alertData.message,
      JSON.stringify(alertData.data || {}),
    ]
  );
}

async function getUserAlerts(userId, { unreadOnly = false, limit = 50 } = {}) {
  const whereClause = unreadOnly
    ? 'WHERE user_id = $1 AND read_at IS NULL'
    : 'WHERE user_id = $1';

  const result = await db.query(
    `SELECT * FROM alerts ${whereClause} ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );

  return result.rows;
}

async function markAlertsRead(userId, alertIds) {
  await db.query(
    `UPDATE alerts SET read_at = NOW()
     WHERE user_id = $1 AND id = ANY($2::int[])`,
    [userId, alertIds]
  );
}

module.exports = {
  runAlertCheck,
  getUserAlerts,
  markAlertsRead,
  ALERT_TYPES,
};
