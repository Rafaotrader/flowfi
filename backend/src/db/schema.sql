-- UNI Fee Miner — Schema PostgreSQL v2
-- Execute: psql -U postgres -d unifeeminer -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- monitoramento de queries lentas

-- ─── Usuários ─────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  wallet_address  VARCHAR(42) UNIQUE NOT NULL,
  email           VARCHAR(255),
  nonce           VARCHAR(64),
  plan            VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'elite')),
  preferences     JSONB DEFAULT '{}',      -- perfil padrão, alertas, etc.
  simulation_count INT DEFAULT 0,          -- track uso para monetização futura
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_login      TIMESTAMPTZ
);

CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_created ON users(created_at DESC);

-- ─── Histórico de simulações ──────────────────────────────────────────────────

CREATE TABLE simulations (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  pool_id       VARCHAR(42) NOT NULL,
  capital_usd   DECIMAL(18, 4) NOT NULL,
  profile       VARCHAR(20) NOT NULL,
  days          INT NOT NULL,
  result        JSONB NOT NULL,            -- resultado completo serializado
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_simulations_user ON simulations(user_id, created_at DESC);

-- ─── Posições ─────────────────────────────────────────────────────────────────

CREATE TABLE positions (
  id                SERIAL PRIMARY KEY,
  user_id           INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool_id           VARCHAR(42) NOT NULL,
  token_id          BIGINT NOT NULL,
  token0_symbol     VARCHAR(20),
  token1_symbol     VARCHAR(20),
  token0_address    VARCHAR(42),
  token1_address    VARCHAR(42),
  token0_decimals   SMALLINT DEFAULT 18,
  token1_decimals   SMALLINT DEFAULT 18,
  fee_tier          INT,
  tick_lower        INT NOT NULL,
  tick_upper        INT NOT NULL,
  liquidity         NUMERIC(78, 0),
  capital_usd       DECIMAL(18, 4),
  initial_apr       DECIMAL(10, 4),
  profile           VARCHAR(20),
  status            VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'out_of_range')),
  opened_at         TIMESTAMPTZ DEFAULT NOW(),
  closed_at         TIMESTAMPTZ,

  UNIQUE (user_id, token_id)
);

CREATE INDEX idx_positions_user    ON positions(user_id);
CREATE INDEX idx_positions_pool    ON positions(pool_id);
CREATE INDEX idx_positions_active  ON positions(user_id, status) WHERE status = 'active';

-- ─── Harvests ─────────────────────────────────────────────────────────────────

CREATE TABLE harvests (
  id                  SERIAL PRIMARY KEY,
  user_id             INT NOT NULL REFERENCES users(id),
  position_id         INT NOT NULL REFERENCES positions(id),
  tx_hash             VARCHAR(66) UNIQUE,              -- UNIQUE: previne duplicate submissions
  token0_gross        DECIMAL(36, 18) DEFAULT 0,
  token1_gross        DECIMAL(36, 18) DEFAULT 0,
  token0_user         DECIMAL(36, 18) DEFAULT 0,
  token1_user         DECIMAL(36, 18) DEFAULT 0,
  token0_platform_fee DECIMAL(36, 18) DEFAULT 0,
  token1_platform_fee DECIMAL(36, 18) DEFAULT 0,
  fees_usd_total      DECIMAL(18, 4) DEFAULT 0,
  platform_fee_usd    DECIMAL(18, 4) DEFAULT 0,
  platform_fee_bps    SMALLINT,
  gas_cost_usd        DECIMAL(18, 4) DEFAULT 0,
  status              VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at        TIMESTAMPTZ,

  -- Sanidade: taxa nunca pode ser negativa
  CONSTRAINT check_platform_fee_non_negative CHECK (platform_fee_usd >= 0),
  CONSTRAINT check_fees_non_negative CHECK (fees_usd_total >= 0)
);

CREATE INDEX idx_harvests_user     ON harvests(user_id);
CREATE INDEX idx_harvests_position ON harvests(position_id);
CREATE INDEX idx_harvests_status   ON harvests(status, created_at DESC);

-- ─── Receita da plataforma ────────────────────────────────────────────────────

CREATE TABLE platform_revenue (
  id           SERIAL PRIMARY KEY,
  harvest_id   INT NOT NULL REFERENCES harvests(id),
  token        VARCHAR(42) NOT NULL,
  token_symbol VARCHAR(20),
  amount       DECIMAL(36, 18) NOT NULL,
  amount_usd   DECIMAL(18, 4) DEFAULT 0,
  date         DATE DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_revenue_non_negative CHECK (amount >= 0)
);

CREATE INDEX idx_revenue_date ON platform_revenue(date DESC);

-- ─── Alertas ──────────────────────────────────────────────────────────────────

CREATE TABLE alerts (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  severity    VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  position_id INT REFERENCES positions(id),
  pool_id     VARCHAR(42),
  title       VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  data        JSONB DEFAULT '{}',
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user   ON alerts(user_id, created_at DESC);
CREATE INDEX idx_alerts_unread ON alerts(user_id, read_at) WHERE read_at IS NULL;

-- ─── Views de relatório (Admin) ───────────────────────────────────────────────

CREATE VIEW daily_revenue AS
SELECT
  date,
  SUM(amount_usd)   AS revenue_usd,
  COUNT(DISTINCT harvest_id) AS harvest_count,
  COUNT(DISTINCT token)      AS tokens_count
FROM platform_revenue
GROUP BY date
ORDER BY date DESC;

CREATE VIEW platform_metrics AS
SELECT
  (SELECT COUNT(*) FROM users)                                          AS total_users,
  (SELECT COUNT(*) FROM positions WHERE status = 'active')              AS active_positions,
  (SELECT COUNT(*) FROM simulations)                                    AS total_simulations,
  (SELECT COALESCE(SUM(platform_fee_usd), 0) FROM harvests
   WHERE status = 'confirmed')                                          AS total_revenue_usd,
  (SELECT COALESCE(SUM(platform_fee_usd), 0) FROM harvests
   WHERE status = 'confirmed' AND created_at >= CURRENT_DATE)          AS revenue_today_usd,
  (SELECT COALESCE(SUM(platform_fee_usd), 0) FROM harvests
   WHERE status = 'confirmed'
     AND created_at >= DATE_TRUNC('month', CURRENT_DATE))              AS revenue_month_usd,
  (SELECT COUNT(*) FROM harvests WHERE status = 'confirmed')            AS total_harvests,
  (SELECT COALESCE(AVG(platform_fee_usd), 0) FROM harvests
   WHERE status = 'confirmed')                                          AS avg_harvest_fee_usd;

-- ─── Função: salvar simulação e incrementar contador ─────────────────────────

CREATE OR REPLACE FUNCTION save_simulation(
  p_user_id INT,
  p_pool_id VARCHAR,
  p_capital_usd DECIMAL,
  p_profile VARCHAR,
  p_days INT,
  p_result JSONB
) RETURNS INT AS $$
DECLARE
  v_id INT;
BEGIN
  INSERT INTO simulations (user_id, pool_id, capital_usd, profile, days, result)
  VALUES (p_user_id, p_pool_id, p_capital_usd, p_profile, p_days, p_result)
  RETURNING id INTO v_id;

  UPDATE users SET simulation_count = simulation_count + 1 WHERE id = p_user_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
