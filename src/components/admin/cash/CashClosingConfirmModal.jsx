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
} from "lucide-react";
import { toast } from "sonner";

export default function CashClosingConfirmModal({
  isOpen,
  onClose,
  expectedCash = 0,
  countedCash = 0,
  difference = 0,
  justification = "",
  operator: _operator = "Operador",
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
      <DialogContent className="max-w-md p-5 sm:p-6 rounded-xl bg-white shadow-xl border border-stone-200 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
              isExact
                ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                : isSurplus
                ? "bg-blue-50 text-blue-700 border-blue-200/60"
                : "bg-rose-50 text-rose-700 border-rose-200/60"
            }`}>
              <Lock className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-stone-900 leading-tight">
                Encerrar Expediente & Fechar Caixa
              </DialogTitle>
              <p className="text-xs text-stone-500">
                Consolidação financeira definitiva do turno
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Card Resumo da Conferência */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 font-medium">Dinheiro Esperado na Gaveta:</span>
              <span className="font-mono font-bold text-stone-900">{formatMoney(expectedCash)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500 font-medium">Dinheiro Contado pelo Operador:</span>
              <span className="font-mono font-bold text-stone-900">{formatMoney(countedCash)}</span>
            </div>

            <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-800">Resultado da Auditoria:</span>
              {isExact && (
                <Badge className="bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold text-xs gap-1 rounded">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Caixa Correto (Exato)
                </Badge>
              )}
              {isSurplus && (
                <Badge className="bg-blue-50 text-blue-800 border-blue-300 font-semibold text-xs gap-1 rounded">
                  <AlertCircle className="w-3.5 h-3.5 text-blue-600" />
                  Sobra de +{formatMoney(difference)}
                </Badge>
              )}
              {isShortage && (
                <Badge className="bg-rose-50 text-rose-800 border-rose-300 font-semibold text-xs gap-1 rounded">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Falta de {formatMoney(Math.abs(difference))}
                </Badge>
              )}
            </div>
          </div>

          {/* Campo de Justificativa se houver diferença */}
          {!isExact && (
            <div className="space-y-1.5 animate-in fade-in">
              <Label className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                <span>Justificativa da Divergência:</span>
                <span className="text-[10px] text-rose-600 font-semibold uppercase">* Obrigatório</span>
              </Label>
              <Textarea
                value={localJustification}
                onChange={(e) => setLocalJustification(e.target.value)}
                placeholder="Ex: Arredondamento de troco / diferença de centavos..."
                rows={2}
                className="resize-none rounded-lg text-xs border-stone-300 focus-visible:ring-rose-500"
              />
            </div>
          )}

          {/* Trava e Alerta de Ação Irreversível */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 flex items-start gap-2.5 text-xs text-stone-700">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-snug">
              <p className="font-semibold text-stone-900">Fechamento do Turno:</p>
              <p className="text-[11px] text-stone-500">
                Ao confirmar, este expediente será concluído e arquivado no Histórico de Turnos para consulta e reimpressão térmica.
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
            className="rounded-lg text-xs font-medium border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer h-9"
          >
            Voltar e Conferir
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || requiresJustification}
            className="bg-stone-900 hover:bg-black text-white rounded-lg text-xs font-semibold px-4 h-9 shadow-xs cursor-pointer gap-1.5"
          >
            <Lock className="w-3.5 h-3.5 text-stone-300" />
            <span>Confirmar Encerramento</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
