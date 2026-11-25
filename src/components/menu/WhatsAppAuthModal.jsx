import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Smartphone, ShieldCheck, ArrowLeft, Loader2, RefreshCw, User as UserIcon } from "lucide-react";
import { sendWhatsAppOtp, verifyWhatsAppOtp } from "@/services/whatsappOtpService";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { User } from "@/entities/User";
import { toast } from "sonner";

export default function WhatsAppAuthModal({
  isOpen,
  onClose,
  onSuccess,
  title = "Acessar Conta",
  initialPhone = "",
  dark = false,
}) {
  const [step, setStep] = useState("phone_step"); // 'phone_step' | 'code_step' | 'name_step'
  const [phone, setPhone] = useState(initialPhone);
  const [isConfirmingPhone, setIsConfirmingPhone] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [code, setCode] = useState("");
  const [verifiedUser, setVerifiedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const codeInputRef = useRef(null);
  const nameInputRef = useRef(null);

  // Escada progressiva de espera para reenvio (Backoff anti-spam)
  // 1º reenvio: 1 min (60s)
  // 2º reenvio: 5 min (300s)
  // 3º reenvio: 10 min (600s)
  // 4º reenvio: 30 min (1800s)
  // 5º+ reenvio: 1 hora (3600s)
  const getCooldownByAttempt = (attemptCount) => {
    if (attemptCount <= 1) return 60;
    if (attemptCount === 2) return 300;
    if (attemptCount === 3) return 600;
    if (attemptCount === 4) return 1800;
    return 3600;
  };

  const formatCooldown = (seconds) => {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${String(m).padStart(2, "0")}m`;
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const getStoredOtpState = (phoneDigits) => {
    try {
      const raw = localStorage.getItem(`pedemuleke_otp_rate_${phoneDigits}`);
      if (!raw) return { attempts: 0, cooldownUntil: 0 };
      return JSON.parse(raw);
    } catch {
      return { attempts: 0, cooldownUntil: 0 };
    }
  };

  const saveOtpState = (phoneDigits, attempts, cooldownSeconds) => {
    try {
      const cooldownUntil = Date.now() + cooldownSeconds * 1000;
      localStorage.setItem(
        `pedemuleke_otp_rate_${phoneDigits}`,
        JSON.stringify({ attempts, cooldownUntil })
      );
    } catch {
      // ignore
    }
  };

  // Formata telefone (XX) XXXXX-XXXX
  const formatPhone = (val) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : "";
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  useEffect(() => {
    if (isOpen) {
      const formatted = formatPhone(initialPhone || "");
      setPhone(formatted);
      setIsConfirmingPhone(false);
      setNameInput("");
      setCode("");
      setError("");
      setStep("phone_step");
      setVerifiedUser(null);

      // Checa cooldown ativo
      const clean = formatted.replace(/\D/g, "");
      if (clean.length >= 10) {
        const stored = getStoredOtpState(clean);
        if (stored.cooldownUntil > Date.now()) {
          const remainingSecs = Math.ceil((stored.cooldownUntil - Date.now()) / 1000);
          setResendCooldown(remainingSecs);
        }
      }
    }
  }, [isOpen, initialPhone]);

  // Timer regressivo
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Foco inteligente por etapa
  useEffect(() => {
    if (step === "code_step") {
      setTimeout(() => codeInputRef.current?.focus(), 150);
    } else if (step === "name_step") {
      setTimeout(() => nameInputRef.current?.focus(), 150);
    }
  }, [step]);

  const handlePhoneChange = (e) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
    if (error) setError("");

    const clean = formatted.replace(/\D/g, "");
    if (clean.length >= 10) {
      const stored = getStoredOtpState(clean);
      if (stored.cooldownUntil > Date.now()) {
        const remainingSecs = Math.ceil((stored.cooldownUntil - Date.now()) / 1000);
        setResendCooldown(remainingSecs);
      } else {
        setResendCooldown(0);
      }
    }
  };

  // Validação preliminar e solicitação de confirmação do número
  const handlePhoneStepSubmit = (e) => {
    e?.preventDefault();
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setError("Informe um número de celular válido com DDD.");
      return;
    }

    const stored = getStoredOtpState(cleanPhone);
    if (stored.cooldownUntil > Date.now()) {
      const remainingSecs = Math.ceil((stored.cooldownUntil - Date.now()) / 1000);
      setResendCooldown(remainingSecs);
      setError(`Aguarde ${formatCooldown(remainingSecs)} antes de solicitar um novo código.`);
      return;
    }

    setError("");
    setIsConfirmingPhone(true);
  };

  // PASSO 1: Enviar Código por SMS (Após confirmação explícita do número)
  const handleSendCode = async (skipConfirmation = false) => {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setError("Informe um número de celular válido com DDD.");
      return;
    }

    const stored = getStoredOtpState(cleanPhone);
    if (stored.cooldownUntil > Date.now()) {
      const remainingSecs = Math.ceil((stored.cooldownUntil - Date.now()) / 1000);
      setResendCooldown(remainingSecs);
      setError(`Aguarde ${formatCooldown(remainingSecs)} antes de solicitar um novo código.`);
      setIsConfirmingPhone(false);
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const result = await sendWhatsAppOtp({
        phone: cleanPhone,
        fullName: "",
      });

      if (result.success) {
        const nextAttempt = (stored.attempts || 0) + 1;
        const cooldownSecs = getCooldownByAttempt(nextAttempt);
        saveOtpState(cleanPhone, nextAttempt, cooldownSecs);
        setResendCooldown(cooldownSecs);

        setIsConfirmingPhone(false);
        setStep("code_step");
        toast.success("Código SMS enviado com sucesso!");
      } else {
        if (result.rate_limited && result.wait_seconds) {
          const waitSecs = Number(result.wait_seconds);
          saveOtpState(cleanPhone, (stored.attempts || 1) + 1, waitSecs);
          setResendCooldown(waitSecs);
        }
        setIsConfirmingPhone(false);
        setError(result.error || "Não foi possível enviar o código agora. Tente novamente.");
      }
    } catch (_err) {
      setIsConfirmingPhone(false);
      setError("Erro ao se comunicar com o serviço de envio de SMS.");
    } finally {
      setIsLoading(false);
    }
  };

  // PASSO 2: Validar Código de 6 dígitos
  const handleVerifyCode = async (codeOverride) => {
    const rawCode = typeof codeOverride === "string" ? codeOverride : code;
    const cleanCode = rawCode.replace(/\D/g, "").slice(0, 6);
    if (cleanCode.length < 4) {
      setError("Digite o código de 6 dígitos recebido.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const cleanDigits = phone.replace(/\D/g, "");
      const result = await verifyWhatsAppOtp({
        phone: cleanDigits,
        code: cleanCode,
        fullName: "",
      });

      if (result.success && result.user) {
        // Reseta cooldown no banco e no storage
        try {
          localStorage.removeItem(`pedemuleke_otp_rate_${cleanDigits}`);
        } catch {}
        setResendCooldown(0);

        // Se o cliente já possui nome cadastrado (cliente recorrente):
        if (result.user.full_name && result.user.full_name !== "Cliente") {
          const firstName = result.user.full_name.split(" ")[0];
          toast.success(`Olá, ${firstName}!`);
          if (onSuccess) onSuccess(result.user);
          onClose();
        } else {
          // Cliente novo (primeira vez): solicita o nome de forma limpa
          setVerifiedUser(result.user);
          setStep("name_step");
        }
      } else {
        setError(result.error || "Código incorreto ou expirado.");
      }
    } catch (_err) {
      setError("Erro ao validar código. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // PASSO 3: Salvar Nome (Somente se for cliente novo)
  const handleSaveName = async (e) => {
    e?.preventDefault();
    const cleanName = nameInput.trim();
    if (cleanName.length < 2) {
      setError("Por favor, informe seu nome completo.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const updatedUser = {
        ...verifiedUser,
        full_name: cleanName,
      };

      // Atualiza registro no Supabase se disponível
      if (isSupabaseConfigured() && supabase && verifiedUser?.id) {
        await supabase
          .from("customers")
          .update({ full_name: cleanName, updated_date: new Date().toISOString() })
          .eq("id", verifiedUser.id);
      }

      // Persiste sessão local
      await User.login(updatedUser);

      try {
        window.dispatchEvent(new CustomEvent("customer_auth_changed", { detail: updatedUser }));
      } catch {}

      const firstName = cleanName.split(" ")[0];
      toast.success(`Cadastro concluído. Bem-vindo(a), ${firstName}!`);
      if (onSuccess) onSuccess(updatedUser);
      onClose();
    } catch (_err) {
      setError("Erro ao salvar seu nome. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`max-w-[400px] p-6 rounded-2xl border shadow-xl transition-all relative overflow-hidden ${
          dark
            ? "bg-stone-900 border-stone-800 text-stone-100"
            : "bg-white border-stone-200 text-stone-900"
        }`}
      >
        {/* OVERLAY DE CONFIRMAÇÃO DO NÚMERO (EVITA DISPAROS INCORRETOS) */}
        {isConfirmingPhone && (
          <div className="absolute inset-0 bg-white/95 dark:bg-stone-900/95 backdrop-blur-xs z-30 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 border ${
                dark
                  ? "bg-stone-800 border-stone-700 text-stone-200"
                  : "bg-stone-50 border-stone-200 text-stone-700"
              }`}
            >
              <Smartphone className="w-5 h-5 text-[#047857]" strokeWidth={2} />
            </div>

            <h4
              className={`font-bold text-base tracking-tight ${dark ? "text-white" : "text-stone-900"}`}
              style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
            >
              Confirme seu número
            </h4>

            <p className={`text-xs mt-1.5 leading-relaxed max-w-[270px] ${dark ? "text-stone-400" : "text-stone-500"}`}>
              Enviaremos um código SMS de verificação para o seguinte telefone:
            </p>

            <div
              className={`my-3.5 px-4 py-2.5 rounded-xl font-mono font-bold text-lg tracking-wide border shadow-2xs ${
                dark
                  ? "bg-stone-950 border-stone-800 text-emerald-400"
                  : "bg-stone-50 border-stone-200 text-stone-900"
              }`}
            >
              {phone}
            </div>

            <p className={`text-[11px] mb-4.5 ${dark ? "text-stone-400" : "text-stone-500"}`}>
              O número acima está correto?
            </p>

            <div className="grid grid-cols-2 gap-2.5 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsConfirmingPhone(false)}
                className={`h-11 rounded-xl text-xs font-semibold cursor-pointer border ${
                  dark
                    ? "bg-stone-800 border-stone-700 text-stone-200 hover:bg-stone-700"
                    : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                }`}
              >
                Editar
              </Button>

              <Button
                type="button"
                onClick={() => handleSendCode(true)}
                disabled={isLoading}
                className={`h-11 rounded-xl text-xs font-semibold cursor-pointer shadow-xs flex items-center justify-center gap-1.5 ${
                  dark
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-[#047857] hover:bg-[#065f46] text-white"
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <span>Sim, enviar SMS</span>
                )}
              </Button>
            </div>
          </div>
        )}

        <DialogHeader className="text-center pb-1">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 border ${
              dark
                ? "bg-stone-800 border-stone-700 text-stone-200"
                : "bg-stone-50 border-stone-200 text-stone-700"
            }`}
          >
            {step === "phone_step" && <Smartphone className="w-5 h-5" strokeWidth={2} />}
            {step === "code_step" && <ShieldCheck className="w-5 h-5 text-[#047857]" strokeWidth={2} />}
            {step === "name_step" && <UserIcon className="w-5 h-5 text-[#047857]" strokeWidth={2} />}
          </div>

          <DialogTitle
            className={`font-bold text-lg tracking-tight ${dark ? "text-white" : "text-stone-900"}`}
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            {step === "phone_step" && (title || "Entrar na Conta")}
            {step === "code_step" && "Confirme o Código"}
            {step === "name_step" && "Como podemos te chamar?"}
          </DialogTitle>

          <DialogDescription
            className={`text-xs mt-1 leading-relaxed ${dark ? "text-stone-400" : "text-stone-500"}`}
          >
            {step === "phone_step" &&
              "Informe seu número de celular para receber um código de acesso por SMS."}
            {step === "code_step" &&
              `Enviamos um código de 6 dígitos via SMS para ${phone}.`}
            {step === "name_step" &&
              "Informe seu nome para identificação nos seus pedidos e entregas."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium animate-in fade-in">
            {error}
          </div>
        )}

        {/* ETAPA 1: CELULAR APENAS */}
        {step === "phone_step" && (
          <form onSubmit={handlePhoneStepSubmit} className="space-y-4 mt-1">
            <div>
              <Label
                htmlFor="auth-phone"
                className={`text-xs font-semibold uppercase tracking-wider ${
                  dark ? "text-stone-300" : "text-stone-600"
                }`}
              >
                Número de Celular
              </Label>
              <Input
                id="auth-phone"
                type="tel"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={handlePhoneChange}
                required
                autoFocus
                className={`mt-1.5 rounded-xl h-12 text-base font-medium tracking-wide ${
                  dark
                    ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-600 focus-visible:ring-emerald-500"
                    : "bg-stone-50/60 border-stone-200 text-stone-900 placeholder:text-stone-400 focus-visible:ring-[#047857]"
                }`}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || resendCooldown > 0}
              className={`w-full font-semibold h-11 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                dark
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-[#047857] hover:bg-[#065f46] text-white"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando SMS...</span>
                </>
              ) : resendCooldown > 0 ? (
                <span>Aguarde {formatCooldown(resendCooldown)}</span>
              ) : (
                <span>Continuar</span>
              )}
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-400 font-medium pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
              <span>Ambiente seguro. Acesso por código transacional.</span>
            </div>
          </form>
        )}

        {/* ETAPA 2: CÓDIGO DE 6 DÍGITOS */}
        {step === "code_step" && (
          <form onSubmit={(e) => { e.preventDefault(); handleVerifyCode(); }} className="space-y-4 mt-1">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label
                  htmlFor="auth-code"
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    dark ? "text-stone-300" : "text-stone-600"
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
                  className={`text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                    dark
                      ? "text-emerald-400 hover:text-emerald-300"
                      : "text-[#047857] hover:text-[#065f46]"
                  }`}
                >
                  <ArrowLeft className="w-3 h-3" />
                  Alterar número
                </button>
              </div>

              <Input
                ref={codeInputRef}
                id="auth-code"
                type="text"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(val);
                  if (error) setError("");
                  if (val.length === 6) {
                    handleVerifyCode(val);
                  }
                }}
                required
                className={`mt-1 rounded-xl h-13 text-center text-2xl font-bold tracking-[0.35em] font-mono ${
                  dark
                    ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-700 focus-visible:ring-emerald-500"
                    : "bg-stone-50/60 border-stone-200 text-stone-900 placeholder:text-stone-300 focus-visible:ring-[#047857]"
                }`}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || code.length < 4}
              className={`w-full font-semibold h-11 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                dark
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-[#047857] hover:bg-[#065f46] text-white"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validando...</span>
                </>
              ) : (
                <span>Confirmar e Entrar</span>
              )}
            </Button>

            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                disabled={resendCooldown > 0 || isLoading}
                onClick={handleSendCode}
                className={`text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                  dark
                    ? "text-stone-400 hover:text-stone-200"
                    : "text-stone-500 hover:text-stone-800"
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                {resendCooldown > 0
                  ? `Reenviar código em ${formatCooldown(resendCooldown)}`
                  : "Reenviar código por SMS"}
              </button>
            </div>
          </form>
        )}

        {/* ETAPA 3: NOME COMPLETO (APENAS CLIENTES NOVOS) */}
        {step === "name_step" && (
          <form onSubmit={handleSaveName} className="space-y-4 mt-1">
            <div>
              <Label
                htmlFor="new-user-name"
                className={`text-xs font-semibold uppercase tracking-wider ${
                  dark ? "text-stone-300" : "text-stone-600"
                }`}
              >
                Seu Nome Completo
              </Label>
              <Input
                ref={nameInputRef}
                id="new-user-name"
                type="text"
                placeholder="Ex: Carlos Oliveira"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (error) setError("");
                }}
                required
                className={`mt-1.5 rounded-xl h-12 text-base font-medium ${
                  dark
                    ? "bg-stone-950 border-stone-800 text-white placeholder:text-stone-600 focus-visible:ring-emerald-500"
                    : "bg-stone-50/60 border-stone-200 text-stone-900 placeholder:text-stone-400 focus-visible:ring-[#047857]"
                }`}
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || nameInput.trim().length < 2}
              className={`w-full font-semibold h-11 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                dark
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-[#047857] hover:bg-[#065f46] text-white"
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Concluir e Acessar</span>
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
