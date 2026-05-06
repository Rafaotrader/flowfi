// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/INonfungiblePositionManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  PollYieldFlowHarvester
 * @notice Coleta fees de posições Uniswap V3 e divide entre usuário (95%) e plataforma (5%).
 *
 * Fluxo:
 *   1. Usuário aprova este contrato: positionManager.approve(harvesterAddress, tokenId)
 *   2. Usuário chama harvestWithFee(tokenId)
 *   3. Contrato executa positionManager.collect() e recebe os tokens
 *   4. Aplica PLATFORM_FEE_BPS (5%) sobre os fees coletados
 *   5. Transfere 95% ao usuário e 5% ao platformWallet
 *   6. Emite HarvestExecuted — saldo do contrato volta a zero
 *
 * Segurança:
 *   - nonReentrant em harvestWithFee
 *   - Apenas o dono do NFT pode executar o harvest
 *   - Taxa é constante e imutável (PLATFORM_FEE_BPS)
 *   - Nenhum fundo fica retido (non-custodial)
 */
contract PollYieldFlowHarvester is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    INonfungiblePositionManager public immutable positionManager;

    /// @notice Wallet que recebe a taxa da plataforma. Alterável pelo owner.
    address public platformWallet;

    /// @notice Taxa fixa da plataforma: 500 basis points = 5%.
    uint256 public constant PLATFORM_FEE_BPS = 500;

    /// @notice Receita acumulada por token para auditoria on-chain.
    mapping(address => uint256) public totalPlatformFees;

    // ─── Events ───────────────────────────────────────────────────────────────

    event HarvestExecuted(
        address indexed user,
        uint256 indexed tokenId,
        address  token0,
        address  token1,
        uint256  userAmount0,
        uint256  userAmount1,
        uint256  fee0,
        uint256  fee1
    );

    event PlatformWalletUpdated(address indexed oldWallet, address indexed newWallet);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _positionManager  NonfungiblePositionManager da Uniswap V3.
     * @param _platformWallet   Endereço que receberá a taxa de 5%.
     */
    constructor(address _positionManager, address _platformWallet) {
        require(_positionManager != address(0), "Invalid position manager");
        require(_platformWallet  != address(0), "Invalid platform wallet");
        positionManager = INonfungiblePositionManager(_positionManager);
        platformWallet  = _platformWallet;
    }

    // ─── Core ─────────────────────────────────────────────────────────────────

    /**
     * @notice Coleta os fees acumulados, aplica 5% de taxa e distribui os valores.
     * @dev    msg.sender deve ser o dono do NFT e ter aprovado este contrato.
     * @param  tokenId  ID da posição Uniswap V3.
     * @return userAmount0  Quantidade de token0 enviada ao usuário.
     * @return userAmount1  Quantidade de token1 enviada ao usuário.
     */
    function harvestWithFee(uint256 tokenId)
        external
        nonReentrant
        returns (uint256 userAmount0, uint256 userAmount1)
    {
        require(positionManager.ownerOf(tokenId) == msg.sender, "Not position owner");

        // 1. Coleta todos os fees acumulados para este contrato
        (uint256 amount0, uint256 amount1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId:    tokenId,
                recipient:  address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        require(amount0 > 0 || amount1 > 0, "No fees to harvest");

        // 2. Obtém endereços dos tokens da posição
        (, , address token0, address token1, , , , , , , , ) = positionManager.positions(tokenId);

        // 3. Calcula a taxa: fee = (amount * 500) / 10000  →  5%
        uint256 fee0 = (amount0 * PLATFORM_FEE_BPS) / 10_000;
        uint256 fee1 = (amount1 * PLATFORM_FEE_BPS) / 10_000;
        userAmount0  = amount0 - fee0;
        userAmount1  = amount1 - fee1;

        // 4. Transfere 95% ao usuário
        if (userAmount0 > 0) IERC20(token0).safeTransfer(msg.sender, userAmount0);
        if (userAmount1 > 0) IERC20(token1).safeTransfer(msg.sender, userAmount1);

        // 5. Transfere 5% à plataforma
        if (fee0 > 0) {
            IERC20(token0).safeTransfer(platformWallet, fee0);
            totalPlatformFees[token0] += fee0;
        }
        if (fee1 > 0) {
            IERC20(token1).safeTransfer(platformWallet, fee1);
            totalPlatformFees[token1] += fee1;
        }

        // 6. Emite evento — contrato agora tem saldo zero para esses tokens
        emit HarvestExecuted(msg.sender, tokenId, token0, token1, userAmount0, userAmount1, fee0, fee1);
    }

    /**
     * @notice Calcula o split sem mover fundos. Usado pelo frontend para exibir preview.
     */
    function previewHarvest(uint256 amount0, uint256 amount1)
        external
        pure
        returns (
            uint256 userAmount0,
            uint256 userAmount1,
            uint256 platformFee0,
            uint256 platformFee1
        )
    {
        platformFee0 = (amount0 * PLATFORM_FEE_BPS) / 10_000;
        platformFee1 = (amount1 * PLATFORM_FEE_BPS) / 10_000;
        userAmount0  = amount0 - platformFee0;
        userAmount1  = amount1 - platformFee1;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Atualiza a wallet de recebimento da plataforma.
    function setPlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid address");
        emit PlatformWalletUpdated(platformWallet, newWallet);
        platformWallet = newWallet;
    }

    /// @notice Segurança: retira tokens que ficaram presos acidentalmente.
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}
