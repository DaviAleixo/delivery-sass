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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { formatInBrasilia } from "@/utils/dateTime";
import { fetchLastClosedFloatSuggestion } from "@/services/financialService";
import { Unlock, DollarSign, User, Clock, AlertCircle, Link2, Sparkles, History } from "lucide-react";
import { toast } from "sonner";

export default function OpenCashModal({
  isOpen,
  onClose,
  currentOperator = "Operador do Caixa",
  onConfirmOpen,
  orphanOrders = [],
  reasonBanner = null,
  tenantId = null,
}) {
  const [operator, setOperator] = useState(currentOperator);
  const [isOperatorLocked, setIsOperatorLocked] = useState(false);
  const [initialFloatStr, setInitialFloatStr] = useState("R$ 100,00");
  const [notes, setNotes] = useState("");
  const [attachOrphans, setAttachOrphans] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastFloatSuggestion, setLastFloatSuggestion] = useState(null);

  const safeOrphans = Array.isArray(orphanOrders) ? orphanOrders : [];
  const orphanTotal = safeOrphans.reduce(
    (sum, o) => sum + Number(o?.total_amount ?? o?.total ?? 0),
    0
  );
  const orphanCashCount = safeOrphans.filter((o) => {
    const pm = String(o?.payment_method || "").toLowerCase();
    return pm.includes("dinheiro") || pm === "cash";
  }).length;

  useEffect(() => {
    let active = true;
    if (isOpen) {
      let resolvedOp = currentOperator || "Operador Principal";
      try {
        const rawUser = typeof window !== "undefined" ? localStorage.getItem("admin_user") : null;
        if (rawUser) {
          const parsed = JSON.parse(rawUser);
          if (parsed?.name || parsed?.username) {
            resolvedOp = parsed.name || parsed.username;
          }
        }
      } catch {}

      setOperator(resolvedOp);
      setIsOperatorLocked(true);
      setInitialFloatStr("R$ 100,00");
      setNotes("");
      setAttachOrphans(true);
      setIsSubmitting(false);
      setLastFloatSuggestion(null);

      const resolvedTenantId =
        tenantId ||
        (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null);
      if (resolvedTenantId) {
        fetchLastClosedFloatSuggestion(resolvedTenantId)
          .then((suggestion) => {
            if (!active || !suggestion) return;
            setLastFloatSuggestion(suggestion);
            if (suggestion.source === "retained_float") {
              setInitialFloatStr(
                `R$ ${Number(suggestion.amount || 0).toFixed(2).replace(".", ",")}`
              );
            }
          })
          .catch(() => {});
      }
    }
    return () => {
      active = false;
    };
  }, [isOpen, currentOperator, tenantId]);

  const initialFloatValue = parseBRLToNumber(initialFloatStr);
  const nowFormatted = formatInBrasilia(new Date(), { includeSeconds: false });

  const quickAmounts = [50, 100, 150, 200];

  const handleQuickAmount = (val) => {
    setInitialFloatStr(`R$ ${Number(val).toFixed(2).replace(".", ",")}`);
  };

  const handleConfirm = async () => {
    if (!operator.trim()) {
      toast.error("Por favor, informe o nome do operador responsável.");
      return;
    }
    if (initialFloatValue < 0) {
      toast.error("O fundo de troco não pode ser negativo.");
      return;
    }

    const selectedAttachIds =
      attachOrphans && safeOrphans.length > 0
        ? safeOrphans.map((o) => o.id).filter(Boolean)
        : [];

    setIsSubmitting(true);
    try {
      let result = null;
      if (typeof onConfirmOpen === "function") {
        result = await onConfirmOpen({
          operator: operator.trim(),
          initialFloat: initialFloatValue,
          notes: notes.trim(),
          openedAt: new Date().toISOString(),
          attachOrderIds: selectedAttachIds,
        });
      }
      const linkedCount = Number(result?.attachedOrdersCount ?? selectedAttachIds.length ?? 0);
      const linkedSuffix =
        linkedCount > 0 ? ` • ${linkedCount} pedido(s) online vinculado(s)` : "";
      toast.success("Caixa aberto com sucesso!", {
        description: `Operador: ${operator.trim()} • Fundo inicial: R$ ${initialFloatValue.toFixed(2).replace(".", ",")}${linkedSuffix}`,
      });
      onClose();
    } catch (err) {
      console.error("[OpenCashModal] Erro ao abrir caixa:", err);
      toast.error(err?.message || "Erro ao realizar abertura de caixa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-5 sm:p-6 rounded-xl bg-white shadow-xl border border-stone-200 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60">
              <Unlock className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-stone-900 leading-tight">
                Abertura de Caixa (Novo Turno)
              </DialogTitle>
              <p className="text-xs text-stone-500">
                Início de expediente e definição do troco inicial
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[75vh] overflow-y-auto pr-0.5">
          {reasonBanner && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2 text-xs text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <p className="leading-snug font-medium">{reasonBanner}</p>
            </div>
          )}

          {/* Card Informativo de Data/Hora */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 flex items-center justify-between text-xs text-stone-600">
            <span className="flex items-center gap-1.5 font-medium text-stone-600">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              Data e Horário:
            </span>
            <span className="font-semibold font-mono text-stone-800 bg-white px-2 py-0.5 rounded border border-stone-200">
              {nowFormatted} (Brasília)
            </span>
          </div>

          {/* Operador Responsável */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-stone-700 flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-stone-400" />
                Operador Responsável:
              </span>
              {isOperatorLocked && (
                <span className="text-[10px] font-semibold text-stone-500">
                  Vinculado ao seu login
                </span>
              )}
            </Label>
            <Input
              value={operator}
              onChange={(e) => !isOperatorLocked && setOperator(e.target.value)}
              readOnly={isOperatorLocked}
              placeholder="Ex: João Silva / Atendente"
              className={`h-9.5 rounded-lg text-xs font-medium border-stone-300 focus-visible:ring-emerald-700 ${
                isOperatorLocked ? "bg-stone-100 text-stone-700 cursor-not-allowed" : ""
              }`}
            />
          </div>

          {/* Fundo de Troco Inicial */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-stone-700 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-stone-400" />
                Troco Inicial em Cédulas e Moedas (Gaveta):
              </Label>
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50">
                Fundo de Caixa
              </span>
            </div>

            <CurrencyInput
              value={initialFloatStr}
              onChange={(e) => setInitialFloatStr(e.target.value)}
              placeholder="R$ 0,00"
              className="text-2xl h-12 font-bold font-mono text-center rounded-lg border-2 border-stone-300 focus-visible:border-emerald-700 text-stone-900"
            />

            {/* Sugestão do último fechamento (1 clique) */}
            {lastFloatSuggestion && (
              <button
                type="button"
                onClick={() => handleQuickAmount(lastFloatSuggestion.amount)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-stone-50 hover:bg-emerald-50/60 border border-stone-200 hover:border-emerald-300 text-xs transition-colors cursor-pointer text-left"
              >
                <span className="flex items-center gap-1.5 text-stone-700 font-medium">
                  <History className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{lastFloatSuggestion.label}</span>
                </span>
                <span className="font-mono font-bold text-emerald-800 shrink-0">
                  Usar R$ {Number(lastFloatSuggestion.amount || 0).toFixed(2).replace(".", ",")}
                </span>
              </button>
            )}

            {/* Atalhos de valores rápidos */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[11px] text-stone-400 shrink-0">Sugestões:</span>
              <div className="grid grid-cols-4 gap-1.5 flex-1">
                {quickAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleQuickAmount(amt)}
                    className="py-1 px-1.5 rounded-md text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition-all cursor-pointer text-center"
                  >
                    R$ {amt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Resgate de Pedidos Órfãos feitos antes da abertura */}
          {safeOrphans.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Link2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-amber-950 leading-tight">
                    {safeOrphans.length === 1
                      ? "1 pedido entrou antes da abertura do caixa"
                      : `${safeOrphans.length} pedidos entraram antes da abertura do caixa`}
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                    Total acumulado:{" "}
                    <b className="font-mono">
                      R$ {orphanTotal.toFixed(2).replace(".", ",")}
                    </b>
                    {orphanCashCount > 0 && ` • ${orphanCashCount} em dinheiro`}
                  </p>
                </div>
              </div>

              <div className="bg-white/80 border border-amber-200/70 rounded-md p-2 space-y-1 max-h-24 overflow-y-auto">
                {safeOrphans.slice(0, 4).map((ord) => (
                  <div
                    key={ord.id}
                    className="flex items-center justify-between text-[11px] text-stone-700 gap-2"
                  >
                    <span className="truncate font-medium">
                      #{ord.order_number || String(ord.id).slice(-4).toUpperCase()} •{" "}
                      {ord.customer_name || "Cliente"}
                    </span>
                    <span className="font-mono font-semibold text-stone-900 shrink-0">
                      R$ {Number(ord.total_amount ?? ord.total ?? 0).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                ))}
                {safeOrphans.length > 4 && (
                  <p className="text-[10px] text-amber-700 font-medium pt-0.5">
                    + {safeOrphans.length - 4} outro(s) pedido(s)...
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-amber-950 cursor-pointer select-none pt-0.5">
                <input
                  type="checkbox"
                  checked={attachOrphans}
                  onChange={(e) => setAttachOrphans(e.target.checked)}
                  className="rounded border-amber-400 text-emerald-700 focus:ring-emerald-600 h-4 w-4 cursor-pointer"
                />
                <span>Vincular estes pedidos ao turno atual ao abrir</span>
              </label>
            </div>
          )}

          {/* Observações da Abertura */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-stone-700">
              Observações do Turno (Opcional):
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Caixa aberto com moedas de 0,50 e 1,00 para troco..."
              rows={2}
              className="resize-none rounded-lg text-xs border-stone-300 focus-visible:ring-emerald-700"
            />
          </div>

          {/* Alerta de Auditoria */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-2.5 flex items-start gap-2 text-[11px] text-stone-600">
            <AlertCircle className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
            <p className="leading-tight">
              O fundo de troco <b>não entra como venda</b>. Ele apenas registra o dinheiro físico colocado na gaveta para iniciar a operação.
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
            disabled={isSubmitting}
            className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold px-4 h-9 shadow-xs cursor-pointer gap-1.5"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>Confirmar Abertura</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
