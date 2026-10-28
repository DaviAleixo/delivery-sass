import React from "react";
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Percent, TrendingUp, Receipt, DollarSign, Calendar, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ServiceFeeAccumulatedChart({
  data = [],
  totalServiceFee = 0,
  totalSessionsCount = 0,
  avgServiceFee = 0,
  serviceFeeRate = 10,
  isEnabled = true,
  isHourly = false,
}) {
  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const hasData = Array.isArray(data) && data.some((d) => d.dailyServiceFee > 0 || d.cumulativeServiceFee > 0);

  // Tooltip customizado elegante com foco na acumulação
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-stone-900 text-white p-3.5 rounded-2xl shadow-2xl text-xs space-y-2 border border-stone-800 min-w-[210px]">
          <div className="font-bold flex items-center justify-between text-stone-300 border-b border-stone-800 pb-1.5">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isHourly ? `Horário: ${label}` : (item.dateKey?.split("-").reverse().join("/") || label)}</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 font-bold border border-emerald-800">
              {serviceFeeRate}%
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center text-stone-400 text-[11px]">
              <span>Arrecadado no {isHourly ? "horário" : "dia"}:</span>
              <span className="font-bold text-stone-200">{formatMoney(item.dailyServiceFee)}</span>
            </div>

            <div className="flex justify-between items-center text-stone-400 text-[11px]">
              <span>Mesas c/ serviço:</span>
              <span className="font-bold text-stone-200">{item.sessionsCount}</span>
            </div>

            <div className="pt-1.5 mt-1 border-t border-stone-800 flex justify-between items-baseline text-emerald-400">
              <span className="text-[11px] font-semibold">Total Acumulado:</span>
              <span className="font-black text-sm">{formatMoney(item.cumulativeServiceFee)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-0 shadow-md bg-white overflow-hidden">
      {/* Cabeçalho do Card */}
      <CardHeader className="bg-gradient-to-r from-emerald-50/50 via-stone-50 to-white border-b border-stone-100 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-emerald-100 text-emerald-700">
                <Percent className="w-4 h-4" />
              </div>
              <CardTitle className="text-base font-black text-gray-900">
                Valor Acumulado de Taxas de Serviço (% Garçom / Salão)
              </CardTitle>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              {isHourly
                ? "Evolução horária e valor acumulado arrecadado no expediente de hoje"
                : "Curva acumulada de retenção de serviço e comissões arrecadadas no período selecionado"}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <Badge
              variant="outline"
              className={`text-xs font-bold px-2.5 py-1 rounded-xl flex items-center gap-1.5 ${
                isEnabled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-stone-100 text-stone-600 border-stone-200"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isEnabled ? "bg-emerald-500 animate-pulse" : "bg-stone-400"
                }`}
              />
              <span>{isEnabled ? `Taxa Ativa (${serviceFeeRate}%)` : "Desativado nas Configurações"}</span>
            </Badge>

            <Badge className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-3 py-1 rounded-xl shadow-sm">
              Acumulado: {formatMoney(totalServiceFee)}
            </Badge>
          </div>
        </div>

        {/* 3 Mini-Cards de Métricas da Taxa de Serviço */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
          <div className="bg-white p-3 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Total de Serviço Acumulado
              </p>
              <p className="text-lg font-black text-emerald-700 mt-0.5">
                {formatMoney(totalServiceFee)}
              </p>
              <p className="text-[10px] text-stone-400">Total gerado no período</p>
            </div>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-stone-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Comandas c/ Serviço
              </p>
              <p className="text-lg font-black text-stone-900 mt-0.5">
                {totalSessionsCount} {totalSessionsCount === 1 ? "mesa" : "mesas"}
              </p>
              <p className="text-[10px] text-stone-400">Atendimentos liquidados</p>
            </div>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Receipt className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-stone-100 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                Média por Mesa
              </p>
              <p className="text-lg font-black text-purple-700 mt-0.5">
                {formatMoney(avgServiceFee)}
              </p>
              <p className="text-[10px] text-stone-400">Gorjeta média recebida</p>
            </div>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Conteúdo do Gráfico */}
      <CardContent className="pt-5">
        {!hasData ? (
          <div className="h-[280px] flex flex-col items-center justify-center text-stone-400 gap-2">
            <Percent className="w-10 h-10 stroke-1 text-stone-300" />
            <p className="text-sm font-semibold text-stone-600">
              Nenhum valor de taxa de serviço arrecadado neste período
            </p>
            <p className="text-xs text-stone-400 text-center max-w-md">
              Quando comandas forem liquidadas com a taxa de serviço configurada ({serviceFeeRate}%),
              a curva acumulada e o montante progressivo aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 15, right: 15, left: 0, bottom: 25 }}
              >
                <defs>
                  <linearGradient id="serviceCumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
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
                  tickFormatter={(val) =>
                    `R$${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`
                  }
                />

                <Tooltip content={<CustomTooltip />} />

                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: 12, fontSize: 11, fontWeight: "bold" }}
                />

                {/* Barra do valor diário arrecadado */}
                <Bar
                  dataKey="dailyServiceFee"
                  name={isHourly ? "No Horário (R$)" : "No Dia (R$)"}
                  fill="#94a3b8"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                  opacity={0.65}
                />

                {/* Área da curva acumulada */}
                <Area
                  type="monotone"
                  dataKey="cumulativeServiceFee"
                  name="Acumulado (R$)"
                  stroke="#059669"
                  strokeWidth={3}
                  fill="url(#serviceCumulativeGradient)"
                  activeDot={{
                    r: 6,
                    stroke: "#047857",
                    strokeWidth: 2,
                    fill: "#ffffff",
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
