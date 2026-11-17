import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, TrendingUp, TrendingDown, Clock } from "lucide-react";

export default function DayOfWeekReport({ analyticsData = null, cutoffTime = "04:00" }) {
  const { days = [], bestDay = null, slowestDay = null, totalRevenue = 0, totalOrders = 0 } =
    analyticsData || {};

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);

  // Calcula % do fim de semana (Sex, Sáb, Dom)
  const weekendRevenue = days
    .filter((d) => d.index === 5 || d.index === 6 || d.index === 0)
    .reduce((sum, d) => sum + d.revenue, 0);

  const weekendPercentage =
    totalRevenue > 0 ? ((weekendRevenue / totalRevenue) * 100).toFixed(1) : "0";

  return (
    <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white overflow-hidden">
      <CardHeader className="bg-stone-50/70 border-b border-stone-200/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-stone-700" />
            <span>Padrão Semanal de Vendas (Segunda a Domingo)</span>
          </CardTitle>
          <p className="text-xs text-stone-500 mt-0.5">
            Distribuição consolidada do faturamento e pedidos por dia da semana para escala e planejamento
          </p>
        </div>

        {/* Badges de Destaque */}
        <div className="flex items-center gap-2 flex-wrap">
          {cutoffTime && (
            <Badge
              variant="outline"
              className="text-[11px] font-medium bg-stone-100/90 text-stone-700 border-stone-200 flex items-center gap-1"
              title={`Horário de corte do dia comercial: pedidos até ${cutoffTime} pertencem à noite anterior`}
            >
              <Clock className="w-3 h-3 text-stone-500" />
              <span>Corte: {cutoffTime}</span>
            </Badge>
          )}
          {bestDay && (
            <Badge
              variant="outline"
              className="text-[11px] font-semibold bg-emerald-50 text-emerald-800 border-emerald-200 flex items-center gap-1"
            >
              <TrendingUp className="w-3 h-3 text-emerald-600" />
              <span>Pico: {bestDay.short} ({formatMoney(bestDay.revenue)})</span>
            </Badge>
          )}
          {slowestDay && (
            <Badge
              variant="outline"
              className="text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200 flex items-center gap-1"
            >
              <TrendingDown className="w-3 h-3 text-amber-600" />
              <span>Menor: {slowestDay.short}</span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {totalOrders === 0 ? (
          <div className="h-[140px] flex flex-col items-center justify-center text-stone-400 gap-1.5">
            <Calendar className="w-8 h-8 stroke-1 text-stone-300" />
            <p className="text-xs font-medium">Nenhum pedido no período para mapear os dias da semana</p>
          </div>
        ) : (
          <>
            {/* Grid dos 7 dias */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {days.map((d) => {
                const isBest = bestDay && bestDay.index === d.index && d.revenue > 0;
                const isSlowest = slowestDay && slowestDay.index === d.index && d.revenue > 0;
                const heightPercent = Math.min(100, Math.max(8, (d.revenue / maxRevenue) * 100));

                return (
                  <div
                    key={d.index}
                    className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
                      isBest
                        ? "bg-emerald-50/70 border-emerald-300 shadow-2xs"
                        : isSlowest
                        ? "bg-amber-50/50 border-amber-200"
                        : "bg-stone-50/40 border-stone-200/80 hover:bg-stone-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-bold text-stone-800">{d.short}</span>
                        {isBest ? (
                          <span className="text-[9px] font-extrabold uppercase px-1 py-0.2 rounded bg-emerald-600 text-white">
                            Pico
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-stone-400 font-medium">
                            {d.percentage}%
                          </span>
                        )}
                      </div>

                      <div className="text-xs sm:text-sm font-bold font-mono text-stone-900 truncate">
                        {formatMoney(d.revenue)}
                      </div>
                      <div className="text-[10px] text-stone-500 font-medium">
                        {d.ordersCount} ped. • Méd: {formatMoney(d.averageTicket)}
                      </div>
                    </div>

                    {/* Mini Barra Vertical / Proporcional */}
                    <div className="w-full bg-stone-200/60 h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isBest ? "bg-emerald-600" : isSlowest ? "bg-amber-500" : "bg-stone-600"
                        }`}
                        style={{ width: `${heightPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Dica Estratégica / Inteligência Operacional */}
            <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-600 gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span>
                  O fim de semana (Sexta a Domingo) representa <strong>{weekendPercentage}%</strong> ({formatMoney(weekendRevenue)}) do faturamento total do período.
                </span>
              </div>
              {slowestDay && (
                <span className="text-stone-500 font-medium text-[11px]">
                  Sugestão: Criar promoção direcionada para <strong>{slowestDay.name}</strong> para alavancar os dias de menor movimento.
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

