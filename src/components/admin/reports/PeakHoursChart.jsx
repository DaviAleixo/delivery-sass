import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Clock, Flame, Users } from "lucide-react";

export default function PeakHoursChart({ data = [], peakHourInfo = null }) {
  const hasOrders = Array.isArray(data) && data.some((d) => d.ordersCount > 0);

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      const isPeak = peakHourInfo && item.hour === peakHourInfo.hour && item.ordersCount > 0;
      return (
        <div className="bg-stone-900 text-white p-3 rounded-2xl shadow-xl text-xs space-y-1.5 border border-stone-800">
          <div className="font-bold flex items-center justify-between gap-3 text-stone-300 border-b border-stone-800 pb-1">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{item.range}</span>
            </span>
            {isPeak && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-black flex items-center gap-0.5">
                <Flame className="w-3 h-3 text-amber-400" /> PICO
              </span>
            )}
          </div>
          <div className="flex justify-between gap-4 text-amber-400 font-extrabold text-sm">
            <span>Pedidos:</span>
            <span>{item.ordersCount} pedidos</span>
          </div>
          <div className="flex justify-between gap-4 text-stone-300 font-medium">
            <span>Faturamento:</span>
            <span>{formatMoney(item.revenue)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full space-y-4">
      {/* Banner de Destaque do Horário Nobre */}
      {hasOrders && peakHourInfo && peakHourInfo.ordersCount > 0 && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-amber-200/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-sm">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 block">
                Horário de Pico da Loja
              </span>
              <span className="text-sm font-extrabold text-stone-900">
                {peakHourInfo.label}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-base font-black text-amber-700 block">
              {peakHourInfo.ordersCount} pedidos
            </span>
            <span className="text-[11px] font-semibold text-stone-500">
              {formatMoney(peakHourInfo.revenue)} faturados
            </span>
          </div>
        </div>
      )}

      {!hasOrders ? (
        <div className="h-[280px] flex flex-col items-center justify-center text-stone-400 gap-2">
          <Clock className="w-10 h-10 stroke-1 text-stone-300" />
          <p className="text-sm font-medium">Nenhum pedido no período para mapear horários de pico</p>
        </div>
      ) : (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                interval={1}
                tickMargin={6}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="ordersCount" radius={[5, 5, 0, 0]} maxBarSize={30}>
                {data.map((entry, index) => {
                  const isPeak =
                    peakHourInfo &&
                    entry.hour === peakHourInfo.hour &&
                    entry.ordersCount > 0;
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={isPeak ? "#f59e0b" : "#cbd5e1"}
                      className="transition-colors hover:fill-amber-600"
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
