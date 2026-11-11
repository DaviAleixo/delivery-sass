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
import { ArrowUpRight, AlertCircle } from "lucide-react";
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
      <DialogContent className="max-w-md p-5 sm:p-6 rounded-xl bg-white shadow-xl border border-stone-200 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200/60">
              <ArrowUpRight className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-stone-900 leading-tight">
                Adicionar Troco na Gaveta (Suprimento)
              </DialogTitle>
              <p className="text-xs text-stone-500">
                Entrada de cédulas ou moedas para reforçar o troco
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Valor do Suprimento */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-stone-700">
              Valor a Adicionar (R$):
            </Label>
            <CurrencyInput
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="R$ 0,00"
              autoFocus
              className="text-2xl h-12 font-bold font-mono text-center rounded-lg border-2 border-stone-300 focus-visible:border-blue-600 text-stone-900"
            />
          </div>

          {/* Origem / Motivo */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-stone-700">
              Origem / Motivo:
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-9.5 rounded-lg text-xs font-medium border-stone-200">
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
            <Label className="text-xs font-semibold text-stone-700">
              Observações (Opcional):
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: R$ 50 em moedas de 0,50 e 1,00 para troco..."
              rows={2}
              className="resize-none rounded-lg text-xs border-stone-200 focus-visible:ring-blue-500"
            />
          </div>

          {/* Alerta de Auditoria */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-2.5 flex items-start gap-2 text-[11px] text-stone-600">
            <AlertCircle className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
            <p className="leading-tight">
              <b>Suprimento não é venda:</b> Ele apenas aumenta as notas e moedas físicas disponíveis na gaveta para troco.
            </p>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-stone-100 flex items-center justify-between sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg text-xs font-medium border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer h-9"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !amountValue}
            className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold px-4 h-9 shadow-xs cursor-pointer gap-1.5"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Confirmar Entrada</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
