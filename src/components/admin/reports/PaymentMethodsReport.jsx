import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  QrCode,
  CreditCard,
  Banknote,
  Receipt,
  HelpCircle,
  TrendingUp,
  Award,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const METHOD_ICONS = {
  pix: QrCode,
  credit_card: CreditCard,
  cartao_credito: CreditCard,
  cartao_debito: CreditCard,
  banknote: Banknote,
  dinheiro: Banknote,
  receipt: Receipt,
  vale_refeicao: Receipt,
  help_circle: HelpCircle,
  outros: HelpCircle,
};

export default function PaymentMethodsReport({ analyticsData = null }) {
  const {
    methods = [],
    totalRevenue = 0,
    totalTransactions = 0,
    overallAverageTicket = 0,
    topMethodByRevenue = null,
    topMethodByVolume = null,
  } = analyticsData || {};

  const hasData = Array.isArray(methods) && methods.length > 0 && totalRevenue > 0;

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  // Tooltip customizado do Gráfico
  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-stone-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-stone-800 min-w-[190px]">
          <div className="font-bold flex items-center gap-2 text-stone-200 border-b border-stone-800 pb-1">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate">{item.label}</span>
          </div>
          <div className="flex justify-between items-center text-emerald-400 font-extrabold text-sm">
            <span>Faturamento:</span>
            <span className="font-mono">{formatMoney(item.revenue)}</span>
          </div>
          <div className="flex justify-between items-center text-stone-300">
            <span>Transações:</span>
            <span className="font-mono font-semibold">{item.count} un. ({item.txPercentage}%)</span>
          </div>
          <div className="flex justify-between items-center text-stone-400">
            <span>Ticket Médio:</span>
            <span className="font-mono">{formatMoney(item.averageTicket)}</span>
          </div>
          <div className="flex justify-between items-center text-stone-400 pt-1 border-t border-stone-800">
            <span>% do Total:</span>
            <span className="font-mono font-bold text-white">{item.percentage}%</span>
          </div>
        </div>
      );
    }
    return null;
  };

  const getMethodIcon = (method) => {
    const IconComponent = METHOD_ICONS[method.icon] || METHOD_ICONS[method.id] || HelpCircle;
    return <IconComponent className="w-4 h-4 shrink-0" />;
  };

  return (
    <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white overflow-hidden">
      {/* Cabeçalho do Card */}
      <CardHeader className="bg-stone-50/70 border-b border-stone-200/80 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-700" />
            <span>Faturamento por Método de Pagamento</span>
          </CardTitle>
          <p className="text-xs text-stone-500 mt-0.5">
            Detalhamento analítico por canal, quantidade de transações, ticket médio e representatividade
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-xs font-semibold bg-white text-stone-700 border-stone-300">
            {methods.length} {methods.length === 1 ? "método ativo" : "métodos ativos"}
          </Badge>
          <Badge className="text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            Total: {formatMoney(totalRevenue)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {!hasData ? (
          <div className="h-[240px] flex flex-col items-center justify-center text-stone-400 gap-2">
            <CreditCard className="w-10 h-10 stroke-1 text-stone-300" />
            <p className="text-sm font-medium">Nenhum pagamento registrado no período selecionado</p>
          </div>
        ) : (
          <>
            {/* 1. Cards de Destaque Executivo (Top Canais) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Líder em Faturamento */}
              <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-200 flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-amber-600" />
                    Maior Faturamento
                  </p>
                  <p className="text-sm font-bold text-stone-900 mt-1">
                    {topMethodByRevenue?.label || "—"}
                  </p>
                  <p className="text-xs font-mono font-semibold text-emerald-700 mt-0.5">
                    {formatMoney(topMethodByRevenue?.revenue || 0)} ({topMethodByRevenue?.percentage || 0}%)
                  </p>
                </div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: topMethodByRevenue?.color || "#059669" }}
                >
                  {topMethodByRevenue && getMethodIcon(topMethodByRevenue)}
                </div>
              </div>

              {/* Líder em Volume de Pedidos */}
              <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-200 flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    Maior Frequência
                  </p>
                  <p className="text-sm font-bold text-stone-900 mt-1">
                    {topMethodByVolume?.label || "—"}
                  </p>
                  <p className="text-xs font-mono font-semibold text-stone-700 mt-0.5">
                    {topMethodByVolume?.count || 0} pedidos ({topMethodByVolume?.txPercentage || 0}%)
                  </p>
                </div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: topMethodByVolume?.color || "#2563eb" }}
                >
                  {topMethodByVolume && getMethodIcon(topMethodByVolume)}
                </div>
              </div>

              {/* Ticket Médio Consolidado */}
              <div className="bg-stone-50 rounded-xl p-3.5 border border-stone-200 flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-stone-600" />
                    Ticket Médio Geral
                  </p>
                  <p className="text-sm font-bold font-mono text-stone-900 mt-1">
                    {formatMoney(overallAverageTicket)}
                  </p>
                  <p className="text-xs font-mono font-semibold text-stone-500 mt-0.5">
                    {totalTransactions} transações apuradas
                  </p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-stone-200 flex items-center justify-center text-stone-700 shrink-0">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* 2. Visualização Gráfica: Donut + Barras de Participação */}
            <div className="grid lg:grid-cols-12 gap-6 items-center pt-2">
              {/* Gráfico Donut de Participação */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center">
                <div className="h-[240px] w-full max-w-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={methods}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="revenue"
                      >
                        {methods.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] font-medium text-stone-400 text-center">
                  Distribuição relativa no faturamento total
                </p>
              </div>

              {/* Barras de Representatividade Relativa */}
              <div className="lg:col-span-7 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-2">
                  Participação por Canal no Faturamento
                </p>

                <div className="space-y-2.5">
                  {methods.map((m) => (
                    <div key={m.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-semibold text-stone-800">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: m.color }}
                          />
                          <span>{m.label}</span>
                        </span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-stone-900">{formatMoney(m.revenue)}</span>
                          <span className="text-stone-400">({m.percentage}%)</span>
                        </div>
                      </div>

                      {/* Barra de Progresso Visual */}
                      <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden flex">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(2, m.percentage))}%`,
                            backgroundColor: m.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Tabela Analítica Completa */}
            <div className="pt-2">
              <div className="rounded-xl border border-stone-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 text-stone-600 uppercase text-[10px] font-semibold border-b border-stone-200">
                      <tr>
                        <th className="py-2.5 px-4">Canal de Pagamento</th>
                        <th className="py-2.5 px-4 text-center">Transações</th>
                        <th className="py-2.5 px-4 text-center">% Volume</th>
                        <th className="py-2.5 px-4 text-right">Ticket Médio</th>
                        <th className="py-2.5 px-4 text-right">Faturamento</th>
                        <th className="py-2.5 px-4 text-right">% Receita</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 bg-white font-medium">
                      {methods.map((method) => (
                        <tr key={method.id} className="hover:bg-stone-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                                style={{ backgroundColor: method.color }}
                              >
                                {getMethodIcon(method)}
                              </span>
                              <div>
                                <span className="font-bold text-stone-900 block">{method.label}</span>
                                <span className="text-[10px] text-stone-400">Canal direto</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center font-mono font-semibold text-stone-800">
                            {method.count} un.
                          </td>

                          <td className="py-3 px-4 text-center font-mono text-stone-500">
                            {method.txPercentage}%
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-semibold text-stone-700">
                            {formatMoney(method.averageTicket)}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold text-stone-900">
                            {formatMoney(method.revenue)}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <span className={cn(
                              "font-mono font-bold px-2 py-0.5 rounded-md border text-[11px]",
                              method.badgeClass
                            )}>
                              {method.percentage}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    {/* Linha de Totalização Consolidada */}
                    <tfoot className="bg-stone-50/90 border-t-2 border-stone-200 font-bold text-stone-900">
                      <tr>
                        <td className="py-2.5 px-4 text-stone-700 uppercase tracking-wide text-[11px]">
                          Total Consolidado
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono">
                          {totalTransactions} un.
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-stone-500">
                          100%
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-stone-800">
                          {formatMoney(overallAverageTicket)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-emerald-800 text-sm">
                          {formatMoney(totalRevenue)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-emerald-800">
                          100%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

