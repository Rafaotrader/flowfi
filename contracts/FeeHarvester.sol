// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * FeeHarvester — coleta fees de posições Uniswap V3 e desconta a taxa da plataforma.
 *
 * Fluxo: usuário aprova este contrato no PositionManager → chama harvestWithFee()
 * → contrato coleta fees → divide (usuário / plataforma) → transfere.
 *
 * Segurança:
 *  - nonReentrant em todas as funções que movem tokens
 *  - Apenas o dono da posição pode fazer harvest
 *  - Taxa máxima travada em 5%
 *  - Eventos para auditoria completa
 */
contract FeeHarvester is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    INonfungiblePositionManager public immutable positionManager;

    address public platformWallet;
    uint256 public platformFeeBps; // basis points — 300 = 3%
    uint256 public constant MAX_FEE_BPS = 500; // trava máxima em 5%

    // Acumuladores de receita para auditoria on-chain
    mapping(address => uint256) public totalPlatformFees; // token => total coletado

    event HarvestExecuted(
        address indexed user,
        uint256 indexed tokenId,
        address token0,
        address token1,
        uint256 userAmount0,
        uint256 userAmount1,
        uint256 platformFee0,
        uint256 platformFee1
    );

    event PlatformFeeUpdated(uint256 oldBps, uint256 newBps);
    event PlatformWalletUpdated(address oldWallet, address newWallet);

    constructor(
        address _positionManager,
        address _platformWallet,
        uint256 _platformFeeBps
    ) {
        require(_positionManager != address(0), "Invalid position manager");
        require(_platformWallet != address(0), "Invalid platform wallet");
        require(_platformFeeBps <= MAX_FEE_BPS, "Fee exceeds maximum");

        positionManager = INonfungiblePositionManager(_positionManager);
        platformWallet = _platformWallet;
        platformFeeBps = _platformFeeBps;
    }

    /**
     * Coleta fees de uma posição Uniswap V3, aplica taxa da plataforma
     * e envia os valores corretos para usuário e plataforma.
     *
     * Requer: msg.sender é dono do NFT tokenId.
     */
    function harvestWithFee(uint256 tokenId) external nonReentrant returns (
        uint256 userAmount0,
        uint256 userAmount1
    ) {
        require(positionManager.ownerOf(tokenId) == msg.sender, "Not position owner");

        // Coleta todos os fees acumulados para este contrato temporariamente
        (uint256 amount0, uint256 amount1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        require(amount0 > 0 || amount1 > 0, "No fees to harvest");

        // Obtém endereços dos tokens da posição
        (, , address token0, address token1, , , , , , , , ) = positionManager.positions(tokenId);

        // Calcula split: taxa da plataforma sobre os LUCROS (fees), não sobre capital
        uint256 fee0 = (amount0 * platformFeeBps) / 10_000;
        uint256 fee1 = (amount1 * platformFeeBps) / 10_000;

        userAmount0 = amount0 - fee0;
        userAmount1 = amount1 - fee1;

        // Transfere ao usuário
        if (userAmount0 > 0) IERC20(token0).safeTransfer(msg.sender, userAmount0);
        if (userAmount1 > 0) IERC20(token1).safeTransfer(msg.sender, userAmount1);

        // Transfere taxa à plataforma
        if (fee0 > 0) {
            IERC20(token0).safeTransfer(platformWallet, fee0);
            totalPlatformFees[token0] += fee0;
        }
        if (fee1 > 0) {
            IERC20(token1).safeTransfer(platformWallet, fee1);
            totalPlatformFees[token1] += fee1;
        }

        emit HarvestExecuted(
            msg.sender, tokenId,
            token0, token1,
            userAmount0, userAmount1,
            fee0, fee1
        );
    }

    /**
     * Simula o split antes de executar — útil para o frontend mostrar preview.
     * Função view, não move fundos.
     */
    function previewHarvest(
        uint256 amount0,
        uint256 amount1
    ) external view returns (
        uint256 userAmount0,
        uint256 userAmount1,
        uint256 platformFee0,
        uint256 platformFee1
    ) {
        platformFee0 = (amount0 * platformFeeBps) / 10_000;
        platformFee1 = (amount1 * platformFeeBps) / 10_000;
        userAmount0 = amount0 - platformFee0;
        userAmount1 = amount1 - platformFee1;
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "Fee exceeds maximum");
        emit PlatformFeeUpdated(platformFeeBps, newFeeBps);
        platformFeeBps = newFeeBps;
    }

    function setPlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid address");
        emit PlatformWalletUpdated(platformWallet, newWallet);
        platformWallet = newWallet;
    }
}
