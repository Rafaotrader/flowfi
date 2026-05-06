const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware de autenticação JWT — verifica token Bearer.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação necessário' });
  }

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

/**
 * Gera nonce para o usuário assinar com a carteira (autenticação sem senha).
 */
async function getNonce(req, res) {
  const { walletAddress } = req.params;
  if (!ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: 'Endereço de carteira inválido' });
  }

  const nonce = Math.floor(Math.random() * 1_000_000).toString();
  const checksummed = ethers.getAddress(walletAddress);

  await db.query(
    `INSERT INTO users (wallet_address, nonce)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO UPDATE SET nonce = $2`,
    [checksummed, nonce]
  );

  res.json({
    nonce,
    message: `Assine esta mensagem para autenticar no UNI Fee Miner.\nNonce: ${nonce}`,
  });
}

/**
 * Verifica assinatura da carteira e emite JWT.
 */
async function verifySignature(req, res) {
  const { walletAddress, signature } = req.body;

  if (!ethers.isAddress(walletAddress) || !signature) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  const checksummed = ethers.getAddress(walletAddress);

  const userResult = await db.query(
    'SELECT * FROM users WHERE wallet_address = $1',
    [checksummed]
  );

  if (!userResult.rows.length || !userResult.rows[0].nonce) {
    return res.status(401).json({ error: 'Nonce não encontrado. Solicite um novo.' });
  }

  const { nonce, id } = userResult.rows[0];
  const message = `Assine esta mensagem para autenticar no UNI Fee Miner.\nNonce: ${nonce}`;

  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== checksummed.toLowerCase()) {
      return res.status(401).json({ error: 'Assinatura inválida' });
    }
  } catch {
    return res.status(401).json({ error: 'Erro ao verificar assinatura' });
  }

  // Invalida o nonce após uso (previne replay attacks)
  await db.query(
    'UPDATE users SET nonce = NULL, last_login = NOW() WHERE id = $1',
    [id]
  );

  const token = jwt.sign(
    { userId: id, walletAddress: checksummed },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, walletAddress: checksummed });
}

module.exports = { requireAuth, getNonce, verifySignature };
