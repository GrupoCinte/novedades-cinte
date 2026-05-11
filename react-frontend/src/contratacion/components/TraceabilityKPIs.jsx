import { LineChart, Line, ResponsiveContainer } from 'recharts';

const KPI_CONFIG_TRAZABILIDAD = [
  { key: 'active', label: 'Ofertas Activas', tone: 'from-cinte-primary/50 to-cinte-cyan/20' },
  { key: 'contacted', label: 'En Contactacion', tone: 'from-cinte-cyan/50 to-cinte-purple/20' },
  {
    key: 'slaAlerts',
    label: 'Alertas tiempo (>8h)',
    tone: 'from-cinte-purple/50 to-indigo-300/15',
    toneWarn: 'from-red-500/45 to-orange-500/25',
  },
];

const KPI_CONFIG_HISTORICO = [
  { key: 'finalized', label: 'Historico', tone: 'from-cinte-green/50 to-emerald-300/15' },
];

function buildSparkline(baseValue = 0) {
  const safe = Number(baseValue) || 0;
  return Array.from({ length: 8 }).map((_, idx) => ({
    x: idx,
    y: Math.max(0, Math.round(safe * (0.8 + ((idx % 3) * 0.08)))),
  }));
}

function KpiGlassCard({ label, value, sparkline, suffix = '', tone, warn }) {
  return (
    <div className={`surface-panel p-4 ${warn ? 'ring-1 ring-[rgba(255,107,107,0.45)]' : ''}`}>
      <div className={`pointer-events-none -mb-2 -mt-4 h-10 rounded-xl bg-gradient-to-r ${tone} opacity-70 blur-xl`} />
      <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="kpi-value mt-1 text-2xl">
        {value}
        {suffix}
      </p>
      <div className="mt-3 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkline}>
            <Line
              type="monotone"
              dataKey="y"
              stroke="#08bdc6"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * variant:
 * - trazabilidad: KPIs del flujo activo (sin contador Historico; ese va en modulo Historico)
 * - historico: solo KPI Historico (registros que cuentan como cerrados/historico en metrics)
 */
export default function TraceabilityKPIs({ metrics, variant = 'trazabilidad' }) {
  const config = variant === 'historico' ? KPI_CONFIG_HISTORICO : KPI_CONFIG_TRAZABILIDAD;
  const gridClass =
    variant === 'historico'
      ? 'grid grid-cols-1 gap-4 md:max-w-md'
      : 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

  return (
    <section className={`${gridClass} font-body`}>
      {config.map((kpi) => {
        const raw = metrics[kpi.key] ?? 0;
        const isSla = kpi.key === 'slaAlerts';
        const tone =
          isSla && raw > 0 && kpi.toneWarn ? kpi.toneWarn : kpi.tone;
        return (
          <KpiGlassCard
            key={kpi.key}
            label={kpi.label}
            value={raw}
            suffix={kpi.suffix || ''}
            sparkline={buildSparkline(metrics[kpi.key])}
            tone={tone}
            warn={isSla && raw > 0}
          />
        );
      })}
    </section>
  );
}
