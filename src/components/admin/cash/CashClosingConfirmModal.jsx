import React, { useState, useEffect } from "react";
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
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber } from "@/utils/moneyMask";
import {
  AlertTriangle,
  Lock,
  CheckCircle2,
  AlertCircle,
  EyeOff,
  ShieldCheck,
  Vault,
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
  isBlindClosing = false,
  onConfirmCloseShift,
}) {
  const [localJustification, setLocalJustification] = useState(justification);
  const [blindLocked, setBlindLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retainedFloatStr, setRetainedFloatStr] = useState("R$ 0,00");

  useEffect(() => {
    if (isOpen) {
      setLocalJustification(justification || "");
      setBlindLocked(false);
      setIsSubmitting(false);
      setRetainedFloatStr(
        `R$ ${Math.max(0, Number(countedCash || 0)).toFixed(2).replace(".", ",")}`
      );
    }
  }, [isOpen, justification, countedCash]);

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const safeCounted = Math.max(0, Number(countedCash || 0));
  const rawRetained = Math.max(0, parseBRLToNumber(retainedFloatStr));
  const retainedFloat = Math.min(safeCounted, Number(rawRetained.toFixed(2)));
  const collectedToSafe = Math.max(0, Number((safeCounted - retainedFloat).toFixed(2)));

  const isExact = Math.abs(difference) < 0.01;
  const isSurplus = difference > 0.01;
  const isShortage = difference < -0.01;

  const isBlindRevealPending = isBlindClosing && !blindLocked;
  const requiresJustification = !isBlindRevealPending && !isExact && !localJustification.trim();

  const handleConfirm = async () => {
    if (isBlindRevealPending) {
      setBlindLocked(true);
      return;
    }

    if (requiresJustification) {
      toast.error("Por favor, justifique a diferença apurada na gaveta.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (typeof onConfirmCloseShift === "function") {
        await onConfirmCloseShift({
          countedCash,
          difference,
          justification: localJustification.trim(),
          closedAt: new Date().toISOString(),
          retainedFloat,
          collectedToSafe,
        });
      }
      toast.success("Turno encerrado e caixa fechado com sucesso!");
      onClose();
    } catch (err) {
      console.error("[CashClosingConfirmModal] Erro ao fechar caixa:", err);
      toast.error(err?.message || "Erro ao encerrar o turno.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // No modo cego após travar a contagem, evita fechar sem concluir para impedir edição retroativa
        if (!open && blindLocked && isBlindClosing) return;
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md p-5 sm:p-6 rounded-xl bg-white shadow-xl border border-stone-200 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                isBlindRevealPending
                  ? "bg-stone-100 text-stone-800 border-stone-200"
                  : isExact
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                  : isSurplus
                  ? "bg-blue-50 text-blue-700 border-blue-200/60"
                  : "bg-rose-50 text-rose-700 border-rose-200/60"
              }`}
            >
              {isBlindRevealPending ? (
                <EyeOff className="w-5 h-5 stroke-[2.2]" />
              ) : (
                <Lock className="w-5 h-5 stroke-[2.2]" />
              )}
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-stone-900 leading-tight">
                {isBlindRevealPending
                  ? "Travar Contagem Cega do Caixa"
                  : "Encerrar Expediente & Fechar Caixa"}
              </DialogTitle>
              <p className="text-xs text-stone-500">
                {isBlindRevealPending
                  ? "Modo antifraude ativo • O saldo esperado será revelado após travar"
                  : "Consolidação financeira definitiva do turno"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isBlindRevealPending ? (
            <>
              <div className="bg-stone-900 text-white rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-300">
                  <span>Contagem Declarada na Gaveta:</span>
                  <Badge className="bg-stone-800 text-stone-200 border border-stone-700 text-[10px]">
                    <EyeOff className="w-3 h-3 mr-1" /> Saldo Oculto
                  </Badge>
                </div>
                <p className="text-2xl font-extrabold font-mono text-white">
                  {formatMoney(countedCash)}
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5 text-xs text-amber-900">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-snug">
                  <p className="font-semibold">Atenção antes de avançar:</p>
                  <p className="text-[11px] text-amber-800">
                    Ao clicar em <b>"Travar Contagem e Revelar"</b>, você não poderá alterar o valor contado. O sistema revelará se houve sobra ou falta para justificativa final.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
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
                    placeholder="Ex: Erro no troco do pedido #12 / Compra sem nota / Arredondamento..."
                    rows={3}
                    className="resize-none rounded-lg text-xs border-stone-300 focus-visible:ring-rose-500"
                  />
                </div>
              )}

              {/* Destino do Dinheiro Contado: Gaveta (troco) vs Cofre */}
              {safeCounted > 0 && (
                <div className="bg-stone-50 border border-stone-200 rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                      <Vault className="w-3.5 h-3.5 text-stone-600" />
                      Quanto fica na gaveta para o próximo turno?
                    </Label>
                  </div>

                  <CurrencyInput
                    value={retainedFloatStr}
                    onChange={(e) => setRetainedFloatStr(e.target.value)}
                    placeholder="R$ 0,00"
                    className="h-9.5 text-sm font-mono font-bold bg-white border-stone-300"
                  />

                  <div className="flex flex-wrap gap-1.5">
                    {[100, 150, 200]
                      .filter((v) => v <= safeCounted)
                      .map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() =>
                            setRetainedFloatStr(`R$ ${v.toFixed(2).replace(".", ",")}`)
                          }
                          className="px-2 py-1 rounded text-[11px] font-medium bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 cursor-pointer"
                        >
                          Deixar R$ {v}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setRetainedFloatStr("R$ 0,00")}
                      className="px-2 py-1 rounded text-[11px] font-medium bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 cursor-pointer"
                    >
                      Recolher tudo (R$ 0)
                    </button>
                  </div>

                  <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-xs">
                    <span className="text-stone-600">Recolhido para o Cofre:</span>
                    <span className="font-mono font-bold text-emerald-800">
                      {formatMoney(collectedToSafe)}
                    </span>
                  </div>
                </div>
              )}

              {/* Trava e Alerta de Ação Irreversível */}
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 flex items-start gap-2.5 text-xs text-stone-700">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-snug">
                  <p className="font-semibold text-stone-900">Fechamento Definitivo:</p>
                  <p className="text-[11px] text-stone-500">
                    Ao confirmar, este expediente será gravado na auditoria e no Histórico de Turnos para visualização do proprietário e reimpressão.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-stone-100 flex items-center justify-between sm:justify-between gap-2">
          {!blindLocked ? (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg text-xs font-medium border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer h-9"
            >
              Voltar e Conferir
            </Button>
          ) : (
            <span className="text-[11px] text-stone-400 font-medium">
              Contagem travada para auditoria
            </span>
          )}

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || requiresJustification}
            className="bg-stone-900 hover:bg-black text-white rounded-lg text-xs font-semibold px-4 h-9 shadow-xs cursor-pointer gap-1.5"
          >
            {isBlindRevealPending ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Travar Contagem e Revelar</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-stone-300" />
                <span>Confirmar Encerramento</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
