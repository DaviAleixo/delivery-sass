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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { ArrowUpRight, Coins, DollarSign, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function CashSupplyModal({
  isOpen,
  onClose,
  onConfirmSupply,
  currentOperator = "Operador",
}) {
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("moedas");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountValue = parseBRLToNumber(amountStr);

  const handleConfirm = () => {
    if (!amountValue || amountValue <= 0) {
      toast.error("Informe um valor válido para o suprimento.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (typeof onConfirmSupply === "function") {
        onConfirmSupply({
          type: "supply",
          amount: amountValue,
          reason,
          notes: notes.trim(),
          operator: currentOperator,
          timestamp: new Date().toISOString(),
        });
      }
      toast.success("Suprimento de caixa registrado com sucesso!", {
        description: `R$ ${amountValue.toFixed(2).replace(".", ",")} adicionados à gaveta para troco.`,
      });
      onClose();
    } catch (err) {
      console.error("[CashSupplyModal] Erro ao registrar suprimento:", err);
      toast.error("Erro ao registrar suprimento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-6 rounded-3xl bg-white shadow-2xl border-0 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shadow-xs">
              <ArrowUpRight className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-stone-900 leading-tight">
                Suprimento de Caixa (Entrada)
              </DialogTitle>
              <p className="text-xs text-stone-500 font-medium">
                Injeção de moedas e cédulas para reforço de troco
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Valor do Suprimento */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-stone-700">
              Valor do Suprimento (R$):
            </Label>
            <CurrencyInput
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="R$ 0,00"
              autoFocus
              className="text-2xl h-14 font-black text-center rounded-2xl border-2 border-stone-200 focus-visible:border-blue-500 text-stone-900"
            />
          </div>

          {/* Origem / Motivo */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-stone-700">
              Origem / Motivo:
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-10 rounded-xl text-xs font-bold border-stone-200">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="moedas">Entrada de Moedas / Troco Miúdo</SelectItem>
                <SelectItem value="reforco">Reforço de Troco pelo Gerente</SelectItem>
                <SelectItem value="troca">Troca de Cédulas Altas por Miúdas</SelectItem>
                <SelectItem value="outro">Outro Suprimento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-stone-700">
              Observações / Detalhes (Opcional):
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: R$ 50 em moedas de 0,50 e 1,00 trazidas do banco..."
              rows={2}
              className="resize-none rounded-xl text-xs border-stone-200 focus-visible:ring-blue-500"
            />
          </div>

          {/* Alerta de Auditoria */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-2.5 flex items-start gap-2 text-[11px] text-blue-800">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-tight">
              <b>Suprimento não é receita de venda:</b> Ele apenas aumenta o dinheiro físico disponível na gaveta para troco. Não é contabilizado no faturamento bruto.
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
            disabled={isSubmitting || !amountValue}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black px-5 shadow-sm cursor-pointer gap-1.5"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Confirmar Suprimento</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
