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
import { formatInBrasilia } from "@/utils/dateTime";
import { Receipt, Tag, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function CashExpenseModal({
  isOpen,
  onClose,
  onConfirmExpense,
  currentOperator = "Operador",
  storeName = "Restaurante",
}) {
  const [amountStr, setAmountStr] = useState("");
  const [category, setCategory] = useState("gelo");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountValue = parseBRLToNumber(amountStr);
  const nowFormatted = formatInBrasilia(new Date(), { includeSeconds: false });

  const categories = [
    { key: "gelo", label: "Gelo Emergencial", example: "Compra de sacos de gelo para bebidas" },
    { key: "limpeza", label: "Limpeza & Descartáveis", example: "Detergente, papel toalha, saco de lixo" },
    { key: "hortifruti", label: "Hortifrúti / Insumos Rápidos", example: "Alface, tomate, limão que acabaram" },
    { key: "gas", label: "Gás / Manutenção Rápida", example: "Troca emergencial de botijão ou conserto" },
    { key: "transporte", label: "Transporte / Frete Rápido", example: "Corrida rápida para buscar insumos" },
    { key: "outros", label: "Outra Despesa Operacional", example: "Pequeno pagamento autorizado pelo gerente" },
  ];

  const handleConfirm = () => {
    if (!amountValue || amountValue <= 0) {
      toast.error("Informe um valor válido para a despesa.");
      return;
    }
    if (!description.trim()) {
      toast.error("Descreva brevemente a despesa realizada.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (typeof onConfirmExpense === "function") {
        onConfirmExpense({
          type: "expense",
          amount: amountValue,
          category,
          categoryLabel: categories.find((c) => c.key === category)?.label || category,
          description: description.trim(),
          notes: notes.trim(),
          operator: currentOperator,
          timestamp: new Date().toISOString(),
          store: storeName,
        });
      }
      toast.success("Saída operacional registrada!", {
        description: `R$ ${amountValue.toFixed(2).replace(".", ",")} debitados da gaveta física.`,
      });
      onClose();
    } catch (err) {
      console.error("[CashExpenseModal] Erro ao registrar despesa:", err);
      toast.error("Erro ao registrar saída operacional.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-5 sm:p-6 rounded-xl bg-white shadow-xl border border-stone-200 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center border border-rose-200/60">
              <Receipt className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-stone-900 leading-tight">
                Pagar Despesa Local (Saída do Caixa)
              </DialogTitle>
              <p className="text-xs text-stone-500">
                Pagamento de suprimentos rápidos com dinheiro da gaveta
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Informações Automáticas */}
          <div className="grid grid-cols-2 gap-2 text-xs bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-stone-600">
            <div>
              <span className="text-[10px] text-stone-400 block font-semibold uppercase">Operador</span>
              <span className="font-semibold text-stone-900 truncate block">{currentOperator}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-400 block font-semibold uppercase">Data & Hora</span>
              <span className="font-mono text-stone-800 block">{nowFormatted}</span>
            </div>
          </div>

          {/* Valor da Saída */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-stone-700">
              Valor da Despesa (R$):
            </Label>
            <CurrencyInput
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="R$ 0,00"
              autoFocus
              className="text-2xl h-12 font-bold font-mono text-center rounded-lg border-2 border-stone-300 focus-visible:border-rose-600 text-stone-900"
            />
          </div>

          {/* Categoria da Despesa */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-stone-400" />
              Categoria da Despesa:
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9.5 rounded-lg text-xs font-medium border-stone-200">
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.key} value={c.key} className="text-xs">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descrição Obrigatória */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-stone-700">
              Descrição do Item Pago:
            </Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={categories.find((c) => c.key === category)?.example || "Ex: 2 sacos de gelo"}
              className="h-9.5 rounded-lg text-xs font-medium border-stone-300 focus-visible:ring-rose-500"
            />
          </div>

          {/* Observação Opcional */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-stone-700">
              Observação / Comprovante (Opcional):
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Nota fiscal deixada na gaveta para contabilidade..."
              rows={2}
              className="resize-none rounded-lg text-xs border-stone-300 focus-visible:ring-rose-500"
            />
          </div>

          {/* Alerta de Contabilidade */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-2.5 flex items-start gap-2 text-[11px] text-stone-600">
            <AlertCircle className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
            <p className="leading-tight">
              <b>Atenção:</b> Esta saída <b>reduz o dinheiro esperado na gaveta</b>, mas não anula as vendas já computadas.
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
            disabled={isSubmitting || !amountValue || !description.trim()}
            className="bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold px-4 h-9 shadow-xs cursor-pointer gap-1.5"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Confirmar Despesa</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
