import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Calendar } from "lucide-react";

export default function DailySalesChart({ data = [] }) {
  const hasData = Array.isArray(data) && data.some((d) => d.revenue > 0 || d.ordersCount > 0);

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  // Tooltip customizado elegante
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-stone-900 text-white p-3 rounded-2xl shadow-xl text-xs space-y-1.5 border border-stone-800">
          <div className="font-bold flex items-center gap-1.5 text-stone-300 border-b border-stone-800 pb-1">
            <Calendar className="w-3.5 h-3.5 text-rose-400" />
            <span>{item.dateKey ? item.dateKey.split("-").reverse().join("/") : label}</span>
          </div>
          <div className="flex justify-between gap-4 text-emerald-400 font-extrabold text-sm">
            <span>Faturamento:</span>
            <span>{formatMoney(item.revenue)}</span>
          </div>
          <div className="flex justify-between gap-4 text-stone-300 font-medium">
            <span>Pedidos:</span>
            <span>{item.ordersCount}</span>
          </div>
          <div className="flex justify-between gap-4 text-stone-400">
            <span>Ticket Médio:</span>
            <span>{formatMoney(item.averageTicket)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full">
      {!hasData ? (
        <div className="h-[300px] flex flex-col items-center justify-center text-stone-400 gap-2">
          <TrendingUp className="w-10 h-10 stroke-1 text-stone-300" />
          <p className="text-sm font-medium">Nenhum faturamento registrado no período</p>
        </div>
      ) : (
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 15, right: 10, left: 0, bottom: 25 }}
            >
              <defs>
                <linearGradient id="dailyBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dc2626" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="displayDate"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                interval="preserveStartEnd"
                tickMargin={8}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `R$${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="revenue"
                fill="url(#dailyBarGradient)"
                radius={[6, 6, 0, 0]}
                name="Faturamento"
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
