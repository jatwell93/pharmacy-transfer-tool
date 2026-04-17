import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// PharmIQ brand hex colours — must be hex literals (CSS variables do not work in SVG fill)
const CHART_COLOURS = ['#0F766E', '#D97706', '#14B8A6', '#B45309', '#0D5D5A'];

interface DeadStockChartProps {
  stores: Array<{ name: string; totalUnits: number }>;
}

interface LabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  name: string;
  value: number;
}

function renderLabel({ cx, cy, midAngle, outerRadius, name, value }: LabelProps) {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 30;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  // Truncate store names longer than 20 chars with ellipsis
  const displayName = name.length > 20 ? name.slice(0, 20) + '...' : name;

  return (
    <text
      x={x}
      y={y}
      fill="var(--color-text-secondary)"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={12}
    >
      {`${displayName}: ${value.toLocaleString()}`}
    </text>
  );
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  total: number;
}

function CustomTooltip({ active, payload, total }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-light)',
        borderRadius: '8px',
        fontSize: '13px',
        color: 'var(--color-text-primary)',
        padding: '8px 12px',
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{name}</p>
      <p>{value.toLocaleString()} units</p>
      <p style={{ color: 'var(--color-text-secondary)' }}>{pct}% of total</p>
    </div>
  );
}

export function DeadStockChart({ stores }: DeadStockChartProps) {
  // Only render slices for stores with dead stock units
  const data = stores.filter(s => s.totalUnits > 0);

  // Empty state handled by parent UploadPage (per D-10); return null here
  if (data.length === 0) return null;

  const total = data.reduce((sum, s) => sum + s.totalUnits, 0);

  return (
    <div className="min-h-[300px]">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart style={{ overflow: 'visible' }}>
          <Pie
            data={data}
            dataKey="totalUnits"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={renderLabel}
            isAnimationActive={false}
          >
            {data.map((_entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CHART_COLOURS[index % CHART_COLOURS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            content={(props) => (
              <CustomTooltip
                active={props.active}
                payload={props.payload as TooltipPayloadEntry[] | undefined}
                total={total}
              />
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
