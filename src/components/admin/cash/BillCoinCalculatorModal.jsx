import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calculator, RotateCcw, CheckCircle2, Coins, Banknote } from "lucide-react";

const DENOMINATIONS = [
  { key: "200", label: "R$ 200", value: 200, kind: "bill" },
  { key: "100", label: "R$ 100", value: 100, kind: "bill" },
  { key: "50", label: "R$ 50", value: 50, kind: "bill" },
  { key: "20", label: "R$ 20", value: 20, kind: "bill" },
  { key: "10", label: "R$ 10", value: 10, kind: "bill" },
  { key: "5", label: "R$ 5", value: 5, kind: "bill" },
  { key: "2", label: "R$ 2", value: 2, kind: "bill" },
  { key: "1", label: "R$ 1,00", value: 1, kind: "coin" },
  { key: "0.50", label: "R$ 0,50", value: 0.5, kind: "coin" },
  { key: "0.25", label: "R$ 0,25", value: 0.25, kind: "coin" },
  { key: "0.10", label: "R$ 0,10", value: 0.1, kind: "coin" },
  { key: "0.05", label: "R$ 0,05", value: 0.05, kind: "coin" },
];

const EMPTY_COUNTS = Object.fromEntries(DENOMINATIONS.map((d) => [d.key, ""]));

