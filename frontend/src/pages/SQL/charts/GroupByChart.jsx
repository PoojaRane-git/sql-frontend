import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function GroupByChart({ activeRows, stepColumns }) {
  // Ensure data exists
  if (!activeRows || activeRows.length === 0) return null;

  // Find columns and ensure the numeric column is actually a Number type for Recharts
  const numCol = stepColumns.find(c => typeof activeRows[0]?.[c] === 'number') || stepColumns[1] || stepColumns[0];
  const catCol = stepColumns.find(c => c !== numCol) || stepColumns[0];

  // Clean data: Recharts needs actual numbers, not strings
  const cleanData = activeRows.map(row => ({
    ...row,
    [numCol]: Number(row[numCol]) || 0
  }));

  return (
    <div style={{ width: '100%', height: '250px', minHeight: '250px', marginTop: '20px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={cleanData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey={catCol} 
            axisLine={false} 
            tickLine={false} 
            fontSize={12} 
            tick={{fill: '#64748b'}}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            fontSize={12} 
            tick={{fill: '#64748b'}}
          />
          <RechartsTooltip 
            cursor={{fill: '#f8fafc'}}
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          />
          <Bar dataKey={numCol} fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}