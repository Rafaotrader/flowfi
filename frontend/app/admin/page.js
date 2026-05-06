'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

async function fetchAdmin(path, secret) {
  const res = await fetch(`${API}${path}`, { headers: { 'x-admin-secret': secret } });
  if (!res.ok) throw new Error('Acesso negado');
  return res.json();
}

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [error, setError] = useState(null);

  async function load(s) {
    try {
      const [m, r] = await Promise.all([
        fetchAdmin('/api/admin/metrics', s),
        fetchAdmin('/api/admin/revenue/daily?days=30', s),
      ]);
      setMetrics(m);
      setDailyRevenue(r.revenue);
      setAuthed(true);
    } catch {
      setError('Segredo inválido');
    }
  }

  if (!authed) {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="card space-y-4">
          <h2 className="font-semibold">Acesso Admin</h2>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Admin secret"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={() => load(secret)} className="btn-primary w-full">Entrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: 'Total Usuários', value: metrics.total_users },
            { label: 'Posições Ativas', value: metrics.active_positions },
            { label: 'Receita Total', value: `$${parseFloat(metrics.total_revenue_usd || 0).toFixed(2)}` },
            { label: 'Receita Hoje', value: `$${parseFloat(metrics.revenue_today_usd || 0).toFixed(2)}` },
            { label: 'Receita Este Mês', value: `$${parseFloat(metrics.revenue_month_usd || 0).toFixed(2)}` },
            { label: 'Total Harvests', value: metrics.total_harvests },
          ].map((stat) => (
            <div key={stat.label} className="card text-center">
              <p className="stat-label">{stat.label}</p>
              <p className="stat-value mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {dailyRevenue.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Receita Diária (últimos 30 dias)</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {dailyRevenue.map((day) => (
              <div key={day.date} className="flex justify-between items-center py-2 border-b border-gray-800 text-sm">
                <span className="text-gray-400">{new Date(day.date).toLocaleDateString('pt-BR')}</span>
                <span className="text-white font-medium">${parseFloat(day.revenue_usd || 0).toFixed(2)}</span>
                <span className="text-gray-500">{day.harvest_count} harvests</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
