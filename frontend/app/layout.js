import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '../components/common/Navbar';
import WalletProvider from '../components/common/WalletProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata = {
  title: 'Flowfy — Liquidity made simple.',
  description: 'Seu dinheiro trabalhando em pools DeFi. Rankings de pools em tempo real, simulador de retorno, swap integrado e gestão completa de posições.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.variable} font-[var(--font-inter)] text-slate-100 min-h-screen antialiased`}>
        <WalletProvider>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-safe">
            {children}
          </main>
        </WalletProvider>
      </body>
    </html>
  );
}
