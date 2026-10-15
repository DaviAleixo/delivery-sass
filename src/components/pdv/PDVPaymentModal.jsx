import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { Label } from "@/components/ui/label";
import { Banknote, CreditCard, Smartphone, CheckCircle } from "lucide-react";

const PAYMENT_METHODS = [
  {
    key: "dinheiro",
    label: "Dinheiro",
    icon: Banknote,
    activeClass: "border-green-500 bg-green-50 text-green-700",
    iconColor: "text-green-600",
  },
  {
    key: "pix",
    label: "PIX",
    icon: Smartphone,
    activeClass: "border-blue-500 bg-blue-50 text-blue-700",
    iconColor: "text-blue-600",
  },
  {
    key: "cartao",
    label: "Cartão",
    icon: CreditCard,
    activeClass: "border-purple-500 bg-purple-50 text-purple-700",
    iconColor: "text-purple-600",
  },
];

export default function PDVPaymentModal({ total, customerName, customerPhone, onConfirm, onClose }) {
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  const received = parseBRLToNumber(receivedAmount);
  const change = received - total;
  const isMoneyValid = paymentMethod === "dinheiro" ? received >= total : true;
  const canConfirm = paymentMethod && isMoneyValid;

  // Foco no input de dinheiro ao selecionar
  useEffect(() => {
    if (paymentMethod === "dinheiro") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [paymentMethod]);

  // Atalho ENTER para confirmar
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Enter" && canConfirm && !isSubmitting) {
        handleConfirm();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [canConfirm, isSubmitting, paymentMethod]);

  const handleConfirm = async () => {
    if (!canConfirm || isSubmitting) return;
    setIsSubmitting(true);
    await onConfirm(paymentMethod);
    setIsSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Forma de Pagamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Valor total destacado */}
          <div className="bg-gray-900 rounded-2xl p-5 text-center">
            {customerName && (
              <div className="inline-flex items-center gap-1.5 bg-gray-800/90 text-emerald-300 text-xs px-3 py-1 rounded-full mb-3 font-semibold border border-gray-700 max-w-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">{customerName}</span>
                {customerPhone && <span className="text-gray-400 font-normal shrink-0">({customerPhone})</span>}
              </div>
            )}
            <p className="text-sm text-gray-400 mb-1">Valor a pagar</p>
            <p className="text-4xl font-bold text-white">
              R$ {total.toFixed(2).replace(".", ",")}
            </p>
          </div>

          {/* Botões de pagamento */}
          <div className="grid grid-cols-3 gap-3">
            {PAYMENT_METHODS.map(({ key, label, icon: Icon, activeClass }) => {
              const isActive = paymentMethod === key;
              return (
                <button
                  key={key}
                  onClick={() => { setPaymentMethod(key); setReceivedAmount(""); }}
                  className={`border-2 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all duration-150 font-semibold text-sm ${
                    isActive
                      ? activeClass + " shadow-md scale-105"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <Icon className={`w-8 h-8 ${isActive ? "" : "text-gray-400"}`} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Seção de troco (apenas dinheiro) */}
          {paymentMethod === "dinheiro" && (
            <div className="space-y-3">
              <div>
                <Label className="font-semibold">Valor recebido (R$)</Label>
                <CurrencyInput
                  ref={inputRef}
                  value={receivedAmount}
                  onChange={(e) => setReceivedAmount(e.target.value)}
                  placeholder="R$ 0,00"
                  className="text-2xl h-14 mt-1 font-bold text-center"
                />
              </div>

              {receivedAmount && change >= 0 && (
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-500 font-medium">Troco</p>
                  <p className="text-3xl font-bold text-green-700">
                    R$ {change.toFixed(2).replace(".", ",")}
                  </p>
                </div>
              )}

              {receivedAmount && change < 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center text-red-600 text-sm font-semibold">
                  Valor insuficiente — faltam R$ {Math.abs(change).toFixed(2).replace(".", ",")}
                </div>
              )}
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 h-12" disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || isSubmitting}
              className="flex-1 h-12 text-base font-bold bg-green-600 hover:bg-green-700 gap-2"
            >
              {isSubmitting ? (
                "Finalizando..."
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Confirmar
                </>
              )}
            </Button>
          </div>
          <p className="text-center text-xs text-gray-400">Pressione ENTER para confirmar</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}