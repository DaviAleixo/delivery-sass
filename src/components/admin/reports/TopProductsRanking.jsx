import React, { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Award } from "lucide-react";

export default function TopProductsRanking({ analyticsData = null }) {
  const [sortBy, setSortBy] = useState("revenue"); // "revenue" | "quantity"
  const { topProducts = [], totalItemsSold = 0, totalProductsRevenue = 0, allProductsCount = 0 } =
    analyticsData || {};

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const displayedProducts = useMemo(() => {
    if (!Array.isArray(topProducts) || topProducts.length === 0) return [];
    const list = [...topProducts];
    if (sortBy === "quantity") {
      return list.sort((a, b) => b.quantity - a.quantity);
    }
    return list.sort((a, b) => b.revenue - a.revenue);
  }, [topProducts, sortBy]);

  const maxVal = useMemo(() => {
    if (displayedProducts.length === 0) return 1;
    return sortBy === "quantity"
      ? Math.max(...displayedProducts.map((p) => p.quantity), 1)
      : Math.max(...displayedProducts.map((p) => p.revenue), 1);
  }, [displayedProducts, sortBy]);

  const getPositionBadge = (index) => {
    switch (index) {
      case 0:
        return "bg-amber-100 text-amber-900 border-amber-300 font-extrabold";
      case 1:
        return "bg-stone-200 text-stone-800 border-stone-300 font-bold";
      case 2:
        return "bg-orange-100 text-orange-900 border-orange-200 font-bold";
      default:
        return "bg-stone-100 text-stone-600 border-stone-200";
    }
  };

  const getAbcBadge = (abcClass) => {
    switch (abcClass) {
      case "A":
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
      case "B":
        return "bg-blue-50 text-blue-800 border-blue-200";
      case "C":
      default:
        return "bg-stone-50 text-stone-700 border-stone-200";
    }
  };

  return (
    <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white overflow-hidden">
      <CardHeader className="bg-stone-50/70 border-b border-stone-200/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-600" />
            <span>Top Produtos Mais Vendidos & Curva ABC</span>
          </CardTitle>
          <p className="text-xs text-stone-500 mt-0.5">
            Ranking dos itens campeões de venda com classificação por representatividade no faturamento
          </p>
        </div>

        {/* Toggle de ordenação */}
        <div className="flex items-center gap-1 bg-stone-200/80 p-0.5 rounded-lg border border-stone-300 text-xs w-fit">
          <button
            type="button"
            onClick={() => setSortBy("revenue")}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              sortBy === "revenue"
                ? "bg-white text-stone-900 shadow-2xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Por Faturamento (R$)
          </button>
          <button
            type="button"
            onClick={() => setSortBy("quantity")}
            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
              sortBy === "quantity"
                ? "bg-white text-stone-900 shadow-2xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            Por Quantidade (Un.)
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {displayedProducts.length === 0 ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-stone-400 gap-2">
            <Package className="w-10 h-10 stroke-1 text-stone-300" />
            <p className="text-xs font-medium">Nenhum produto vendido no período selecionado</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayedProducts.map((p, idx) => {
              const currentVal = sortBy === "quantity" ? p.quantity : p.revenue;
              const barWidth = Math.min(100, Math.max(3, (currentVal / maxVal) * 100));

              return (
                <div
                  key={p.id || idx}
                  className="p-2.5 rounded-xl border border-stone-200/70 hover:bg-stone-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  {/* Posição e Nome */}
                  <div className="flex items-center gap-2.5 min-w-0 sm:w-1/2">
                    <span
                      className={`w-6 h-6 rounded-md border flex items-center justify-center text-[11px] shrink-0 font-mono ${getPositionBadge(
                        idx
                      )}`}
                    >
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                          {p.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 font-mono font-bold ${getAbcBadge(
                            p.abcClass
                          )}`}
                          title={`Curva ABC: Classe ${p.abcClass}`}
                        >
                          Classe {p.abcClass}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-stone-400 font-medium block truncate">
                        {p.category} • Preço Médio: {formatMoney(p.averageUnitPrice)}
                      </span>
                    </div>
                  </div>

                  {/* Barra e Métricas */}
                  <div className="flex items-center gap-4 sm:w-1/2 justify-between sm:justify-end">
                    <div className="w-24 sm:w-32 bg-stone-100 h-2 rounded-full overflow-hidden shrink-0 hidden md:block">
                      <div
                        className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs sm:text-sm font-bold font-mono text-stone-900">
                        {sortBy === "quantity" ? `${p.quantity} un.` : formatMoney(p.revenue)}
                      </div>
                      <div className="text-[10px] text-stone-500 font-mono">
                        {sortBy === "quantity"
                          ? formatMoney(p.revenue)
                          : `${p.quantity} un. (${p.percentage}%)`}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Rodapé informativo */}
            <div className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 font-medium gap-1">
              <span>
                Exibindo top {displayedProducts.length} itens de {allProductsCount} produtos com saída no período.
              </span>
              <span>
                Total comercializado: <strong className="font-mono text-stone-800">{totalItemsSold} un.</strong> ({formatMoney(totalProductsRevenue)})
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

