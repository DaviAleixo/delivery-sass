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
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPixPayment, checkPaymentStatus } from "@/services/mercadoPagoService";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function PixOnlineModal({
  isOpen,
  onClose,
  order,
  accessToken,
  onPaymentApproved
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentData, setPaymentData] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutos

  const pollIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // 1. Gera a cobrança PIX ao abrir
  useEffect(() => {
    if (!isOpen || !order || !accessToken) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setIsApproved(false);
    setTimeLeft(900);

    const generatePix = async () => {
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

        if (!isMounted) return;

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
              })
              .eq("id", order.id)
              .then(() => {});
          }
        } else {
          setError(res.error || "Não foi possível gerar o QR Code do PIX.");
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Erro de conexão ao gerar o PIX.");
          setIsLoading(false);
        }
      }
    };

    generatePix();

    return () => {
      isMounted = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isOpen, order?.id, accessToken]);

  // 2. Polling de status a cada 3 segundos
  useEffect(() => {
    if (!paymentData?.paymentId || isApproved || !isOpen) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const checkRes = await checkPaymentStatus({
          accessToken,
          paymentId: paymentData.paymentId,
          orderId: order?.id,
        });

        if (checkRes.isApproved) {
          setIsApproved(true);
          clearInterval(pollIntervalRef.current);

          // Atualiza status do pedido no Supabase para 'pago' e 'pendente' (para o restaurante aceitar no painel)
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

          // Notifica pai após 2 segundos de celebração
          setTimeout(() => {
            if (onPaymentApproved) {
              onPaymentApproved({ ...order, payment_status: "paid", status: "pendente" });
            }
          }, 2000);
        }
      } catch (_e) {
        // Falhas silenciosas no polling
      }
    }, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [paymentData?.paymentId, isApproved, isOpen, order?.id, accessToken, onPaymentApproved]);

  // 3. Contador regressivo de 15 minutos
  useEffect(() => {
    if (!isOpen || isApproved) return;

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isOpen, isApproved]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-stone-900 border border-stone-800 text-white rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-center space-y-4">
        {/* Fechar Modal */}
        {!isApproved && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-stone-400 hover:text-white p-1 rounded-full hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Título & Badge */}
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            PIX Automático Mercado Pago
          </div>
          <h3 className="text-xl font-black text-white">
            {isApproved ? "Pagamento Aprovado! 🎉" : "Pague via PIX"}
          </h3>
          <p className="text-xs text-stone-400 mt-1">
            {isApproved
              ? "Recebemos sua confirmação. Enviando para a cozinha..."
              : `Total a pagar: R$ ${(order?.total_amount || order?.total || 0).toFixed(2).replace(".", ",")}`}
          </p>
        </div>

        {/* Loading inicial */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-xs text-stone-400 font-medium">
              Gerando QR Code exclusivo com o Mercado Pago...
            </p>
          </div>
        )}

        {/* Erro */}
        {error && !isLoading && (
          <div className="py-8 space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <p className="text-xs text-rose-300 px-4">{error}</p>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-stone-700 text-white text-xs"
            >
              Escolher outra forma de pagamento
            </Button>
          </div>
        )}

        {/* Tela de Sucesso Instantâneo */}
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

        {/* Exibição do QR Code e Copia e Cola */}
        {!isLoading && !error && !isApproved && paymentData && (
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

            {/* Contador de expiração */}
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

            <div className="pt-2 border-t border-stone-800 flex items-center justify-center gap-1.5 text-[10px] text-stone-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Transação protegida pelo Mercado Pago</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
