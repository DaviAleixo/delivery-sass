import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bike, Store, Utensils, HelpCircle } from "lucide-react";

export default function SalesChannelsReport({ analyticsData = null }) {
  const { channels = [], _totalRevenue = 0, _totalOrders = 0, topChannelByRevenue = null } =
    analyticsData || {};

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const getIcon = (id) => {
    switch (id) {
      case "delivery":
        return <Bike className="w-4 h-4 text-emerald-700" />;
      case "takeaway":
        return <Store className="w-4 h-4 text-blue-700" />;
      case "table":
        return <Utensils className="w-4 h-4 text-amber-700" />;
      default:
        return <HelpCircle className="w-4 h-4 text-stone-600" />;
    }
  };

  const getBadgeStyle = (id) => {
    switch (id) {
      case "delivery":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "takeaway":
        return "bg-blue-50 text-blue-800 border-blue-200";
      case "table":
        return "bg-amber-50 text-amber-900 border-amber-200";
      default:
        return "bg-stone-50 text-stone-800 border-stone-200";
    }
  };

  const getProgressColor = (id) => {
    switch (id) {
      case "delivery":
        return "bg-emerald-600";
      case "takeaway":
        return "bg-blue-600";
      case "table":
        return "bg-amber-600";
      default:
        return "bg-stone-600";
    }
  };

  return (
    <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white overflow-hidden">
      <CardHeader className="bg-stone-50/70 border-b border-stone-200/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <Store className="w-4 h-4 text-stone-700" />
            <span>Origem das Vendas & Canais (Delivery vs Balcão vs Salão)</span>
          </CardTitle>
          <p className="text-xs text-stone-500 mt-0.5">
            Distribuição de faturamento, volume de pedidos e ticket médio por canal de atendimento
          </p>
        </div>
        {topChannelByRevenue && (
          <Badge variant="outline" className={`text-xs font-semibold px-2.5 py-0.5 w-fit ${getBadgeStyle(topChannelByRevenue.id)}`}>
            Canal Líder: {topChannelByRevenue.label.split(" ")[0]} ({topChannelByRevenue.percentage}%)
          </Badge>
        )}
      </CardHeader>
      <CardContent className="pt-4">
        {channels.length === 0 ? (
          <div className="h-[140px] flex flex-col items-center justify-center text-stone-400 gap-1.5">
            <Store className="w-8 h-8 stroke-1 text-stone-300" />
            <p className="text-xs font-medium">Nenhuma venda registrada nos canais no período</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className="p-3.5 rounded-xl border border-stone-200/80 bg-stone-50/40 hover:bg-stone-50/80 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center shadow-2xs">
                        {getIcon(ch.id)}
                      </div>
                      <span className="text-xs font-bold text-stone-900">{ch.label}</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] font-mono font-bold ${getBadgeStyle(ch.id)}`}>
                      {ch.percentage}%
                    </Badge>
                  </div>

                  <div className="space-y-1 my-2">
                    <div className="text-lg font-bold font-mono text-stone-900">
                      {formatMoney(ch.revenue)}
                    </div>
                    <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
                      <span>{ch.count} pedido{ch.count === 1 ? "" : "s"} ({ch.ordersPercentage}%)</span>
                      <span>Ticket: <strong className="font-mono text-stone-800">{formatMoney(ch.averageTicket)}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Barra de progresso */}
                <div className="w-full bg-stone-200/70 h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getProgressColor(ch.id)}`}
                    style={{ width: `${Math.min(100, Math.max(2, ch.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

