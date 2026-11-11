import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  AlertTriangle, 
  Coins, 
  Ticket, 
  CheckCircle2, 
  QrCode, 
  X, 
  Loader2 
} from "lucide-react";

const CANCEL_REASONS = [
  "Cliente solicitou o cancelamento",
  "Falta de ingredientes / Produto esgotado",
  "Endereço fora da área de entrega",
  "Cozinha sobrecarregada / Atraso excessivo",
  "Suspeita de trote / Dados de contato inválidos",
  "Problema operacional / Equipamento indisponível",
  "Outro motivo (especificar abaixo)",
];

export default function CancelOrderModal({
  open,
  onOpenChange,
  order,
  tenant,
  settings,
  onConfirmCancel,
}) {
  const [selectedReason, setSelectedReason] = useState(CANCEL_REASONS[0]);
  const [customReasonDetails, setCustomReasonDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (order) {
      setSelectedReason(CANCEL_REASONS[0]);
      setCustomReasonDetails("");
    }
  }, [order, open]);

  if (!order) return null;

  const orderNum = order.order_number 
    ? String(order.order_number).padStart(3, "0") 
    : String(order.id || "").slice(-4).toUpperCase();
  const orderTotal = Number(order.total_amount || order.total || 0);
  const hasPixOnline = (order.payment_method === "pix_online" || order.payment_status === "paid") && Boolean(order.mp_payment_id);
  const hasCashbackUsed = Number(order.cashback_discount || 0) > 0;
  const hasCashbackEarned = Number(order.cashback_earned || 0) > 0;
  const hasCoupon = Boolean(order.coupon_code && Number(order.discount_amount || 0) > 0);

  const mpAccessToken = tenant?.payment_methods?.mp_access_token 
    || settings?.payment_methods?.mp_access_token 
    || "";

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isSubmitting) return;

    const fullReason = selectedReason === "Outro motivo (especificar abaixo)"
      ? (customReasonDetails.trim() || "Outro motivo")
      : (customReasonDetails.trim() ? `${selectedReason} - ${customReasonDetails.trim()}` : selectedReason);

    setIsSubmitting(true);
    try {
      await onConfirmCancel({
        orderId: order.id,
        cancelReason: fullReason,
        refundPix: hasPixOnline,
        refundPixAmount: orderTotal,
        revertCashback: true,
        mpAccessToken,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Topo Vermelho de Alerta - Fixo */}
        <div className="bg-red-50/90 border-b border-red-100 p-5 flex items-start gap-3.5 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-red-100 border border-red-200 flex items-center justify-center shrink-0 text-red-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-lg font-black text-stone-900 tracking-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Cancelar Pedido #{orderNum}
            </DialogTitle>
            <p className="text-xs text-stone-600 mt-0.5">
              Cliente: <span className="font-bold text-stone-800">{order.customer_name || "Cliente"}</span> • Total: <span className="font-bold text-stone-800">R$ {orderTotal.toFixed(2).replace(".", ",")}</span>
            </p>
          </div>
        </div>

        {/* Corpo com Scroll Suave e Barra Visível */}
        <div className="p-5 space-y-5 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
          {/* 1. Motivo do Cancelamento */}
          <div>
            <Label className="text-xs font-bold text-stone-700 uppercase tracking-wider block mb-2">
              Motivo do Cancelamento *
            </Label>
            <div className="space-y-1.5">
              {CANCEL_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedReason(reason)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all border flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? "bg-red-50 border-red-300 text-red-900 shadow-2xs"
                        : "bg-stone-50/70 border-stone-200 text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    <span>{reason}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-red-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Campo de observações complementares */}
            <div className="mt-3">
              <Textarea
                placeholder="Detalhes adicionais ou justificativa para registro interno (opcional)..."
                value={customReasonDetails}
                onChange={(e) => setCustomReasonDetails(e.target.value)}
                rows={2}
                className="text-xs rounded-xl border-stone-200 focus-visible:ring-red-500/20"
              />
            </div>
          </div>

          {/* 2. Bloco de Estorno Pix Mercado Pago - OBRIGATÓRIO E AUTOMÁTICO */}
          {hasPixOnline && (
            <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-100 border border-sky-300/60 flex items-center justify-center text-sky-700">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-sky-950 uppercase tracking-wide">
                      Estorno PIX Mercado Pago
                    </h4>
                    <p className="text-[11px] text-sky-800 font-medium">
                      Pagamento #{order.mp_payment_id}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Estorno Obrigatório
                </span>
              </div>

              <div className="bg-white/95 border border-sky-100 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-sky-950">
                  <span>Valor a Devolver Instantaneamente:</span>
                  <span className="text-sm font-black text-emerald-700">
                    R$ {orderTotal.toFixed(2).replace(".", ",")}
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-snug">
                  Como o pedido foi pago via Pix Online, <strong>o estorno de 100% do valor é obrigatório e automático</strong>. O dinheiro retornará para a conta bancária do cliente no mesmo instante via Banco Central.
                </p>
                {!mpAccessToken && (
                  <p className="text-[11px] text-amber-700 font-bold bg-amber-50 p-2 rounded-lg border border-amber-200">
                    ⚠️ Atenção: Token do Mercado Pago não encontrado nas configurações da loja. O estorno pode exigir confirmação manual no app do Mercado Pago.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 3. Bloco de Ajuste Automático de Cashback */}
          {(hasCashbackUsed || hasCashbackEarned) && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300/60 flex items-center justify-center text-amber-800">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">
                      Ajuste de Cashback da Loja
                    </h4>
                    <p className="text-[11px] text-amber-800 font-medium">
                      Carteira do Cliente ({order.customer_phone || "Cliente"})
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
                  Automático
                </span>
              </div>

              <div className="bg-white/95 border border-amber-100 rounded-xl p-3 space-y-1.5 text-xs text-stone-700">
                {hasCashbackUsed && (
                  <div className="flex items-center justify-between font-bold text-emerald-800">
                    <span>✓ Devolver saldo utilizado pelo cliente:</span>
                    <span>+ R$ {Number(order.cashback_discount).toFixed(2).replace(".", ",")}</span>
                  </div>
                )}
                {hasCashbackEarned && (
                  <div className="flex items-center justify-between font-medium text-stone-600">
                    <span>✓ Anular previsão de bônus gerado:</span>
                    <span className="text-red-700">- R$ {Number(order.cashback_earned).toFixed(2).replace(".", ",")}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Bloco de Cupom de Desconto */}
          {hasCoupon && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-emerald-900">
              <Ticket className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                O cupom <strong>{order.coupon_code}</strong> será desvinculado e ficará livre para o cliente utilizar novamente.
              </span>
            </div>
          )}
        </div>

        {/* Rodapé Fixo com Botões */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-xl text-xs font-bold px-4 h-10 border-stone-300 text-stone-700 hover:bg-stone-100"
          >
            Voltar
          </Button>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-xl text-xs font-black px-5 h-10 bg-red-600 hover:bg-red-700 text-white shadow-md active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              <>
                <X className="w-4 h-4" />
                <span>Confirmar Cancelamento</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

