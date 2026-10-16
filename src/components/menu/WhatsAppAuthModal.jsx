import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneCall, ShieldCheck, ArrowLeft, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { sendWhatsAppOtp, verifyWhatsAppOtp } from "@/services/whatsappOtpService";
import { toast } from "sonner";

export default function WhatsAppAuthModal({
  isOpen,
  onClose,
  onSuccess,
  title = "Acessar Conta com WhatsApp",
  description = "Receba um código de 6 dígitos no seu WhatsApp para validar seu acesso com total segurança.",
  initialPhone = "",
  initialName = "",
  dark = false,
}) {
  const [step, setStep] = useState("phone_step"); // 'phone_step' | 'code_step'
  const [phone, setPhone] = useState(initialPhone);
  const [fullName, setFullName] = useState(initialName);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const codeInputRef = useRef(null);

  // Formata telefone (XX) XXXXX-XXXX
  const formatPhone = (val) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : "";
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  useEffect(() => {
    if (isOpen) {
      setPhone(formatPhone(initialPhone || ""));
      setFullName(initialName || "");
      setCode("");
      setError("");
      setStep("phone_step");
    }
  }, [isOpen, initialPhone, initialName]);

  // Timer regressivo para reenvio
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Foca no input do código ao mudar para a etapa 2
  useEffect(() => {
    if (step === "code_step") {
      setTimeout(() => {
        codeInputRef.current?.focus();
      }, 200);
    }
  }, [step]);

  const handlePhoneChange = (e) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
    if (error) setError("");
  };

  const handleSendCode = async (e) => {
    e?.preventDefault();
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setError("Informe um número de WhatsApp com DDD (mínimo 10 dígitos).");
      return;
    }
    if (!fullName.trim()) {
      setError("Por favor, informe seu nome completo.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const result = await sendWhatsAppOtp({
        phone: cleanPhone,
        fullName: fullName.trim(),
      });

      if (result.success) {
        setStep("code_step");
        setResendCooldown(60);
        toast.success("Código enviado com sucesso pelo WhatsApp!");
      } else {
        setError(result.error || "Não foi possível enviar o código agora. Tente novamente.");
      }
    } catch (_err) {
      setError("Erro ao se comunicar com o serviço de envio. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e?.preventDefault();
    const cleanCode = code.replace(/\D/g, "").slice(0, 6);
    if (cleanCode.length < 4) {
      setError("Digite o código de 6 dígitos recebido.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const result = await verifyWhatsAppOtp({
        phone: phone.replace(/\D/g, ""),
        code: cleanCode,
        fullName: fullName.trim(),
      });

      if (result.success && result.user) {
        toast.success(`Bem-vindo(a), ${result.user.full_name || "Cliente"}!`);
        if (onSuccess) {
          onSuccess(result.user);
        }
        onClose();
      } else {
        setError(result.error || "Código incorreto ou expirado.");
      }
    } catch (_err) {
      setError("Erro ao validar código. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`max-w-[420px] p-6 rounded-3xl sm:rounded-3xl border shadow-2xl transition-all ${
          dark
            ? "bg-stone-900 border-stone-800 text-stone-100"
            : "bg-white border-stone-200 text-[#171717]"
        }`}
      >
        <DialogHeader className="text-center pb-2">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm ${
              dark
                ? "bg-emerald-950/80 border border-emerald-500/40 text-emerald-400"
                : "bg-[#D1E9DF]/70 border border-[#D1E9DF] text-[#047857]"
            }`}
          >
            {step === "phone_step" ? (
              <PhoneCall className="w-7 h-7" />
            ) : (
              <ShieldCheck className="w-7 h-7" />
            )}
          </div>
          <DialogTitle
            className={`font-black text-xl tracking-tight ${dark ? "text-white" : "text-[#171717]"}`}
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            {step === "phone_step" ? title : "Digite o Código Recebido"}
          </DialogTitle>
          <DialogDescription
            className={`text-xs mt-1.5 leading-relaxed ${dark ? "text-stone-400" : "text-stone-500"}`}
          >
            {step === "phone_step"
              ? description
              : `Enviamos um código de verificação para o WhatsApp ${phone}.`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-in fade-in">
            {error}
          </div>
        )}

        {step === "phone_step" ? (
          <form onSubmit={handleSendCode} className="space-y-4 mt-1">
            <div>
              <Label
                htmlFor="auth-phone"
                className={`text-xs font-bold uppercase tracking-wider ${
                  dark ? "text-stone-300" : "text-stone-700"
                }`}
              >
                Número do WhatsApp *
              </Label>
              <Input
                id="auth-phone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={handlePhoneChange}
                required
                className={`mt-1.5 rounded-xl h-11 text-base sm:text-sm font-medium ${
                  dark
                    ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-600 focus-visible:ring-emerald-500"
                    : "bg-[#F7F9F8] border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
                }`}
              />
            </div>

            <div>
              <Label
                htmlFor="auth-name"
                className={`text-xs font-bold uppercase tracking-wider ${
                  dark ? "text-stone-300" : "text-stone-700"
                }`}
              >
                Seu Nome Completo *
              </Label>
              <Input
                id="auth-name"
                type="text"
                placeholder="Ex: Carlos Oliveira"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (error) setError("");
                }}
                required
                className={`mt-1.5 rounded-xl h-11 text-base sm:text-sm ${
                  dark
                    ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-600 focus-visible:ring-emerald-500"
                    : "bg-[#F7F9F8] border-stone-200 text-[#171717] placeholder:text-stone-400 focus-visible:ring-[#047857]"
                }`}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className={`w-full font-black h-12 rounded-xl shadow-md flex items-center justify-center gap-2 mt-2 cursor-pointer transition-all ${
                dark
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-[#047857] hover:bg-[#065f46] text-white"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando código...</span>
                </>
              ) : (
                <>
                  <PhoneCall className="w-4 h-4" />
                  <span>Enviar Código no WhatsApp</span>
                </>
              )}
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-400 font-medium pt-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Sem senhas. Confirmação instantânea por WhatsApp.</span>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4 mt-1">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label
                  htmlFor="auth-code"
                  className={`text-xs font-bold uppercase tracking-wider ${
                    dark ? "text-stone-300" : "text-stone-700"
                  }`}
                >
                  Código de 6 dígitos
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone_step");
                    setError("");
                  }}
                  className={`text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                    dark
                      ? "text-emerald-400 hover:text-emerald-300"
                      : "text-[#047857] hover:text-[#065f46]"
                  }`}
                >
                  <ArrowLeft className="w-3 h-3" />
                  Trocar número
                </button>
              </div>

              <Input
                ref={codeInputRef}
                id="auth-code"
                type="text"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(val);
                  if (error) setError("");
                }}
                required
                className={`mt-1 rounded-xl h-14 text-center text-2xl font-black tracking-[0.5em] font-mono ${
                  dark
                    ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-700 focus-visible:ring-emerald-500"
                    : "bg-[#F7F9F8] border-stone-300 text-[#171717] placeholder:text-stone-300 focus-visible:ring-[#047857]"
                }`}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || code.length < 4}
              className={`w-full font-black h-12 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all ${
                dark
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-[#047857] hover:bg-[#065f46] text-white"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validando código...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirmar e Entrar</span>
                </>
              )}
            </Button>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                disabled={resendCooldown > 0 || isLoading}
                onClick={handleSendCode}
                className={`text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                  dark
                    ? "text-stone-400 hover:text-stone-200"
                    : "text-stone-600 hover:text-[#047857]"
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                {resendCooldown > 0
                  ? `Reenviar código em ${resendCooldown}s`
                  : "Reenviar código no WhatsApp"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
