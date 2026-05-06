'use client';
import { useWallet } from './WalletProvider';

export const SUPPORTED_NETWORKS = [
  { chainId: 1,     name: 'Ethereum', badge: 'ETH',  cls: 'text-indigo-400  border-indigo-800  bg-indigo-950/40'  },
  { chainId: 42161, name: 'Arbitrum', badge: 'ARB',  cls: 'text-sky-400     border-sky-800     bg-sky-950/40'     },
  { chainId: 10,    name: 'Optimism', badge: 'OP',   cls: 'text-red-400     border-red-800     bg-red-950/40'     },
  { chainId: 137,   name: 'Polygon',  badge: 'POL',  cls: 'text-violet-400  border-violet-800  bg-violet-950/40'  },
  { chainId: 8453,  name: 'Base',     badge: 'BASE', cls: 'text-blue-400    border-blue-800    bg-blue-950/40'    },
];

export const SUPPORTED_CHAIN_IDS = SUPPORTED_NETWORKS.map(n => n.chainId);

export function getNetworkInfo(chainId) {
  return SUPPORTED_NETWORKS.find(n => n.chainId === chainId) || null;
}

export default function NetworkSelector({ selectedChainId, onSelect, className = '' }) {
  const { isConnected, switchNetwork } = useWallet();

  async function handleSelect(chainId) {
    onSelect(chainId);
    if (isConnected && chainId !== selectedChainId) {
      switchNetwork(chainId).catch(() => {
        // silencia erro de rejeição pelo usuário
      });
    }
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {SUPPORTED_NETWORKS.map(net => {
        const active = selectedChainId === net.chainId;
        return (
          <button
            key={net.chainId}
            onClick={() => handleSelect(net.chainId)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              active
                ? net.cls
                : 'text-gray-500 border-gray-800 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            <span className="font-bold">{net.badge}</span>
            <span className="hidden sm:inline">{net.name}</span>
          </button>
        );
      })}
    </div>
  );
}
