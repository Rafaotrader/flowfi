# PollYieldFlowHarvester — Informações do Contrato

## Visão geral

Contrato Solidity não-custodial que coleta fees de posições Uniswap V3 e divide automaticamente entre usuário e plataforma.

- **Arquivo:** `contracts/PollYieldFlowHarvester.sol`
- **Versão Solidity:** `^0.8.19`
- **Padrão:** OpenZeppelin v4 (ReentrancyGuard, Ownable, SafeERC20)
- **Rede principal:** Base (chainId 8453)
- **Platform wallet:** `0xb7516B25F52Ea4Cf3711D6fa83F844756209c07d`

---

## NonfungiblePositionManager por rede

| Rede | ChainId | NonfungiblePositionManager |
|---|---|---|
| **Base (principal)** | **8453** | **`0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`** |
| Ethereum Mainnet | 1 | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` |
| Arbitrum | 42161 | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` |
| Optimism | 10 | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` |
| Polygon | 137 | `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` |
| Sepolia (testnet) | 11155111 | `0x1238536071E1c677A632429e3655c799b22cDA52` |

---

## Funções públicas

### `harvestWithFee(uint256 tokenId) → (userAmount0, userAmount1)`

Função principal. Coleta fees da posição e distribui entre usuário e plataforma.

**Requer:** `msg.sender == ownerOf(tokenId)`

**Fluxo interno:**
1. Valida que o chamador é dono do NFT
2. Chama `positionManager.collect()` com `recipient = address(this)`
3. Calcula taxa: `fee = amount * PLATFORM_FEE_BPS / 10_000`
4. Transfere `amount - fee` para `msg.sender` (usuário)
5. Transfere `fee` para `platformWallet` (plataforma)
6. Emite `HarvestExecuted` — contrato retorna a saldo zero

**Pré-requisito do usuário:**
```
positionManager.approve(harvesterAddress, tokenId)
// OU
positionManager.setApprovalForAll(harvesterAddress, true)
```

---

### `previewHarvest(uint256 amount0, uint256 amount1)` *(pure)*

Simula a divisão sem executar transação. Usado pelo frontend para exibir o preview.

**Retorna:** `(userAmount0, userAmount1, platformFee0, platformFee1)`

---

### `PLATFORM_FEE_BPS()` *(view)*

Retorna a taxa em basis points. Valor fixo: `500 = 5%`.

Getter auto-gerado pela declaração `public constant`.

---

## Funções admin (onlyOwner)

| Função | Descrição |
|---|---|
| `setPlatformWallet(address newWallet)` | Atualiza a carteira de recebimento da taxa |
| `emergencyWithdraw(address token, uint256 amount)` | Retira tokens presos (fallback de segurança) |

---

## Eventos

```solidity
event HarvestExecuted(
    address indexed user,
    uint256 indexed tokenId,
    address  token0,
    address  token1,
    uint256  userAmount0,
    uint256  userAmount1,
    uint256  fee0,
    uint256  fee1
)

event PlatformWalletUpdated(
    address indexed oldWallet,
    address indexed newWallet
)
```

---

## Lógica de taxa

```
PLATFORM_FEE_BPS = 500  →  5% fixo (imutável — declarado como constant)

fee0 = amount0 * 500 / 10_000
fee1 = amount1 * 500 / 10_000
userAmount0 = amount0 - fee0  →  95% vai ao usuário
userAmount1 = amount1 - fee1
```

**A taxa incide apenas sobre fees gerados (lucros), nunca sobre capital investido.**

---

## Variáveis de estado

| Variável | Tipo | Descrição |
|---|---|---|
| `positionManager` | `address immutable` | NonfungiblePositionManager da Uniswap V3 |
| `platformWallet` | `address` | Recebe as taxas — atualizável via `setPlatformWallet` |
| `PLATFORM_FEE_BPS` | `uint256 constant` | Taxa fixa: 500 = 5% (não alterável após deploy) |
| `totalPlatformFees` | `mapping(address → uint256)` | Acumulador de receita por token (auditoria on-chain) |

---

## Gas na Base vs Ethereum

| Operação | Ethereum (~18 Gwei) | Base (~0.05 Gwei) |
|---|---|---|
| `harvestWithFee` (~150k gas) | ~$9.45 | ~$0.026 |
| `approve` (~50k gas) | ~$3.15 | ~$0.009 |

Gas estimado para Base torna viável saques menores (fees a partir de ~$0.50).
