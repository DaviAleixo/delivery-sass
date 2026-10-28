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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { ArrowDownRight, ShieldAlert, DollarSign, Wallet, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function CashBleedModal({
  isOpen,
  onClose,
  currentDrawerBalance = 0,
  onConfirmBleed,
  currentOperator = "Operador",
}) {
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("cofre");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountValue = parseBRLToNumber(amountStr);

  const handleConfirm = () => {
    if (!amountValue || amountValue <= 0) {
      toast.error("Informe um valor válido para a sangria.");
      return;
    }

    if (amountValue > currentDrawerBalance && currentDrawerBalance > 0) {
      toast.warning("Atenção: o valor da sangria é maior que o saldo estimado na gaveta.");
    }

    setIsSubmitting(true);
    try {
      if (typeof onConfirmBleed === "function") {
        onConfirmBleed({
          type: "bleed",
          amount: amountValue,
          reason,
          notes: notes.trim(),
          operator: currentOperator,
          timestamp: new Date().toISOString(),
        });
      }
      toast.success("Sangria de caixa registrada com sucesso!", {
        description: `R$ ${amountValue.toFixed(2).replace(".", ",")} retirados da gaveta.`,
      });
      onClose();
    } catch (err) {
      console.error("[CashBleedModal] Erro ao registrar sangria:", err);
      toast.error("Erro ao registrar sangria.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-6 rounded-3xl bg-white shadow-2xl border-0 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shadow-xs">
              <ArrowDownRight className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-stone-900 leading-tight">
                Sangria de Caixa (Retirada)
              </DialogTitle>
              <p className="text-xs text-stone-500 font-medium">
                Retirada segura de cédulas da gaveta para cofre ou depósito
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card com saldo estimado atual */}
          <div className="bg-stone-50 border border-stone-100 rounded-2xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-stone-400" />
              <span className="text-xs font-bold text-stone-600">Dinheiro Atual na Gaveta:</span>
            </div>
            <span className="text-sm font-black text-stone-900 bg-white px-2.5 py-1 rounded-xl border border-stone-200">
              R$ {Number(currentDrawerBalance || 0).toFixed(2).replace(".", ",")}
            </span>
          </div>

          {/* Valor da Sangria */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-stone-700">
              Valor da Sangria (R$):
            </Label>
            <CurrencyInput
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="R$ 0,00"
              autoFocus
              className="text-2xl h-14 font-black text-center rounded-2xl border-2 border-stone-200 focus-visible:border-amber-500 text-stone-900"
            />
          </div>

          {/* Motivo / Destino */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-stone-700">
              Destino / Justificativa:
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-10 rounded-xl text-xs font-bold border-stone-200">
                <SelectValue placeholder="Selecione o destino" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cofre">Transferência para o Cofre da Loja</SelectItem>
                <SelectItem value="deposito">Malote para Depósito Bancário</SelectItem>
                <SelectItem value="gerente">Recolhimento pelo Gerente / Proprietário</SelectItem>
                <SelectItem value="seguranca">Sangria de Segurança (Excesso de Cédulas)</SelectItem>
                <SelectItem value="outro">Outro Motivo</SelectItem>
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
              placeholder="Ex: Cédulas de 50 e 100 recolhidas pelo gerente..."
              rows={2}
              className="resize-none rounded-xl text-xs border-stone-200 focus-visible:ring-amber-500"
            />
          </div>

          {/* Alerta de Auditoria */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-2.5 flex items-start gap-2 text-[11px] text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-tight">
              <b>Sangria não é despesa:</b> Ela apenas transfere dinheiro da gaveta física para outro local seguro. Não altera o faturamento nem o lucro da loja.
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
            className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black px-5 shadow-sm cursor-pointer gap-1.5"
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>Confirmar Sangria</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
