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
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Lock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Receipt,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

export default function CashClosingConfirmModal({
  isOpen,
  onClose,
  expectedCash = 0,
  countedCash = 0,
  difference = 0,
  justification = "",
  operator = "Operador",
  onConfirmCloseShift,
}) {
  const [localJustification, setLocalJustification] = useState(justification);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const isExact = Math.abs(difference) < 0.01;
  const isSurplus = difference > 0.01;
  const isShortage = difference < -0.01;

  const requiresJustification = !isExact && !localJustification.trim();

  const handleConfirm = () => {
    if (requiresJustification) {
      toast.error("Por favor, justifique a diferença apurada na gaveta.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (typeof onConfirmCloseShift === "function") {
        onConfirmCloseShift({
          countedCash,
          difference,
          justification: localJustification.trim(),
          closedAt: new Date().toISOString(),
        });
      }
      toast.success("Turno encerrado e caixa fechado com sucesso!");
      onClose();
    } catch (err) {
      console.error("[CashClosingConfirmModal] Erro ao fechar caixa:", err);
      toast.error("Erro ao encerrar o turno.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-6 rounded-3xl bg-white shadow-2xl border-0 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-xs ${
              isExact
                ? "bg-emerald-50 text-[#047857]"
                : isSurplus
                ? "bg-blue-50 text-blue-700"
                : "bg-rose-50 text-rose-700"
            }`}>
              <Lock className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-stone-900 leading-tight">
                Encerrar Expediente & Fechar Caixa
              </DialogTitle>
              <p className="text-xs text-stone-500 font-medium">
                Ação irreversível de consolidação financeira do turno
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card Resumo da Conferência */}
          <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 font-bold">Dinheiro Esperado na Gaveta:</span>
              <span className="font-black text-stone-900">{formatMoney(expectedCash)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 font-bold">Dinheiro Contado pelo Operador:</span>
              <span className="font-black text-stone-900">{formatMoney(countedCash)}</span>
            </div>

            <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
              <span className="text-xs font-black text-stone-800">Resultado da Apuração:</span>
              {isExact && (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-xs gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Caixa Correto (Exato)
                </Badge>
              )}
              {isSurplus && (
                <Badge className="bg-blue-100 text-blue-800 border-blue-300 font-bold text-xs gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-blue-600" />
                  Sobra de +{formatMoney(difference)}
                </Badge>
              )}
              {isShortage && (
                <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-bold text-xs gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Falta de {formatMoney(Math.abs(difference))} (Quebra)
                </Badge>
              )}
            </div>
          </div>

          {/* Campo de Justificativa se houver diferença */}
          {!isExact && (
            <div className="space-y-1.5 animate-in fade-in">
              <Label className="text-xs font-bold text-stone-700 flex items-center justify-between">
                <span>Justificativa da Diferença:</span>
                <span className="text-[10px] text-rose-600 font-bold uppercase">* Obrigatório</span>
              </Label>
              <Textarea
                value={localJustification}
                onChange={(e) => setLocalJustification(e.target.value)}
                placeholder="Ex: Diferença de centavos decorrente de arredondamento de troco / moeda..."
                rows={2}
                className="resize-none rounded-xl text-xs border-stone-200 focus-visible:ring-rose-500 font-medium"
              />
            </div>
          )}

          {/* Trava e Alerta de Ação Irreversível */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-snug">
              <p className="font-bold">Aviso de Fechamento Definitivo:</p>
              <p className="text-[11px] text-amber-800">
                Após a confirmação, este turno será travado para novas movimentações. O extrato será arquivado no <b>Histórico e Auditoria</b> e estará disponível para reimpressão e consulta a qualquer momento.
              </p>
            </div>
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
            Voltar e Conferir
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || requiresJustification}
            className="bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-black px-5 shadow-sm cursor-pointer gap-1.5"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Confirmar Encerramento</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
