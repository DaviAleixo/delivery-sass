import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, ChevronDown, ChevronUp, Plus, Minus, Equal, ArrowRight } from "lucide-react";

export default function FinancialBreakdownStrip({ data = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    grossProducts = 0,
    deliveryFees = 0,
    serviceFees = 0,
    discounts = 0,
    cashbacks = 0,
    netRevenue = 0,
    canceledRevenue = 0,
  } = data || {};

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const _totalDeductions = discounts + cashbacks;
  const _totalAdditions = deliveryFees + serviceFees;

  return (
    <Card className="border border-stone-200/90 rounded-2xl shadow-2xs bg-white overflow-hidden transition-all">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-3 bg-stone-50/70 hover:bg-stone-50 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 select-none border-b border-stone-200/60"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-stone-200/80 flex items-center justify-center text-stone-700">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-xs font-bold text-stone-900 block">
              Composição Financeira das Vendas (DRE Simplificada)
            </span>
            <span className="text-[11px] text-stone-500 font-medium">
              Entenda a ponte exata entre o faturamento bruto dos itens e o valor líquido apurado
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold">
            <span className="text-stone-500">Bruto: {formatMoney(grossProducts)}</span>
            <ArrowRight className="w-3 h-3 text-stone-400" />
            <span className="text-emerald-700 font-bold">Líquido: {formatMoney(netRevenue)}</span>
          </div>
          <button
            type="button"
            className="w-6 h-6 rounded-md border border-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-white"
          >
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <CardContent className="p-4 bg-white animate-in fade-in slide-in-from-top-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* 1. Produtos Brutos */}
            <div className="p-3 rounded-xl border border-stone-200 bg-stone-50/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                (+) Produtos Brutos
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-stone-900 block mt-1">
                {formatMoney(grossProducts)}
              </span>
              <span className="text-[10px] text-stone-400">Total de itens do cardápio</span>
            </div>

            {/* 2. Taxas de Entrega */}
            <div className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/30">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                <Plus className="w-2.5 h-2.5 text-emerald-600" /> Fretes Delivery
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-emerald-900 block mt-1">
                {formatMoney(deliveryFees)}
              </span>
              <span className="text-[10px] text-emerald-700/80">Recolhido de fretes</span>
            </div>

            {/* 3. Taxas de Serviço */}
            <div className="p-3 rounded-xl border border-amber-100 bg-amber-50/30">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                <Plus className="w-2.5 h-2.5 text-amber-600" /> Taxas de Serviço
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-amber-900 block mt-1">
                {formatMoney(serviceFees)}
              </span>
              <span className="text-[10px] text-amber-700/80">Gorjetas / 10% de mesas</span>
            </div>

            {/* 4. Cupons & Descontos */}
            <div className="p-3 rounded-xl border border-rose-100 bg-rose-50/30">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1">
                <Minus className="w-2.5 h-2.5 text-rose-600" /> Descontos & Cupons
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-rose-900 block mt-1">
                -{formatMoney(discounts)}
              </span>
              <span className="text-[10px] text-rose-700/80">Abatimentos promocionais</span>
            </div>

            {/* 5. Cashback Utilizado */}
            <div className="p-3 rounded-xl border border-orange-100 bg-orange-50/30">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-800 flex items-center gap-1">
                <Minus className="w-2.5 h-2.5 text-orange-600" /> Cashback Usado
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-orange-900 block mt-1">
                -{formatMoney(cashbacks)}
              </span>
              <span className="text-[10px] text-orange-700/80">Créditos resgatados</span>
            </div>

            {/* 6. Faturamento Líquido Final */}
            <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50/70 shadow-2xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-1">
                <Equal className="w-2.5 h-2.5 text-emerald-700" /> Líquido Apurado
              </span>
              <span className="text-sm sm:text-base font-extrabold font-mono text-emerald-900 block mt-1">
                {formatMoney(netRevenue)}
              </span>
              <span className="text-[10px] text-emerald-800 font-medium">Entrada real no caixa</span>
            </div>
          </div>

          {/* Rodapé explicativo */}
          <div className="mt-3 pt-2 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 font-medium gap-1">
            <span>
              Fórmula: <code className="bg-stone-100 px-1 py-0.5 rounded text-[11px] font-mono text-stone-800">Líquido = (Produtos + Fretes + Serviço) - (Cupons + Cashback)</code>
            </span>
            {canceledRevenue > 0 && (
              <span className="text-rose-600 font-mono text-[11px]">
                Cancelamentos no período: -{formatMoney(canceledRevenue)} (não computados no líquido)
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
