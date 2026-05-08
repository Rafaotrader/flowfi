'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import { useWallet } from './WalletProvider';
import { getNetworkInfo, SUPPORTED_NETWORKS } from './NetworkSelector';

const NAV_LINKS = [
  { href: '/',          label: 'Dashboard' },
  { href: '/pools',     label: 'Pools'     },
  { href: '/swap',      label: 'Swap'      },
  { href: '/bridge',    label: 'Bridge'    },
  { href: '/simulator', label: 'Simulador' },
  { href: '/positions', label: 'Posições'  },
];

const FLOWFI_URL = 'https://flowfy-neon.vercel.app';
const METAMASK_DEEPLINK = `https://metamask.app.link/dapp/flowfy-neon.vercel.app`;

export default function Navbar() {
  const pathname = usePathname();
  const {
    address, chainId, chainName,
    isConnected, isBase, isSupported,
    connecting, connError,
    isMobile, isInAppBrowser,
    connect, disconnect, switchNetwork,
  } = useWallet();

  const networkInfo = isConnected && chainId ? getNetworkInfo(chainId) : null;
  const shortAddr   = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';

  // Network dropdown
  const [netOpen,    setNetOpen]    = useState(false);
  const netRef = useRef(null);

  // Mobile menu
  const [mobileOpen, setMobileOpen] = useState(false);

  // Copy link state
  const [copied, setCopied] = useState(false);

  // Close network dropdown on outside click
  useEffect(() => {
    if (!netOpen) return;
    function handler(e) {
      if (netRef.current && !netRef.current.contains(e.target)) setNetOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [netOpen]);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(FLOWFI_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-white/[0.06]"
           style={{ background: 'rgba(4,4,15,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-glow-sm">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" fill="white" fillOpacity="0.9"/>
                <path d="M7 4L10 5.75V8.25L7 10L4 8.25V5.75L7 4Z" fill="white" fillOpacity="0.4"/>
              </svg>
            </div>
            <span className="font-bold text-white text-[15px] tracking-tight">Flowfy</span>
            <span className="text-[10px] font-semibold bg-violet-950/80 text-violet-400 border border-violet-800/60 rounded px-1.5 py-0.5 hidden sm:inline leading-none">
              BETA
            </span>
          </Link>

          {/* Nav Links — desktop only */}
          <div className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    active
                      ? 'text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                  }`}
                >
                  {active && <span className="absolute inset-0 rounded-lg bg-white/[0.07]" />}
                  <span className="relative">{label}</span>
                  {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-violet-500 rounded-full" />}
                </Link>
              );
            })}
          </div>

          {/* Right side: network + wallet + hamburger */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Network dropdown — hidden on mobile */}
            {isConnected && chainId && (
              <div className="relative hidden sm:block" ref={netRef}>
                <button
                  onClick={() => setNetOpen(v => !v)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
                    networkInfo
                      ? networkInfo.cls
                      : 'text-slate-400 border-white/[0.08] bg-white/[0.03] hover:border-white/20'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                  {networkInfo?.badge || chainName}
                  <svg className="w-3 h-3 opacity-60 ml-0.5" fill="none" viewBox="0 0 10 6">
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {netOpen && (
                  <div className="absolute right-0 top-full mt-1.5 bg-[#0d0d1e] border border-white/[0.08] rounded-xl p-1.5 min-w-[148px] shadow-2xl z-50">
                    {SUPPORTED_NETWORKS.map(net => {
                      const active = chainId === net.chainId;
                      return (
                        <button
                          key={net.chainId}
                          onClick={() => { switchNetwork(net.chainId).catch(() => {}); setNetOpen(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            active
                              ? net.cls
                              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-current' : 'bg-slate-700'}`} />
                          {net.name}
                          {active && <span className="ml-auto text-[10px] opacity-60">ativo</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Wallet button — desktop */}
            {isConnected ? (
              <button
                onClick={disconnect}
                title="Clique para desconectar"
                className="hidden sm:flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.14] px-3.5 py-2 rounded-xl text-sm transition-all duration-150"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-slate-200 font-mono text-[13px]">{shortAddr}</span>
              </button>
            ) : (
              <div className="hidden sm:flex flex-col items-end gap-1">
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="btn-primary text-sm px-4 py-2 min-w-[148px]"
                >
                  {connecting
                    ? <><span className="spinner-sm" />Conectando…</>
                    : <><span className="text-base leading-none">⬡</span>Conectar Carteira</>
                  }
                </button>
                {connError && !connecting && (
                  <p className="text-[11px] text-red-400 max-w-[200px] text-right leading-tight">{connError}</p>
                )}
              </div>
            )}

            {/* Hamburger — mobile only, 44×44 touch target */}
            <button
              onClick={() => setMobileOpen(v => !v)}
              aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
              className="md:hidden flex items-center justify-center w-11 h-11 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              style={{ touchAction: 'manipulation' }}
            >
              {mobileOpen ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M2 2l14 14M16 2L2 16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── Banners ── */}

        {/* In-app browser warning (WhatsApp / Instagram) */}
        {isInAppBrowser && (
          <div className="border-t border-amber-900/30 px-4 py-3 space-y-2.5"
               style={{ background: 'rgba(120,53,15,0.25)' }}>
            <p className="text-xs text-amber-300 text-center leading-snug">
              Para conectar sua carteira com segurança, abra no <strong>MetaMask</strong> ou <strong>Safari</strong>.
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <button
                onClick={() => { window.location.href = METAMASK_DEEPLINK; }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-700/50 text-amber-200 hover:border-amber-600 transition-colors"
                style={{ background: 'rgba(120,53,15,0.4)' }}
              >
                Abrir no MetaMask
              </button>
              <button
                onClick={handleCopyLink}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/[0.10] text-slate-300 hover:border-white/20 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                {copied ? '✓ Copiado!' : 'Copiar link'}
              </button>
            </div>
          </div>
        )}

        {/* MetaMask not found */}
        {connError && connError.includes('MetaMask não encontrado') && !isInAppBrowser && (
          <div className="bg-red-950/40 border-t border-red-900/30 px-4 py-2 text-center text-sm text-red-400">
            MetaMask não encontrado.{' '}
            {isMobile ? (
              <button
                onClick={() => { window.location.href = METAMASK_DEEPLINK; }}
                className="underline font-medium hover:text-red-300"
              >
                Abrir no MetaMask
              </button>
            ) : (
              <a href="https://metamask.io" target="_blank" rel="noopener noreferrer"
                 className="underline font-medium hover:text-red-300">
                Instale em metamask.io
              </a>
            )}
          </div>
        )}

        {/* Unsupported network */}
        {isConnected && !isSupported && chainName && (
          <div className="bg-amber-950/40 border-t border-amber-900/30 px-4 py-2 text-center text-xs text-amber-400">
            Rede <strong>{chainName}</strong> não suportada — conecte-se a Ethereum, Arbitrum, Optimism, Polygon ou Base.
          </div>
        )}

        {/* Suggest Base */}
        {isConnected && isSupported && !isBase && (
          <div className="bg-violet-950/30 border-t border-violet-900/20 px-4 py-1.5 text-center text-xs text-violet-300 flex items-center justify-center gap-3">
            <span>Use <strong className="text-violet-200">Base</strong> para pagar menos gas.</span>
            <button
              onClick={() => switchNetwork(8453).catch(() => {})}
              className="font-semibold underline hover:no-underline text-violet-400 hover:text-violet-300"
            >
              Trocar agora
            </button>
          </div>
        )}
      </nav>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,2,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer panel — slides in from right */}
          <div
            className="absolute right-0 top-0 bottom-0 w-72 flex flex-col animate-slide-right"
            style={{
              background: 'rgba(6,6,20,0.98)',
              borderLeft: '1px solid rgba(255,255,255,0.07)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 h-16 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" fill="white" fillOpacity="0.9"/>
                  </svg>
                </div>
                <span className="font-bold text-white text-[14px]">Flowfy</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {NAV_LINKS.map(({ href, label }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? 'text-white border border-violet-700/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                    }`}
                    style={active ? { background: 'rgba(124,58,237,0.12)' } : {}}
                  >
                    <span>{label}</span>
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />}
                  </Link>
                );
              })}
            </nav>

            {/* Wallet section */}
            <div className="px-4 py-5 border-t border-white/[0.06] space-y-3 shrink-0">
              {/* Network badge in drawer */}
              {isConnected && chainName && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${
                  networkInfo ? networkInfo.cls : 'text-slate-400 border-white/[0.08]'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                  {networkInfo?.name || chainName}
                  <span className="ml-auto text-[10px] opacity-60">rede atual</span>
                </div>
              )}

              {isConnected ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-white/[0.04] rounded-xl border border-white/[0.06]">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-slate-200 font-mono text-[13px]">{shortAddr}</span>
                    <span className="ml-auto text-[10px] text-emerald-400/60">conectado</span>
                  </div>
                  <button
                    onClick={() => { disconnect(); setMobileOpen(false); }}
                    className="w-full btn-outline text-sm py-2.5"
                  >
                    Desconectar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { connect(); setMobileOpen(false); }}
                    disabled={connecting}
                    className="w-full btn-primary text-sm py-3"
                    style={{ touchAction: 'manipulation' }}
                  >
                    {connecting
                      ? <><span className="spinner-sm" />Conectando…</>
                      : 'Conectar Carteira'
                    }
                  </button>
                  {connError && !connecting && (
                    <p className="text-[11px] text-red-400 text-center leading-tight">{connError}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