export default function BillCoinCalculatorModal({
  isOpen,
  onClose,
  onApplyTotal,
  initialCounts = null,
}) {
  const [counts, setCounts] = useState(EMPTY_COUNTS);

  useEffect(() => {
    if (isOpen) {
      setCounts(initialCounts ? { ...EMPTY_COUNTS, ...initialCounts } : EMPTY_COUNTS);
    }
  }, [isOpen, initialCounts]);

  const { billsTotal, coinsTotal, grandTotal, totalItemsCount } = useMemo(() => {
    let bills = 0;
    let coins = 0;
    let itemsCount = 0;
    for (const d of DENOMINATIONS) {
      const qty = Math.max(0, parseInt(counts[d.key] || "0", 10) || 0);
      const subtotal = qty * d.value;
      itemsCount += qty;
      if (d.kind === "bill") bills += subtotal;
      else coins += subtotal;
    }
    return {
      billsTotal: bills,
      coinsTotal: coins,
      grandTotal: bills + coins,
      totalItemsCount: itemsCount,
    };
  }, [counts]);

  const formatMoney = (val) => `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const updateCount = (key, nextVal) => {
    const clean = String(nextVal).replace(/\D/g, "");
    setCounts((prev) => ({ ...prev, [key]: clean }));
  };

  const stepCount = (key, delta) => {
    setCounts((prev) => {
      const current = parseInt(prev[key] || "0", 10) || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [key]: next === 0 ? "" : String(next) };
    });
  };

  const handleApply = () => {
    onApplyTotal(grandTotal, counts);
    onClose();
  };

  const renderDenominationRow = (item) => {
    const qty = Math.max(0, parseInt(counts[item.key] || "0", 10) || 0);
    const subtotal = qty * item.value;
    const isBill = item.kind === "bill";
    return (
      <div
        key={item.key}
        className={`grid grid-cols-[78px_auto_1fr] items-center gap-2.5 px-2.5 py-1.5 rounded-lg border transition-colors ${
          qty > 0
            ? "bg-emerald-50/70 border-emerald-300 shadow-2xs"
            : "bg-stone-50/60 border-stone-200/90 hover:border-stone-300"
        }`}
      >
        <span
          className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-xs font-bold tabular-nums border ${
            qty > 0
              ? "bg-emerald-100/80 text-emerald-900 border-emerald-300"
              : isBill
              ? "bg-white text-stone-800 border-stone-200"
              : "bg-amber-50/70 text-amber-900 border-amber-200/80"
          }`}
        >
          {item.label}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => stepCount(item.key, -1)}
            aria-label={`Diminuir ${item.label}`}
            className="w-7 h-7 rounded-md border border-stone-200 bg-white text-stone-700 font-bold text-xs hover:bg-stone-100 active:scale-95 transition cursor-pointer flex items-center justify-center"
          >
            -
          </button>
          <Input
            type="text"
            inputMode="numeric"
            value={counts[item.key]}
            onChange={(e) => updateCount(item.key, e.target.value)}
            placeholder="0"
            className="w-12 h-7 text-center text-xs font-mono tabular-nums font-bold px-1 bg-white border-stone-200"
          />
          <button
            type="button"
            onClick={() => stepCount(item.key, 1)}
            aria-label={`Aumentar ${item.label}`}
            className="w-7 h-7 rounded-md border border-stone-200 bg-white text-stone-700 font-bold text-xs hover:bg-stone-100 active:scale-95 transition cursor-pointer flex items-center justify-center"
          >
            +
          </button>
        </div>

        <span
          className={`text-xs font-mono tabular-nums font-semibold text-right truncate ${
            qty > 0 ? "text-emerald-800" : "text-stone-500"
          }`}
        >
          {formatMoney(subtotal)}
        </span>
      </div>
    );
  };

  const billsItems = DENOMINATIONS.filter((d) => d.kind === "bill");
  const coinsItems = DENOMINATIONS.filter((d) => d.kind === "coin");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[95vh] overflow-y-auto md:overflow-visible p-0 border-0 shadow-2xl rounded-xl">
        <DialogHeader className="px-5 py-3.5 bg-stone-900 text-white border-b border-stone-800 rounded-t-xl">
          <DialogTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-400" />
            Contador de Cédulas e Moedas
          </DialogTitle>
          <p className="text-xs text-stone-300 mt-0.5">
            Informe a quantidade de cada nota e moeda encontrada na gaveta para evitar erros de soma.
          </p>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-3.5 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            {/* Coluna Esquerda: Cédulas */}
            <div className="flex flex-col rounded-xl border border-stone-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-stone-200 pb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                  Cédulas
                </span>
                <span className="text-xs font-bold font-mono tabular-nums text-stone-800">
                  {formatMoney(billsTotal)}
                </span>
              </div>
              <div className="space-y-1.5">
                {billsItems.map(renderDenominationRow)}
              </div>
            </div>

            {/* Coluna Direita: Moedas + Resumo Simétrico */}
            <div className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-3 space-y-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-stone-200 pb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5 text-amber-600" />
                    Moedas
                  </span>
                  <span className="text-xs font-bold font-mono tabular-nums text-stone-800">
                    {formatMoney(coinsTotal)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {coinsItems.map(renderDenominationRow)}
                </div>
              </div>

              <div className="rounded-lg bg-stone-50 border border-stone-200/90 px-3 py-2.5 grid grid-cols-3 gap-2 text-center">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold block">
                    Cédulas
                  </span>
                  <span className="text-xs font-mono tabular-nums font-bold text-stone-800">
                    {formatMoney(billsTotal)}
                  </span>
                </div>
                <div className="border-x border-stone-200">
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold block">
                    Moedas
                  </span>
                  <span className="text-xs font-mono tabular-nums font-bold text-stone-800">
                    {formatMoney(coinsTotal)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold block">
                    Unidades
                  </span>
                  <span className="text-xs font-mono tabular-nums font-bold text-stone-800">
                    {totalItemsCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-stone-900 text-white rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold block">
                Total Contado na Gaveta
              </span>
              <span className="text-2xl font-extrabold font-mono tabular-nums tracking-tight">
                {formatMoney(grandTotal)}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCounts(EMPTY_COUNTS)}
              className="bg-stone-800 border-stone-700 text-stone-200 hover:bg-stone-700 hover:text-white text-xs h-8 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Zerar
            </Button>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex sm:justify-between gap-2 rounded-b-xl">
          <Button type="button" variant="outline" onClick={onClose} className="text-xs cursor-pointer">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Aplicar {formatMoney(grandTotal)} no Fechamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

