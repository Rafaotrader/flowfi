'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const WalletContext = createContext(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}

const NETWORK_NAMES = {
  1: 'Ethereum', 5: 'Goerli', 11155111: 'Sepolia',
  42161: 'Arbitrum', 10: 'Optimism', 137: 'Polygon', 8453: 'Base',
  56: 'BSC', 43114: 'Avalanche',
};

const CHAIN_PARAMS = {
  1:     { chainId: '0x1',    chainName: 'Ethereum Mainnet', nativeCurrency: { name: 'Ether',  symbol: 'ETH',   decimals: 18 }, rpcUrls: ['https://eth.llamarpc.com'],         blockExplorerUrls: ['https://etherscan.io']          },
  42161: { chainId: '0xa4b1', chainName: 'Arbitrum One',     nativeCurrency: { name: 'Ether',  symbol: 'ETH',   decimals: 18 }, rpcUrls: ['https://arb1.arbitrum.io/rpc'],      blockExplorerUrls: ['https://arbiscan.io']            },
  10:    { chainId: '0xa',    chainName: 'OP Mainnet',        nativeCurrency: { name: 'Ether',  symbol: 'ETH',   decimals: 18 }, rpcUrls: ['https://mainnet.optimism.io'],        blockExplorerUrls: ['https://optimistic.etherscan.io'] },
  137:   { chainId: '0x89',   chainName: 'Polygon Mainnet',  nativeCurrency: { name: 'MATIC',  symbol: 'MATIC', decimals: 18 }, rpcUrls: ['https://polygon-rpc.com'],            blockExplorerUrls: ['https://polygonscan.com']        },
  8453:  { chainId: '0x2105', chainName: 'Base',              nativeCurrency: { name: 'Ether',  symbol: 'ETH',   decimals: 18 }, rpcUrls: ['https://mainnet.base.org'],           blockExplorerUrls: ['https://basescan.org']           },
  56:    { chainId: '0x38',   chainName: 'BNB Smart Chain',   nativeCurrency: { name: 'BNB',    symbol: 'BNB',   decimals: 18 }, rpcUrls: ['https://bsc-dataseed.binance.org'],   blockExplorerUrls: ['https://bscscan.com']            },
};

const SUPPORTED = [1, 42161, 10, 137, 8453, 56];

const FLOWFI_URL = 'flowfy-neon.vercel.app';
const METAMASK_DEEPLINK = `https://metamask.app.link/dapp/${FLOWFI_URL}`;

function detectMobile() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function detectInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Instagram|FBAN|FBAV|WhatsApp|Line\/|MicroMessenger|FB_IAB|FB4A|FBIOS/i.test(ua);
}

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(msg || `Timeout após ${ms / 1000}s`)), ms)
    ),
  ]);
}

export default function WalletProvider({ children }) {
  const [address,        setAddress]        = useState(null);
  const [chainId,        setChainId]        = useState(null);
  const [connecting,     setConnecting]     = useState(false);
  const [connError,      setConnError]      = useState(null);
  const [isMobile,       setIsMobile]       = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);

  useEffect(() => {
    setIsMobile(detectMobile());
    setIsInAppBrowser(detectInAppBrowser());
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setConnError(null);
    localStorage.removeItem('ufm_address');
    localStorage.removeItem('ufm_token');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    window.ethereum
      .request({ method: 'eth_accounts' })
      .then((accs) => {
        if (!accs?.length) { localStorage.removeItem('ufm_address'); return; }
        setAddress(accs[0]);
        localStorage.setItem('ufm_address', accs[0]);
        return window.ethereum.request({ method: 'eth_chainId' });
      })
      .then((hex) => { if (hex) setChainId(parseInt(hex, 16)); })
      .catch(() => {});

    const onAccounts = (accs) => {
      if (!accs?.length) disconnect();
      else { setAddress(accs[0]); localStorage.setItem('ufm_address', accs[0]); }
    };
    const onChain = (hex) => setChainId(parseInt(hex, 16));

    window.ethereum.on('accountsChanged', onAccounts);
    window.ethereum.on('chainChanged',   onChain);
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccounts);
      window.ethereum.removeListener('chainChanged',   onChain);
    };
  }, [disconnect]);

  async function switchNetwork(targetChainId) {
    if (!window?.ethereum) throw new Error('MetaMask não encontrado');
    const hex = '0x' + targetChainId.toString(16);
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hex }],
      });
    } catch (err) {
      if (err.code === 4902 || err.code === -32603) {
        const params = CHAIN_PARAMS[targetChainId];
        if (!params) throw new Error(`Rede ${targetChainId} não suportada`);
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [params],
        });
      } else {
        throw err;
      }
    }
  }

  async function connect() {
    if (connecting) return;
    if (typeof window === 'undefined') return;

    const mobile = detectMobile();

    // Mobile without injected provider → redirect into MetaMask browser
    if (!window.ethereum && mobile) {
      window.location.href = METAMASK_DEEPLINK;
      return;
    }

    if (!window.ethereum) {
      setConnError('MetaMask não encontrado. Instale em metamask.io');
      return;
    }

    setConnecting(true);
    setConnError(null);

    try {
      const accs = await withTimeout(
        window.ethereum.request({ method: 'eth_requestAccounts' }),
        30_000,
        'MetaMask não respondeu. Abra o MetaMask e tente novamente.'
      );

      if (!accs?.length) throw new Error('Nenhuma conta autorizada no MetaMask.');

      const hex          = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChain = parseInt(hex, 16);

      setAddress(accs[0]);
      setChainId(currentChain);
      localStorage.setItem('ufm_address', accs[0]);

      if (currentChain !== 8453) {
        try { await switchNetwork(8453); } catch { /* banner shows */ }
      }
    } catch (err) {
      if (err.code === 4001) {
        setConnError(null);
      } else {
        setConnError(err.message);
      }
    } finally {
      setConnecting(false);
    }
  }

  const isConnected = Boolean(address);
  const isMainnet   = chainId === 1;
  const isBase      = chainId === 8453;
  const isSupported = SUPPORTED.includes(chainId ?? -1);
  const chainName   = chainId ? (NETWORK_NAMES[chainId] || `Chain ${chainId}`) : null;
  const switchToBase = () => switchNetwork(8453);

  return (
    <WalletContext.Provider value={{
      address, chainId, chainName,
      isConnected, isMainnet, isBase, isSupported,
      connecting, connError,
      isMobile, isInAppBrowser,
      connect, disconnect, switchNetwork, switchToBase,
    }}>
      {children}
    </WalletContext.Provider>
  );
}
