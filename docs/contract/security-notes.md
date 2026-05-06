# Security Notes — PollYieldFlowHarvester

## Proteções já implementadas

### ReentrancyGuard
Todas as funções que movem tokens usam o modifier `nonReentrant`. Isso impede ataques onde um contrato malicioso tenta re-entrar em `harvestWithFee` durante a transferência.

### Validação de ownership
```solidity
require(positionManager.ownerOf(tokenId) == msg.sender, "Not position owner");
```
Apenas o dono real do NFT pode executar o harvest. Nenhum terceiro pode drenar fees alheias.

### Non-custodial
O contrato não retém tokens. O fluxo é:
1. `collect()` traz tokens para o contrato
2. Imediatamente transfere para usuário e plataforma
3. Ao final da função, o saldo do contrato é zero para esses tokens

### Teto de taxa
```solidity
uint256 public constant MAX_FEE_BPS = 1000; // 10% máximo absoluto
```
Mesmo que o owner chame `setPlatformFee`, nunca será possível cobrar mais de 10%.

### SafeERC20
Usa `safeTransfer` em vez de `transfer` para lidar corretamente com tokens que não retornam `bool` (ex: USDT).

### emergencyWithdraw
Função de fallback para retirar tokens que ficarem presos acidentalmente. Acessível apenas pelo owner.

---

## Riscos conhecidos

### Aprovação ampla (setApprovalForAll)
Se o usuário usar `setApprovalForAll`, qualquer tokenId na carteira poderá ser harvested pelo contrato. Preferir `approve(harvesterAddress, tokenId)` específico.

**Mitigação implementada:** O contrato valida `ownerOf(tokenId) == msg.sender`, então mesmo com aprovação ampla, apenas o dono real pode executar.

### Tokens não-padrão
Tokens que revertam em `transfer` ou que cobrem taxa de transferência (deflationary tokens) podem causar falha silenciosa ou valor incorreto.

**Mitigação:** SafeERC20 garante revert em caso de falha. Para tokens deflacionários, o usuário receberá menos do que o split indica.

### Flash loans
Um atacante poderia usar flash loan para temporariamente tornar-se dono de um NFT e fazer harvest. Isso é mitigado pelo fato de que para ser `ownerOf`, o NFT deve ser transferido — o que emite evento e requer gas elevado para tokens Uniswap V3.

**Status:** Risco baixo para posições normais. Monitorar se houver pools com liquidez extremamente alta.

### Manipulação de preço de gas
O usuário pode submeter com gas price baixo e a transação pode ficar pendente por horas. Durante esse tempo, mais fees acumulam na posição.

**Status:** Isso beneficia o usuário (mais fees quando a tx confirmar). Não é um risco de segurança.

### Centralização do owner
O owner pode:
- Alterar `platformWallet` (desvio de receitas futuras)
- Alterar `platformFeeBps` até 10%
- Usar `emergencyWithdraw`

**Recomendação:** Usar multisig (Gnosis Safe) como owner após deploy em produção.

---

## Limitações atuais

| Limitação | Impacto | Plano de resolução |
|---|---|---|
| Taxa fixa (5%) | Não otimiza por volume | Implementar taxa progressiva via `setPlatformFee` com oracle de preço |
| Sem verificação de aprovação no frontend | UX: usuário pode executar sem ter aprovado o contrato | Adicionar `getApproved(tokenId)` check no `loadPreview` |
| `confirmHarvest` envia `feesUSDTotal: 0` | Histórico sem valor em USD | Integrar CoinGecko ou Chainlink para preço dos tokens |
| Suporte apenas a ERC20 | Não funciona com ETH nativo como fee | Não relevante para Uniswap V3 (usa WETH) |
| Deploy manual | Processo sujeito a erro humano | Criar script de deploy automatizado com validações |

---

## Boas práticas para produção

### Antes do deploy
- [ ] Audit externo do contrato (Consensys, OpenZeppelin, Code4rena)
- [ ] Testes unitários com 100% de cobertura das funções críticas
- [ ] Teste de fuzz para edge cases (amount = 0, amount = MAX_UINT128)
- [ ] Deploy em Sepolia + 30 dias de observação

### Configuração do owner
- [ ] Transferir ownership para Gnosis Safe (multisig 2/3 ou 3/5)
- [ ] Nunca usar EOA como owner em produção
- [ ] Timelock de 48h para mudanças de taxa (implementação futura)

### Monitoramento pós-deploy
- [ ] Configurar alerta para evento `PlatformFeeUpdated`
- [ ] Configurar alerta para evento `PlatformWalletUpdated`
- [ ] Monitorar `totalPlatformFees[token]` periodicamente
- [ ] Dune Analytics dashboard para rastrear volume de harvest

### Private key
- **NUNCA** versionar `DEPLOYER_PRIVATE_KEY` ou `PLATFORM_WALLET` (endereço público OK)
- Usar `.env` local e `.gitignore` sempre
- Para produção: usar hardware wallet (Ledger/Trezor) para deploy

---

## Checklist de segurança para cada deploy

```
[ ] Contrato verificado no Etherscan
[ ] Constructor args corretos (positionManager, platformWallet, feeBps)
[ ] platformWallet é endereço correto (não zero address)
[ ] platformFeeBps = 500 (5%)
[ ] Teste de harvest com valor mínimo antes de anunciar
[ ] Owner transferido para multisig
[ ] HARVESTER_CONTRACT_ADDRESS atualizado em todos os .env
```
