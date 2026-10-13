import React, { useState, useEffect, useRef } from "react";
import { 
  QrCode, 
  Copy, 
  Check, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  X,
  RefreshCw,
  CreditCard,
  Banknote,
  RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPixPayment, checkPaymentStatus } from "@/services/mercadoPagoService";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { toast } from "sonner";

// Tradução de detalhes de status do Mercado Pago para mensagens amigáveis
function getFriendlyRejectionReason(statusDetail) {
  switch (statusDetail) {
    case "cc_rejected_insufficient_amount":
      return "Saldo insuficiente na sua conta bancária.";
    case "cc_rejected_bad_filled_security_code":
    case "cc_rejected_bad_filled_other":
      return "Dados bancários informados não puderam ser validados.";
    case "cc_rejected_call_for_authorize":
      return "A transação não foi autorizada pelo seu banco emissor.";
    case "cc_rejected_max_attempts":
      return "Limite de tentativas de pagamento atingido no banco.";
    case "expired":
      return "O tempo para pagamento deste QR Code expirou.";
    case "cancelled":
      return "A transação foi cancelada pela instituição financeira.";
    default:
      return "O pagamento via PIX foi recusado pela sua instituição financeira.";
  }
}

export default function PixOnlineModal({
  isOpen,
  onClose,
  order,
  accessToken,
  tenant,
  onPaymentApproved,
  onPaymentConvertedToDelivery,
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentData, setPaymentData] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [isRejected, setIsRejected] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutos em segundos

  const pollIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // 1. Gera ou Regenera a cobrança PIX
  const generatePix = async () => {
    if (!order || !accessToken) return;

    setIsLoading(true);
    setError(null);
    setIsApproved(false);
    setIsRejected(false);
    setIsExpired(false);
    setRejectionReason("");
    setTimeLeft(900);

    try {
      const cleanPhone = String(order.customer_phone || "").replace(/\D/g, "");
      const fallbackEmail = cleanPhone && cleanPhone.length >= 10
        ? `pix.${cleanPhone}@vruum.com.br`
        : "pix.cliente@vruum.com.br";

      const res = await createPixPayment({
        accessToken,
        orderId: order.id,
        orderNumber: order.order_number || order.id?.slice(-4),
        amount: order.total_amount || order.total || 0,
        description: `Pedido #${order.order_number || order.id?.slice(-4)} - Delivery`,
        payerEmail: (order.customer_email && /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(order.customer_email))
          ? order.customer_email.trim().toLowerCase()
          : (order.user_email && /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(order.user_email))
          ? order.user_email.trim().toLowerCase()
          : fallbackEmail,
        payerName: order.customer_name || "Cliente",
        payerPhone: cleanPhone,
      });

      if (res.success && res.qrCode) {
        setPaymentData(res);
        setIsLoading(false);

        // Salva o ID do pagamento no pedido no Supabase
        if (isSupabaseConfigured() && supabase && res.paymentId) {
          supabase
            .from("orders")
            .update({
              mp_payment_id: String(res.paymentId),
              payment_status: "pending",
              status: "aguardando_pagamento",
            })
            .eq("id", order.id)
            .then(() => {});
        }
      } else {
        setError(res.error || "Não foi possível gerar o QR Code do PIX.");
        setIsLoading(false);
      }
    } catch (err) {
      setError(err.message || "Erro de conexão ao gerar o PIX.");
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !order || !accessToken) return;
    generatePix();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isOpen, order?.id, accessToken]);

  // 2. Polling de status a cada 3 segundos com tratamento de Recusa e Expiração
  useEffect(() => {
    if (!paymentData?.paymentId || isApproved || isRejected || isExpired || !isOpen) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const checkRes = await checkPaymentStatus({
          accessToken,
          paymentId: paymentData.paymentId,
          orderId: order?.id,
        });

        // Caso A: Pagamento Aprovado com Sucesso!
        if (checkRes.isApproved) {
          setIsApproved(true);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

          // Atualiza status do pedido no Supabase para 'paid' e 'pendente' (entra na cozinha/KDS)
          if (isSupabaseConfigured() && supabase) {
            await supabase
              .from("orders")
              .update({
                payment_status: "paid",
                status: "pendente",
                updated_date: new Date().toISOString(),
              })
              .eq("id", order.id);
          }

          toast.success("Pagamento PIX Aprovado com Sucesso! 🎉");

          setTimeout(() => {
            if (onPaymentApproved) {
              onPaymentApproved({ ...order, payment_status: "paid", status: "pendente" });
            }
          }, 2000);
          return;
        }

        // Caso B: Pagamento Recusado ou Cancelado pelo Banco Emissor
        if (checkRes.status === "rejected" || checkRes.status === "cancelled") {
          setIsRejected(true);
          setRejectionReason(getFriendlyRejectionReason(checkRes.statusDetail || checkRes.status));
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

          if (isSupabaseConfigured() && supabase) {
            await supabase
              .from("orders")
              .update({
                payment_status: "failed",
                updated_date: new Date().toISOString(),
              })
              .eq("id", order.id);
          }
          return;
        }
      } catch (_e) {
        // Falhas silenciosas de rede no polling
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [paymentData?.paymentId, isApproved, isRejected, isExpired, isOpen, order?.id, accessToken, onPaymentApproved]);

  // 3. Contador regressivo de 15 minutos com detecção de Expiração
  useEffect(() => {
    if (!isOpen || isApproved || isRejected || isExpired) return;

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setIsExpired(true);

          if (isSupabaseConfigured() && supabase && order?.id) {
            supabase
              .from("orders")
              .update({
                payment_status: "expired",
                updated_date: new Date().toISOString(),
              })
              .eq("id", order.id)
              .then(() => {});
          }

          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isOpen, isApproved, isRejected, isExpired, order?.id]);

  // Conversão de Emergência: Pagar na Entrega (Cartão ou Dinheiro)
  const handleConvertToDelivery = async (method = "card_delivery") => {
    if (!order?.id || isSwitching) return;
    setIsSwitching(true);

    try {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      const updatedFields = {
        payment_method: method,
        payment_status: "pending_delivery",
        status: "pendente", // Ativa na cozinha com aviso de pagamento na entrega
        updated_date: new Date().toISOString(),
      };

      if (isSupabaseConfigured() && supabase) {
        await supabase
          .from("orders")
          .update(updatedFields)
          .eq("id", order.id);
      }

      const methodLabel = method === "card_delivery" ? "Cartão na Entrega" : "Dinheiro na Entrega";
      toast.success(`Forma de pagamento alterada para ${methodLabel}! Pedido enviado para a cozinha.`);

      if (onPaymentConvertedToDelivery) {
        onPaymentConvertedToDelivery({ ...order, ...updatedFields });
      } else if (onPaymentApproved) {
        onPaymentApproved({ ...order, ...updatedFields });
      }
    } catch (err) {
      toast.error("Erro ao alterar forma de pagamento. Tente novamente.");
    } finally {
      setIsSwitching(false);
    }
  };

  const handleCopy = () => {
    if (!paymentData?.qrCode) return;
    navigator.clipboard.writeText(paymentData.qrCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="bg-stone-900 border border-stone-800 text-white rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-center space-y-4">
        {/* Fechar Modal (apenas quando não aprovado) */}
        {!isApproved && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-stone-400 hover:text-white p-1 rounded-full hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Título & Badge Principal */}
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            PIX Automático Mercado Pago
          </div>
          <h3 className="text-xl font-black text-white">
            {isApproved
              ? "Pagamento Aprovado! 🎉"
              : isRejected
              ? "Pagamento Não Aprovado ❌"
              : isExpired
              ? "Tempo Esgotado ⏰"
              : "Pague via PIX"}
          </h3>
          <p className="text-xs text-stone-400 mt-1">
            {isApproved
              ? "Recebemos sua confirmação. Enviando para a cozinha..."
              : isRejected
              ? "Sua instituição financeira não aprovou esta transação."
              : isExpired
              ? "O tempo limite de 15 minutos para este código PIX expirou."
              : `Total a pagar: R$ ${(order?.total_amount || order?.total || 0).toFixed(2).replace(".", ",")}`}
          </p>
        </div>

        {/* 1. Loading Inicial */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-xs text-stone-400 font-medium">
              Gerando QR Code exclusivo com o Mercado Pago...
            </p>
          </div>
        )}

        {/* 2. Erro Técnico de Conexão */}
        {error && !isLoading && (
          <div className="py-8 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-xs text-rose-300 px-4">{error}</p>
            <div className="space-y-2">
              <Button
                type="button"
                onClick={generatePix}
                className="w-full bg-stone-800 hover:bg-stone-700 text-white text-xs h-10 rounded-2xl gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar Gerar Novamente
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleConvertToDelivery("card_delivery")}
                disabled={isSwitching}
                className="w-full border-stone-700 hover:bg-stone-800 text-white text-xs h-10 rounded-2xl gap-2 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                Pagar com Cartão na Entrega
              </Button>
            </div>
          </div>
        )}

        {/* 3. Tela de Sucesso Instantâneo */}
        {isApproved && (
          <div className="py-8 space-y-3 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-950/50">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
            </div>
            <p className="text-sm font-extrabold text-emerald-300">
              Obrigado! O restaurante já foi notificado.
            </p>
            <p className="text-xs text-stone-400">
              Você será redirecionado para acompanhar o preparo...
            </p>
          </div>
        )}

        {/* 4. Tela de Pagamento Recusado / Cancelado pelo Banco */}
        {isRejected && !isApproved && (
          <div className="py-6 space-y-4 animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/50">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="bg-rose-950/30 border border-rose-500/20 rounded-2xl p-3 text-left">
              <p className="text-xs font-semibold text-rose-300">Motivo informado:</p>
              <p className="text-xs text-stone-300 mt-0.5">{rejectionReason}</p>
            </div>
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                onClick={generatePix}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs h-11 rounded-2xl gap-2 cursor-pointer shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                Gerar Novo Código PIX
              </Button>
              <Button
                type="button"
                onClick={() => handleConvertToDelivery("card_delivery")}
                disabled={isSwitching}
                variant="outline"
                className="w-full border-stone-700 hover:bg-stone-800 text-white font-medium text-xs h-11 rounded-2xl gap-2 cursor-pointer"
              >
                {isSwitching ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4 text-amber-400" />}
                Pagar com Cartão na Entrega
              </Button>
              <Button
                type="button"
                onClick={() => handleConvertToDelivery("money")}
                disabled={isSwitching}
                variant="ghost"
                className="w-full text-stone-400 hover:text-white text-xs h-9 rounded-2xl gap-2 cursor-pointer"
              >
                <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                Pagar com Dinheiro na Entrega
              </Button>
            </div>
          </div>
        )}

        {/* 5. Tela de Tempo Esgotado / PIX Expirado */}
        {isExpired && !isApproved && !isRejected && (
          <div className="py-6 space-y-4 animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-lg shadow-amber-950/50">
              <Clock className="w-8 h-8" />
            </div>
            <p className="text-xs text-stone-300 px-3 leading-relaxed">
              Para sua segurança, os códigos PIX possuem validade de 15 minutos no Banco Central. Deseja reativar o pedido?
            </p>
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                onClick={generatePix}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs h-11 rounded-2xl gap-2 cursor-pointer shadow-md"
              >
                <RotateCcw className="w-4 h-4" />
                Gerar Novo PIX de 15 Minutos
              </Button>
              <Button
                type="button"
                onClick={() => handleConvertToDelivery("card_delivery")}
                disabled={isSwitching}
                variant="outline"
                className="w-full border-stone-700 hover:bg-stone-800 text-white font-medium text-xs h-11 rounded-2xl gap-2 cursor-pointer"
              >
                {isSwitching ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4 text-amber-400" />}
                Pagar com Cartão na Entrega
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="w-full text-stone-400 hover:text-white text-xs h-9 cursor-pointer"
              >
                Voltar ao Cardápio
              </Button>
            </div>
          </div>
        )}

        {/* 6. Exibição Normal do QR Code e Copia e Cola (Aguardando Pagamento) */}
        {!isLoading && !error && !isApproved && !isRejected && !isExpired && paymentData && (
          <div className="space-y-4">
            {/* Imagem do QR Code */}
            <div className="p-3 bg-white rounded-2xl mx-auto w-fit shadow-md border-2 border-emerald-500/40">
              {paymentData.qrCodeBase64 ? (
                <img
                  src={`data:image/png;base64,${paymentData.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-48 h-48 mx-auto"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-stone-100 text-stone-700">
                  <QrCode className="w-24 h-24" />
                </div>
              )}
            </div>

            {/* Contador de Expiração Regressivo */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Expira em: <strong className="text-amber-300 font-mono">{formatTime(timeLeft)}</strong></span>
            </div>

            {/* Botão Copiar PIX */}
            <Button
              type="button"
              onClick={handleCopy}
              className={`w-full font-bold text-xs h-11 rounded-2xl shadow-lg transition-all cursor-pointer ${
                isCopied
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-emerald-500 hover:bg-emerald-400 text-stone-950"
              }`}
            >
              {isCopied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Código Copiado com Sucesso!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar Código PIX (Copia e Cola)
                </>
              )}
            </Button>

            {/* Instruções */}
            <p className="text-[11px] text-stone-400 leading-relaxed px-2">
              Abra o app do seu banco, escolha <strong>PIX Copia e Cola</strong> ou aponte a câmera. A confirmação é <strong>automática na tela em 2 segundos</strong>!
            </p>

            <div className="pt-2 border-t border-stone-800 flex items-center justify-between text-[10px] text-stone-500">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Mercado Pago Oficial
              </span>
              <button
                type="button"
                onClick={() => handleConvertToDelivery("card_delivery")}
                className="text-stone-400 hover:text-amber-400 underline cursor-pointer"
              >
                Prefere pagar na entrega?
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
