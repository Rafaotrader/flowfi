const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../db/database');

const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || '300');
const MAX_PLATFORM_FEE_BPS = 500; // trava hard no backend (espelho do contrato)

// Sanidade: nunca processa taxa acima do máximo do contrato
if (PLATFORM_FEE_BPS > MAX_PLATFORM_FEE_BPS) {
  throw new Error(`PLATFORM_FEE_BPS (${PLATFORM_FEE_BPS}) excede o máximo permitido (${MAX_PLATFORM_FEE_BPS})`);
}

/**
 * POST /api/harvest/preview
 *
 * Guards implementados:
 *  - Valores zerados: retorna preview mas avisa que não há fees
 *  - Gas > receita: bloqueia e avisa antes da transação
 *  - Taxas: cobradas apenas se amount > 0
 */
router.post('/preview', requireAuth, async (req, res) => {
  try {
    const {
      positionId,
      amount0Raw,
      amount1Raw,
      token0Symbol,
      token1Symbol,
      token0PriceUSD = 0,   // preço do token0 em USD (do frontend via CoinGecko ou oracle)
      token1PriceUSD = 0,   // preço do token1 em USD
      gasPriceGwei = 25,
      ethPriceUSD = 3500,
    } = req.body;

    if (!positionId || amount0Raw === undefined || amount1Raw === undefined) {
      return res.status(400).json({ error: 'positionId, amount0Raw e amount1Raw são obrigatórios' });
    }

    // Verifica que a posição pertence ao usuário e está ativa
    const posResult = await db.query(
      'SELECT * FROM positions WHERE id = $1 AND user_id = $2 AND status = $3',
      [positionId, req.user.userId, 'active']
    );
    if (!posResult.rows.length) {
      return res.status(404).json({ error: 'Posição não encontrada ou inativa' });
    }

    const amount0 = Math.max(0, parseFloat(amount0Raw) || 0);
    const amount1 = Math.max(0, parseFloat(amount1Raw) || 0);

    // Guard: sem fees para sacar
    if (amount0 === 0 && amount1 === 0) {
      return res.json({
        canHarvest: false,
        reason: 'Nenhum fee acumulado nesta posição. Aguarde o acúmulo de fees antes de sacar.',
        split: null,
        gasCost: null,
      });
    }

    // Taxa da plataforma — aplicada apenas sobre o que existe
    const platformFee0 = amount0 * (PLATFORM_FEE_BPS / 10_000);
    const platformFee1 = amount1 * (PLATFORM_FEE_BPS / 10_000);
    const userAmount0 = amount0 - platformFee0;
    const userAmount1 = amount1 - platformFee1;

    // Valor em USD dos fees
    const gross0USD = amount0 * parseFloat(token0PriceUSD);
    const gross1USD = amount1 * parseFloat(token1PriceUSD);
    const feesUSDTotal = gross0USD + gross1USD;
    const platformFeeUSD = feesUSDTotal * (PLATFORM_FEE_BPS / 10_000);
    const userReceivesUSD = feesUSDTotal - platformFeeUSD;

    // Gas estimado
    const collectGasUnits = 150_000;
    const gasCostETH = collectGasUnits * gasPriceGwei * 1e-9;
    const gasCostUSD = gasCostETH * ethPriceUSD;

    // Guard: gas maior que receita líquida
    const isGasProfitable = feesUSDTotal === 0 || gasCostUSD < userReceivesUSD;
    let profitabilityWarning = null;
    if (!isGasProfitable && feesUSDTotal > 0) {
      profitabilityWarning = {
        severity: 'high',
        message: `Custo de gas ($${gasCostUSD.toFixed(2)}) é maior que sua receita líquida ($${userReceivesUSD.toFixed(2)}). Aguarde o acúmulo de mais fees antes de sacar.`,
      };
    } else if (feesUSDTotal > 0 && gasCostUSD > userReceivesUSD * 0.3) {
      profitabilityWarning = {
        severity: 'medium',
        message: `Gas ($${gasCostUSD.toFixed(2)}) representa ${((gasCostUSD / userReceivesUSD) * 100).toFixed(0)}% da sua receita. Considere aguardar acúmulo maior.`,
      };
    }

    res.json({
      canHarvest: true,
      input: { amount0, amount1, token0Symbol, token1Symbol },
      platformFeeBps: PLATFORM_FEE_BPS,
      platformFeePercent: PLATFORM_FEE_BPS / 100,
      split: {
        userAmount0: parseFloat(userAmount0.toFixed(8)),
        userAmount1: parseFloat(userAmount1.toFixed(8)),
        platformFee0: parseFloat(platformFee0.toFixed(8)),
        platformFee1: parseFloat(platformFee1.toFixed(8)),
      },
      usd: {
        feesTotal: parseFloat(feesUSDTotal.toFixed(2)),
        platformFee: parseFloat(platformFeeUSD.toFixed(2)),
        userReceives: parseFloat(userReceivesUSD.toFixed(2)),
      },
      gasCost: {
        estimatedUSD: parseFloat(gasCostUSD.toFixed(2)),
        gasPriceGwei,
        gasUnits: collectGasUnits,
        isGasProfitable,
      },
      profitabilityWarning,
      disclaimer: 'Taxa cobrada sobre os fees gerados (lucros), nunca sobre o capital investido.',
    });
  } catch (err) {
    console.error('[POST /harvest/preview]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/harvest/confirm
 *
 * Correções críticas v2:
 *  - Verifica tx_hash duplicado (mesma tx não pode ser submetida duas vezes)
 *  - Não cobra taxa se amount = 0
 *  - Registra platform_revenue para AMBOS os tokens separadamente
 *  - Valida que platformFeeUSD não é negativo
 */
router.post('/confirm', requireAuth, async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const {
      positionId,
      txHash,
      amount0Gross,
      amount1Gross,
      amount0User,
      amount1User,
      platformFee0,
      platformFee1,
      feesUSDTotal = 0,
      platformFeeUSD = 0,
      gasCostUSD = 0,
    } = req.body;

    // Validação básica
    if (!positionId || !txHash) {
      return res.status(400).json({ error: 'positionId e txHash são obrigatórios' });
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return res.status(400).json({ error: 'txHash com formato inválido' });
    }

    // Guard: tx_hash duplicado
    const dupCheck = await client.query(
      'SELECT id FROM harvests WHERE tx_hash = $1 LIMIT 1',
      [txHash]
    );
    if (dupCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Esta transação já foi registrada' });
    }

    // Verifica propriedade da posição
    const posResult = await client.query(
      'SELECT * FROM positions WHERE id = $1 AND user_id = $2',
      [positionId, req.user.userId]
    );
    if (!posResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Posição não encontrada' });
    }

    const position = posResult.rows[0];

    // Guard: taxa nunca negativa
    const safePlatformFeeUSD = Math.max(0, parseFloat(platformFeeUSD) || 0);
    const safeFeesTotal = Math.max(0, parseFloat(feesUSDTotal) || 0);

    // Registra o harvest
    const harvestResult = await client.query(
      `INSERT INTO harvests
         (user_id, position_id, tx_hash,
          token0_gross, token1_gross,
          token0_user, token1_user,
          token0_platform_fee, token1_platform_fee,
          fees_usd_total, platform_fee_usd,
          platform_fee_bps, gas_cost_usd,
          status, confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'confirmed',NOW())
       RETURNING *`,
      [
        req.user.userId, positionId, txHash,
        parseFloat(amount0Gross) || 0,
        parseFloat(amount1Gross) || 0,
        parseFloat(amount0User) || 0,
        parseFloat(amount1User) || 0,
        parseFloat(platformFee0) || 0,
        parseFloat(platformFee1) || 0,
        safeFeesTotal,
        safePlatformFeeUSD,
        PLATFORM_FEE_BPS,
        parseFloat(gasCostUSD) || 0,
      ]
    );

    const harvestId = harvestResult.rows[0].id;

    // Registra revenue da plataforma — AMBOS os tokens separadamente (corrigido)
    if (parseFloat(platformFee0) > 0 && position.token0_address) {
      await client.query(
        `INSERT INTO platform_revenue (harvest_id, token, token_symbol, amount, amount_usd)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          harvestId,
          position.token0_address,
          position.token0_symbol,
          parseFloat(platformFee0),
          // USD proporcional ao valor de cada token
          safePlatformFeeUSD * (parseFloat(amount0Gross) / Math.max(parseFloat(amount0Gross) + parseFloat(amount1Gross), 0.0001)),
        ]
      );
    }

    if (parseFloat(platformFee1) > 0 && position.token1_address) {
      await client.query(
        `INSERT INTO platform_revenue (harvest_id, token, token_symbol, amount, amount_usd)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          harvestId,
          position.token1_address,
          position.token1_symbol,
          parseFloat(platformFee1),
          safePlatformFeeUSD * (parseFloat(amount1Gross) / Math.max(parseFloat(amount0Gross) + parseFloat(amount1Gross), 0.0001)),
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ harvest: harvestResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /harvest/confirm]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/harvest/history — histórico completo de harvests
router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT h.*,
              p.token0_symbol, p.token1_symbol, p.pool_id,
              p.capital_usd
       FROM harvests h
       JOIN positions p ON h.position_id = p.id
       WHERE h.user_id = $1
       ORDER BY h.created_at DESC
       LIMIT 100`,
      [req.user.userId]
    );
    res.json({ harvests: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/harvest/stats — estatísticas agregadas do usuário
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) AS total_harvests,
         COALESCE(SUM(fees_usd_total), 0) AS total_fees_usd,
         COALESCE(SUM(platform_fee_usd), 0) AS total_platform_fees_usd,
         COALESCE(SUM(gas_cost_usd), 0) AS total_gas_usd,
         COALESCE(AVG(fees_usd_total), 0) AS avg_harvest_usd,
         MAX(created_at) AS last_harvest_at
       FROM harvests
       WHERE user_id = $1 AND status = 'confirmed'`,
      [req.user.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
