import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, User, Eye, EyeOff, Store, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function AdminLoginPage() {
  const [storeSlug, setStoreSlug] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Pré-preenche o slug da loja a partir da URL ou do storage
  useEffect(() => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const RESERVED = ["adminlogin", "superadmin", "menu", "myorders", "home", "printorder", "dashboard", "orders", "settings"];
    let detectedSlug = null;

    if (segments.length > 0 && !RESERVED.includes(segments[0].toLowerCase())) {
      detectedSlug = segments[0].toLowerCase();
    } else {
      detectedSlug = localStorage.getItem("current_tenant_slug");
    }

    if (detectedSlug && detectedSlug !== "undefined" && detectedSlug !== "null") {
      setStoreSlug(detectedSlug);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
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
        let emailToTry = cleanUser;

        // Se o usuário digitou um email completo diretamente
        if (cleanUser.includes("@")) {
          emailToTry = cleanUser;
        } else {
          // Resolve o email via banco com isolamento por loja / superadmin
          try {
            const { data: resolvedEmail } = await supabase.rpc("resolve_admin_login_email", {
              p_username: cleanUser,
              p_tenant_slug: cleanStore,
            });

            if (resolvedEmail) {
              emailToTry = resolvedEmail;
            } else {
              // Fallback determinístico
              if (cleanStore === "superadmin") {
                emailToTry = "davialeixo_nogueira@outlook.com";
              } else {
                emailToTry = `${cleanUser.toLowerCase()}@${cleanStore}.delivery.internal`;
              }
            }
          } catch {
            if (cleanStore === "superadmin") {
              emailToTry = "davialeixo_nogueira@outlook.com";
            } else {
              emailToTry = `${cleanUser.toLowerCase()}@${cleanStore}.delivery.internal`;
            }
          }
        }

        try {
          const { data: authResult, error: authError } = await supabase.auth.signInWithPassword({
            email: emailToTry,
            password: cleanPassword,
          });

          if (!authError && authResult?.user) {
            // Busca perfil administrativo no banco
            const { data: profile } = await supabase
              .from("tenant_admins")
              .select("id, user_id, tenant_id, role, username")
              .eq("user_id", authResult.user.id)
              .maybeSingle();

            if (profile) {
              // 1. Acesso SuperAdmin (identificador 'superadmin' ou role 'super_admin')
              if (cleanStore === "superadmin" || profile.role === "super_admin") {
                if (profile.role !== "super_admin") {
                  await supabase.auth.signOut();
                  setError("Acesso negado. Este usuário não possui privilégios de SuperAdmin.");
                  setIsLoading(false);
                  return;
                }

                const sessionUser = {
                  id: profile.id,
                  user_id: authResult.user.id,
                  username: profile.username,
                  role: "super_admin",
                  tenant_id: null,
                  permissions: ["*"],
                };

                localStorage.setItem("admin_auth", "authenticated");
                localStorage.setItem("admin_user", JSON.stringify(sessionUser));
                navigate(createPageUrl("SuperAdmin"), { replace: true });
                return;
              }

              // 2. Acesso Restaurante (Lojista / Colaborador)
              let tenantSlug = null;
              let tenantName = "Restaurante";
              let tenantPlan = "basic";
              let tenantSalonMode = "full";

              if (profile.tenant_id) {
                const { data: tenantData } = await supabase
                  .from("tenants")
                  .select("slug, name, plan, salon_mode")
                  .eq("id", profile.tenant_id)
                  .maybeSingle();

                if (tenantData) {
                  tenantSlug = tenantData.slug;
                  tenantName = tenantData.name;
                  tenantPlan = tenantData.plan || "basic";
                  tenantSalonMode = tenantData.salon_mode || "full";
                }
              }

              const sessionUser = {
                id: profile.id,
                user_id: authResult.user.id,
                username: profile.username,
                role: profile.role || "admin",
                tenant_id: profile.tenant_id,
                tenant_slug: tenantSlug,
                tenant_name: tenantName,
                permissions: ["*"],
              };

              localStorage.setItem("admin_auth", "authenticated");
              localStorage.setItem("admin_user", JSON.stringify(sessionUser));

              if (profile.tenant_id) {
                localStorage.setItem("current_tenant_id", profile.tenant_id);
                if (tenantSlug) localStorage.setItem("current_tenant_slug", tenantSlug);
                if (tenantName) localStorage.setItem("current_tenant_name", tenantName);
              }

              // Redireciona conforme o plano contratado (Visual ➔ Produtos | Autoatendimento/Completo ➔ Dashboard)
              const isVisual = tenantPlan === "showcase" || tenantSalonMode === "showcase";
              const targetPage = isVisual ? "Products" : "Dashboard";
              const targetUrl = tenantSlug ? `/${tenantSlug}/${targetPage}` : createPageUrl(targetPage);
              navigate(targetUrl, { replace: true });
              return;
            } else {
              setError("Usuário autenticado, mas nenhum perfil administrativo foi encontrado para esta loja.");
              setIsLoading(false);
              return;
            }
          } else {
            setError(
              authError?.message === "Invalid login credentials"
                ? "Identificador da loja, usuário ou senha incorretos."
                : (authError?.message || "Erro ao autenticar. Verifique suas credenciais.")
            );
            setIsLoading(false);
            return;
          }
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
    <div className="min-h-screen bg-gradient-to-br from-stone-950 via-stone-900 to-stone-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border border-stone-800 bg-stone-900/95 backdrop-blur-xl shadow-2xl text-stone-100">
        <CardHeader className="space-y-3 text-center pb-5">
          <div className="mx-auto w-14 h-14 bg-gradient-to-tr from-[#065f46] to-[#047857] rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-950/50">
            <Store className="w-7 h-7 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-black text-white tracking-tight">
              Acesso ao Sistema
            </CardTitle>
            <p className="text-xs text-stone-400 mt-1">
              Portal de Gestão & Painel Administrativo
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-red-950/60 border-red-800/80 text-red-200 py-2.5">
                <AlertDescription className="text-xs font-medium">{error}</AlertDescription>
              </Alert>
            )}

            {/* Campo do Código da Loja */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="storeSlug" className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Código da Loja</span>
                </Label>
                <span className="text-[10px] text-stone-500 font-mono">Ex: 1, 2, 3...</span>
              </div>
              <div className="relative">
                <Input
                  id="storeSlug"
                  type="text"
                  placeholder="ex: 1, 2 ou superadmin"
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value.toLowerCase().trim())}
                  className="bg-stone-800/60 border-stone-700 text-stone-100 placeholder:text-stone-500 focus-visible:ring-[#047857] font-mono text-sm h-10"
                  required
                />
              </div>
            </div>


            {/* Campo de Usuário */}
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-stone-400" />
                <span>Nome de Usuário</span>
              </Label>
              <div className="relative">
                <Input
                  id="username"
                  type="text"
                  placeholder="ex: gerente, caixa, admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-stone-800/60 border-stone-700 text-stone-100 placeholder:text-stone-500 focus-visible:ring-[#047857] text-xs h-10"
                  required
                />
              </div>
            </div>

            {/* Campo de Senha */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-stone-400" />
                <span>Senha de Acesso</span>
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-stone-800/60 border-stone-700 text-stone-100 placeholder:text-stone-500 focus-visible:ring-[#047857] text-xs h-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 p-0.5 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#047857] hover:bg-[#065f46] text-white font-bold h-11 text-sm rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
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
              <p className="text-[11px] text-stone-500">
                O código da loja pode ser consultado na aba Configurações &gt; Usuários do painel.
              </p>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}