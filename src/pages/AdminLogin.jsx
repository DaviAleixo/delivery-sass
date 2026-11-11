import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, ArrowRight, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";

function maskEmail(email = "") {
  const [local, domain] = String(email).split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export default function AdminLoginPage() {
  const [storeSlug, setStoreSlug] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Modos: "login" | "forgot" | "recovery"
  const [authMode, setAuthMode] = useState("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [recoveryInfo, setRecoveryInfo] = useState({
    storeCode: "",
    storeName: "",
    username: "",
    loading: false,
  });
  const { isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Pré-preenche o slug da loja a partir da URL, state ou storage e detecta retorno de recuperação
  useEffect(() => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const RESERVED = ["login", "adminlogin", "superadmin", "menu", "myorders", "home", "printorder", "dashboard", "orders", "settings"];
    let detectedSlug = location.state?.slug || null;

    if (!detectedSlug && segments.length > 0 && !RESERVED.includes(segments[0].toLowerCase())) {
      detectedSlug = segments[0].toLowerCase();
    } else if (!detectedSlug) {
      detectedSlug = localStorage.getItem("current_tenant_slug");
    }

    if (detectedSlug && detectedSlug !== "undefined" && detectedSlug !== "null") {
      setStoreSlug(detectedSlug);
    }

    if (
      isPasswordRecovery ||
      window.location.hash.includes("type=recovery") ||
      window.location.search.includes("type=recovery")
    ) {
      setAuthMode("recovery");
    }

    if (!isSupabaseConfigured() || !supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setError("");
        setSuccessMessage("");
        setAuthMode("recovery");
      }
    });

    return () => subscription?.unsubscribe();
  }, [isPasswordRecovery, location.state]);

  // Carrega Código da Loja e Usuário (somente leitura) ao entrar na tela de redefinição de senha
  useEffect(() => {
    if (authMode !== "recovery" || !isSupabaseConfigured() || !supabase) return;

    let cancelled = false;
    const loadRecoveryInfo = async () => {
      setRecoveryInfo((prev) => ({ ...prev, loading: true }));
      try {
        const { data, error: infoError } = await supabase.rpc("get_my_admin_recovery_info");
        if (!cancelled && !infoError && data?.found) {
          setRecoveryInfo({
            storeCode: data.store_code || "",
            storeName: data.store_name || "",
            username: data.username || "",
            loading: false,
          });
          return;
        }
      } catch (_e) {}

      if (!cancelled) {
        setRecoveryInfo((prev) => ({ ...prev, loading: false }));
      }
    };

    loadRecoveryInfo();
    return () => {
      cancelled = true;
    };
  }, [authMode]);

  const handleSendResetEmail = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      if (!isSupabaseConfigured() || !supabase) {
        setError("Serviço de autenticação não configurado.");
        return;
      }

      const cleanStore = storeSlug.trim().toLowerCase();
      const cleanEmail = forgotEmail.trim().toLowerCase();

      if (!cleanStore) {
        setError("Informe o Código da Loja.");
        return;
      }

      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setError("Informe um e-mail válido cadastrado para o lojista.");
        return;
      }

      if (cleanEmail.endsWith(".delivery.internal")) {
        setError("Informe o e-mail real cadastrado pelo lojista.");
        return;
      }

      const redirectUrl = `${window.location.origin}/login`;
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("admin-login", {
        body: {
          action: "request_reset",
          storeIdentifier: cleanStore,
          email: cleanEmail,
          redirectTo: redirectUrl,
        },
      });

      if (fnErr || fnData?.success === false) {
        setError(fnData?.error || "Não foi possível processar a solicitação. Verifique o Código da Loja e o e-mail.");
        return;
      }

      setSuccessMessage(
        fnData?.message ||
          `Se ${maskEmail(cleanEmail)} estiver vinculado à loja informada, enviaremos o link de redefinição em instantes.`
      );
    } catch (_err) {
      setError("Erro ao solicitar recuperação de senha. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateRecoveredPassword = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (newPassword.trim().length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("As senhas digitadas não coincidem.");
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });

      if (updateError) {
        setError(updateError.message || "Não foi possível atualizar a senha. Solicite um novo link.");
        return;
      }

      try {
        await supabase.auth.signOut();
      } catch (_e) {}
      localStorage.removeItem("admin_auth");
      localStorage.removeItem("admin_user");
      clearPasswordRecovery();
      window.history.replaceState(null, "", window.location.pathname);

      if (recoveryInfo.storeCode) {
        setStoreSlug(recoveryInfo.storeCode);
      }
      if (recoveryInfo.username) {
        setUsername(recoveryInfo.username);
      }

      setNewPassword("");
      setConfirmNewPassword("");
      setPassword("");
      setAuthMode("login");
      setSuccessMessage("Senha redefinida com sucesso! Faça login com sua nova senha.");
    } catch (_err) {
      setError("Erro ao salvar nova senha. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      const cleanStore = storeSlug.trim().toLowerCase();
      const cleanUser = username.trim();
      const cleanPassword = password.trim();

      if (!cleanStore) {
        setError("Informe o identificador da loja.");
        setIsLoading(false);
        return;
      }

      if (!cleanUser || !cleanPassword) {
        setError("Preencha usuário e senha.");
        setIsLoading(false);
        return;
      }

      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: fnData, error: fnError } = await supabase.functions.invoke("admin-login", {
            body: {
              action: "login",
              storeIdentifier: cleanStore,
              username: cleanUser,
              password: cleanPassword,
            },
          });

          if (fnError || !fnData?.success || !fnData?.session || !fnData?.profile) {
            setError(fnData?.error || "Identificador da loja, usuário ou senha incorretos.");
            setIsLoading(false);
            return;
          }

          const { error: sessionErr } = await supabase.auth.setSession({
            access_token: fnData.session.access_token,
            refresh_token: fnData.session.refresh_token,
          });

          if (sessionErr) {
            setError("Erro ao inicializar sessão segura. Tente novamente.");
            setIsLoading(false);
            return;
          }

          const prof = fnData.profile;

          if (cleanStore === "superadmin" || cleanStore === "master" || prof.role === "super_admin") {
            const sessionUser = {
              id: prof.id,
              user_id: prof.user_id,
              username: prof.username,
              role: "super_admin",
              tenant_id: null,
              permissions: ["*"],
            };

            localStorage.setItem("admin_auth", "authenticated");
            localStorage.setItem("admin_user", JSON.stringify(sessionUser));
            navigate(createPageUrl("SuperAdmin"), { replace: true });
            return;
          }

          const sessionUser = {
            id: prof.id,
            user_id: prof.user_id,
            username: prof.username,
            role: prof.role || "admin",
            tenant_id: prof.tenant_id,
            tenant_slug: prof.tenant_slug,
            tenant_name: prof.tenant_name || "Restaurante",
            permissions: Array.isArray(prof.permissions) ? prof.permissions : [],
          };

          localStorage.setItem("admin_auth", "authenticated");
          localStorage.setItem("admin_user", JSON.stringify(sessionUser));

          if (prof.tenant_id) {
            localStorage.setItem("current_tenant_id", prof.tenant_id);
            if (prof.tenant_slug) localStorage.setItem("current_tenant_slug", prof.tenant_slug);
            if (prof.tenant_name) localStorage.setItem("current_tenant_name", prof.tenant_name);
          }

          const isVisual = prof.tenant_plan === "showcase" || prof.tenant_salon_mode === "showcase";
          const targetPage = isVisual ? "Products" : "Dashboard";
          const targetUrl = prof.tenant_slug ? `/${prof.tenant_slug}/${targetPage}` : createPageUrl(targetPage);
          navigate(targetUrl, { replace: true });
          return;
        } catch (_authEx) {
          setError("Erro de comunicação com o servidor de autenticação.");
          setIsLoading(false);
          return;
        }
      } else {
        setError("Serviço de autenticação não configurado.");
      }
    } catch (_error) {
      setError("Erro ao processar login. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f8faf9] flex flex-col items-center justify-center p-5 sm:p-6 md:p-10">
      {/* Background mobile */}
      <div
        aria-hidden="true"
        className="md:hidden fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none select-none"
        style={{ backgroundImage: "url('/imgs/backgroundloginmobile.png')" }}
      />
      {/* Background desktop */}
      <div
        aria-hidden="true"
        className="hidden md:block fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none select-none"
        style={{ backgroundImage: "url('/imgs/backgroundlogin.png')" }}
      />

      <div className="relative z-10 w-full max-w-[390px] md:max-w-5xl flex flex-col md:grid md:grid-cols-12 md:items-center md:gap-10 lg:gap-16">
        {/* Coluna esquerda institucional (somente desktop) */}
        <div className="hidden md:flex md:col-span-6 flex-col items-start pr-4 lg:pr-8 md:border-r md:border-stone-200/70 py-4">
          <img
            src="/imgs/logo-painel.png"
            alt="PedeMuleke"
            className="h-24 lg:h-28 w-auto object-contain select-none drop-shadow-sm"
          />
          <svg
            viewBox="0 0 220 14"
            fill="none"
            className="w-44 lg:w-52 h-3.5 mt-1 mb-7 text-[#16a34a]"
            aria-hidden="true"
          >
            <path
              d="M4 10C62 3 142 2 216 9"
              stroke="currentColor"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
          </svg>
          <h2 className="text-[32px] lg:text-[38px] font-black italic leading-[1.14] tracking-tight text-stone-900">
            Gestão completa
            <br />
            para o <span className="text-[#16a34a]">seu delivery</span>
          </h2>
          <p className="text-base lg:text-lg text-stone-500 mt-4 leading-relaxed max-w-md font-normal">
            Controle, organização e crescimento
            <br />
            para o seu estabelecimento.
          </p>
        </div>

        {/* Coluna direita (Card de Login) + Logo mobile */}
        <div className="w-full md:col-span-6 flex flex-col items-center md:items-end">
          {/* Logo PedeMuleke no topo (somente mobile) */}
          <div className="md:hidden mb-6 flex justify-center">
            <img
              src="/imgs/logo-painel.png"
              alt="PedeMuleke"
              className="h-20 w-auto object-contain select-none drop-shadow-sm"
            />
          </div>

          <Card className="w-full md:max-w-[430px] border border-stone-200/70 bg-white/95 backdrop-blur-md rounded-[28px] shadow-[0_20px_50px_-12px_rgba(16,24,40,0.14)] text-stone-900">
            <CardHeader className="text-center md:text-left pt-7 pb-5 px-6 sm:px-8">
              <div className="md:flex md:items-center md:gap-3.5">
                <span className="hidden md:block w-1.5 h-11 rounded-full bg-[#16a34a] shrink-0" />
                <div>
                  <CardTitle className="text-[26px] md:text-[26px] font-black text-stone-900 tracking-tight leading-tight">
                    {authMode === "forgot"
                      ? "Recuperar Senha"
                      : authMode === "recovery"
                      ? "Nova Senha"
                      : "Acesso ao Sistema"}
                  </CardTitle>
                  <p className="text-xs text-stone-500 mt-1 font-medium">
                    {authMode === "forgot"
                      ? "Receba o link de redefinição no e-mail cadastrado"
                      : authMode === "recovery"
                      ? "Defina uma nova senha para acessar seu painel"
                      : "Portal de Gestão e Painel Administrativo"}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-6 sm:px-8 pb-7">
              {error && (
                <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-700 py-2.5 mb-4">
                  <AlertDescription className="text-xs font-medium">{error}</AlertDescription>
                </Alert>
              )}

              {successMessage && (
                <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800 py-2.5 mb-4">
                  <AlertDescription className="text-xs font-medium flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{successMessage}</span>
                  </AlertDescription>
                </Alert>
              )}

              {authMode === "recovery" ? (
                <form onSubmit={handleUpdateRecoveredPassword} className="space-y-4">
                  {/* Código da Loja (somente leitura) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="recoveryStoreCode" className="text-xs font-bold text-stone-800 block">
                        Código da Loja
                      </Label>
                      {recoveryInfo.storeName && (
                        <span className="text-[11px] font-medium text-stone-500 truncate max-w-[180px]">
                          {recoveryInfo.storeName}
                        </span>
                      )}
                    </div>
                    <Input
                      id="recoveryStoreCode"
                      type="text"
                      value={recoveryInfo.loading ? "Carregando..." : (recoveryInfo.storeCode || storeSlug || "-")}
                      readOnly
                      disabled
                      className="bg-stone-100 border-stone-200 text-stone-700 font-semibold rounded-xl h-11 text-sm cursor-not-allowed opacity-100"
                    />
                  </div>

                  {/* Nome de Usuário (somente leitura) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="recoveryUsername" className="text-xs font-bold text-stone-800 block">
                      Nome de Usuário
                    </Label>
                    <Input
                      id="recoveryUsername"
                      type="text"
                      value={recoveryInfo.loading ? "Carregando..." : (recoveryInfo.username || "-")}
                      readOnly
                      disabled
                      className="bg-stone-100 border-stone-200 text-stone-700 font-semibold rounded-xl h-11 text-sm cursor-not-allowed opacity-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword" className="text-xs font-bold text-stone-800 block">
                      Nova Senha
                    </Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="Mínimo de 6 caracteres"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="bg-white border-emerald-400/80 text-stone-900 placeholder:text-stone-400 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500 rounded-xl h-11 text-sm pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700 p-0.5 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmNewPassword" className="text-xs font-bold text-stone-800 block">
                      Confirmar Nova Senha
                    </Label>
                    <Input
                      id="confirmNewPassword"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Repita a nova senha"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500 rounded-xl h-11 text-sm"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#22c55e] via-[#16a34a] to-[#0f8a34] hover:from-[#16a34a] hover:to-[#0c742b] text-white font-bold h-12 text-sm rounded-xl shadow-[0_10px_24px_-6px_rgba(22,163,74,0.5)] transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                    disabled={isLoading}
                  >
                    {isLoading ? "Salvando..." : "Confirmar Nova Senha"}
                  </Button>

                  <button
                    type="button"
                    onClick={async () => {
                      setError("");
                      setSuccessMessage("");
                      try {
                        await supabase.auth.signOut();
                      } catch (_e) {}
                      clearPasswordRecovery();
                      window.history.replaceState(null, "", window.location.pathname);
                      setAuthMode("login");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 py-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o login</span>
                  </button>
                </form>
              ) : authMode === "forgot" ? (
                <form onSubmit={handleSendResetEmail} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgotStoreSlug" className="text-xs font-bold text-stone-800 block">
                      Código da Loja
                    </Label>
                    <Input
                      id="forgotStoreSlug"
                      type="text"
                      placeholder="Ex: 1, 2, 3..."
                      value={storeSlug}
                      onChange={(e) => setStoreSlug(e.target.value.toLowerCase().trim())}
                      className="bg-white border-emerald-400/80 text-stone-900 placeholder:text-stone-400 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500 rounded-xl h-11 text-sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="forgotEmail" className="text-xs font-bold text-stone-800 block">
                      E-mail do Lojista Cadastrado
                    </Label>
                    <Input
                      id="forgotEmail"
                      name="recoveryEmail"
                      type="email"
                      autoComplete="email"
                      placeholder="lojista@email.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500 rounded-xl h-11 text-sm"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#22c55e] via-[#16a34a] to-[#0f8a34] hover:from-[#16a34a] hover:to-[#0c742b] text-white font-bold h-12 text-sm rounded-xl shadow-[0_10px_24px_-6px_rgba(22,163,74,0.5)] transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                    disabled={isLoading}
                  >
                    <Mail className="w-4 h-4" />
                    <span>{isLoading ? "Enviando..." : "Enviar Link de Recuperação"}</span>
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setSuccessMessage("");
                      setAuthMode("login");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 py-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o login</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Campo do Código da Loja */}
                  <div className="space-y-1.5">
                    <Label htmlFor="storeSlug" className="text-xs font-bold text-stone-800 block">
                      Código da Loja
                    </Label>
                    <Input
                      id="storeSlug"
                      type="text"
                      placeholder="Ex: 1, 2, 3..."
                      value={storeSlug}
                      onChange={(e) => setStoreSlug(e.target.value.toLowerCase().trim())}
                      className="bg-white border-emerald-400/80 text-stone-900 placeholder:text-stone-400 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500 rounded-xl h-11 text-sm"
                      required
                    />
                  </div>

                  {/* Campo de Usuário */}
                  <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-xs font-bold text-stone-800 block">
                      Nome de Usuário
                    </Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="Seu usuário"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500 rounded-xl h-11 text-sm"
                      required
                    />
                  </div>

                  {/* Campo de Senha */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs font-bold text-stone-800">
                        Senha de Acesso
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setSuccessMessage("");
                          setForgotEmail("");
                          setAuthMode("forgot");
                        }}
                        className="text-[11px] font-semibold text-[#16a34a] hover:text-[#15803d] hover:underline cursor-pointer"
                      >
                        Esqueci minha senha?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 focus-visible:ring-emerald-500/40 focus-visible:border-emerald-500 rounded-xl h-11 text-sm pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700 p-0.5 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-[#22c55e] via-[#16a34a] to-[#0f8a34] hover:from-[#16a34a] hover:to-[#0c742b] text-white font-bold h-12 text-sm rounded-xl shadow-[0_10px_24px_-6px_rgba(22,163,74,0.5)] transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span>Acessando...</span>
                    ) : (
                      <>
                        <span>Entrar no Sistema</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>

                  <div className="text-center pt-2">
                    <p className="text-[11px] leading-relaxed text-stone-500">
                      O código da loja pode ser consultado na aba{" "}
                      <span className="block font-bold text-stone-700">
                        Configurações &gt; Usuários do painel.
                      </span>
                    </p>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}