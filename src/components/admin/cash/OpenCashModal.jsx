import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { formatInBrasilia } from "@/utils/dateTime";
import { Lock, Unlock, DollarSign, User, Clock, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function OpenCashModal({
  isOpen,
  onClose,
  currentOperator = "Operador do Caixa",
  onConfirmOpen,
}) {
  const [operator, setOperator] = useState(currentOperator);
  const [initialFloatStr, setInitialFloatStr] = useState("R$ 100,00");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialFloatValue = parseBRLToNumber(initialFloatStr);
  const nowFormatted = formatInBrasilia(new Date(), { includeSeconds: false });

  const quickAmounts = [50, 100, 150, 200];

  const handleQuickAmount = (val) => {
    setInitialFloatStr(`R$ ${Number(val).toFixed(2).replace(".", ",")}`);
  };

  const handleConfirm = () => {
    if (!operator.trim()) {
      toast.error("Por favor, informe o nome do operador responsável.");
      return;
    }
    if (initialFloatValue < 0) {
      toast.error("O fundo de troco não pode ser negativo.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (typeof onConfirmOpen === "function") {
        onConfirmOpen({
          operator: operator.trim(),
          initialFloat: initialFloatValue,
          notes: notes.trim(),
          openedAt: new Date().toISOString(),
        });
      }
      toast.success("Caixa aberto com sucesso!", {
        description: `Operador: ${operator.trim()} • Fundo inicial: R$ ${initialFloatValue.toFixed(2).replace(".", ",")}`,
      });
      onClose();
    } catch (err) {
      console.error("[OpenCashModal] Erro ao abrir caixa:", err);
      toast.error("Erro ao realizar abertura de caixa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-6 rounded-3xl bg-white shadow-2xl border-0 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-[#047857] flex items-center justify-center shadow-xs">
              <Unlock className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-stone-900 leading-tight">
                Abertura de Caixa
              </DialogTitle>
              <p className="text-xs text-stone-500 font-medium">
                Início de expediente e definição do fundo de troco
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card Informativo de Data/Hora */}
          <div className="bg-stone-50 border border-stone-100 rounded-2xl p-3 flex items-center justify-between text-xs text-stone-600">
            <span className="flex items-center gap-1.5 font-bold text-stone-700">
              <Clock className="w-3.5 h-3.5 text-[#047857]" />
              Data e Horário:
            </span>
            <span className="font-black text-stone-900 bg-white px-2.5 py-1 rounded-lg border border-stone-200 shadow-2xs">
              {nowFormatted} (Brasília)
            </span>
          </div>

          {/* Operador Responsável */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-stone-400" />
              Operador Responsável:
            </Label>
            <Input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="Ex: João Silva / Atendente"
              className="h-10 rounded-xl text-sm font-semibold border-stone-200 focus-visible:ring-[#047857]"
            />
          </div>

          {/* Fundo de Troco Inicial */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-stone-400" />
                Fundo de Troco Inicial (Gaveta):
              </Label>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Dinheiro vivo inicial
              </span>
            </div>

            <CurrencyInput
              value={initialFloatStr}
              onChange={(e) => setInitialFloatStr(e.target.value)}
              placeholder="R$ 0,00"
              className="text-2xl h-14 font-black text-center rounded-2xl border-2 border-stone-200 focus-visible:border-[#047857] text-stone-900"
            />

            {/* Atalhos de valores rápidos */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[11px] font-bold text-stone-400 shrink-0">Sugestões:</span>
              <div className="grid grid-cols-4 gap-1.5 flex-1">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleQuickAmount(amt)}
                    className="py-1 px-1.5 rounded-lg text-xs font-bold bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 text-stone-700 border border-stone-200/80 transition-all cursor-pointer text-center"
                  >
                    R$ {amt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Observações da Abertura */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-stone-700">
              Observações / Notas do Turno (Opcional):
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Caixa aberto com moedas de 0,50 e 1,00 para troco..."
              rows={2}
              className="resize-none rounded-xl text-xs border-stone-200 focus-visible:ring-[#047857]"
            />
          </div>

          {/* Alerta de Auditoria */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-2.5 flex items-start gap-2 text-[11px] text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-tight">
              O fundo de troco <b>não é considerado faturamento</b> de vendas. Ele compõe estritamente o saldo físico inicial da gaveta para troco.
            </p>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-stone-100 flex items-center justify-between sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl text-xs font-bold border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-[#047857] hover:bg-[#065f46] text-white rounded-xl text-xs font-black px-5 shadow-sm cursor-pointer gap-1.5"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>Confirmar Abertura</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
