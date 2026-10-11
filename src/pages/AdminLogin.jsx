import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, User, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import { AdminUser } from "@/entities/AdminUser";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Se já está logado, redireciona para a tela correspondente
    const adminAuth = localStorage.getItem("admin_auth");
    const rawUser = localStorage.getItem("admin_user");
    let user = null;
    try {
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch (_e) {}

    if (adminAuth === "authenticated") {
      if (user?.role === "super_admin") {
        navigate(createPageUrl("SuperAdmin"), { replace: true });
      } else {
        navigate(createPageUrl("Dashboard"), { replace: true });
      }
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // 1. Tentar autenticação nativa via Supabase Auth (GoTrue)
      if (isSupabaseConfigured() && supabase) {
        const cleanUser = username.trim();
        let emailToTry = cleanUser;

        if (!cleanUser.includes("@")) {
          try {
            const { data: resolvedEmail } = await supabase.rpc("resolve_admin_login_email", {
              p_username: cleanUser,
            });
            if (resolvedEmail) {
              emailToTry = resolvedEmail;
            } else {
              emailToTry = `${cleanUser.toLowerCase()}@delivery.internal`;
            }
          } catch {
            emailToTry = `${cleanUser.toLowerCase()}@delivery.internal`;
          }
        }

        try {
          const { data: authResult, error: authError } = await supabase.auth.signInWithPassword({
            email: emailToTry,
            password: password,
          });


          if (!authError && authResult?.user) {
            // Busca perfil autorizado na tabela tenant_admins vinculada por auth.uid()
            const { data: profile } = await supabase
              .from("tenant_admins")
              .select("id, user_id, tenant_id, role, username")
              .eq("user_id", authResult.user.id)
              .maybeSingle();

            if (profile) {
              let tenantSlug = null;
              let tenantName = "Restaurante";

              if (profile.tenant_id) {
                const { data: tenantData } = await supabase
                  .from("tenants")
                  .select("slug, name")
                  .eq("id", profile.tenant_id)
                  .maybeSingle();

                if (tenantData) {
                  tenantSlug = tenantData.slug;
                  tenantName = tenantData.name;
                }
              }

              const sessionUser = {
                id: profile.id,
                user_id: authResult.user.id,
                username: profile.username,
                role: profile.role,
                tenant_id: profile.tenant_id,
                tenant_slug: tenantSlug,
                tenant_name: tenantName,
                permissions: ["*"],
              };

              localStorage.setItem("admin_auth", "authenticated");
              localStorage.setItem("admin_user", JSON.stringify(sessionUser));

              if (profile.role === "super_admin") {
                navigate(createPageUrl("SuperAdmin"), { replace: true });
              } else {
                if (profile.tenant_id) {
                  localStorage.setItem("current_tenant_id", profile.tenant_id);
                  if (tenantSlug) localStorage.setItem("current_tenant_slug", tenantSlug);
                  if (tenantName) localStorage.setItem("current_tenant_name", tenantName);
                }
                navigate(createPageUrl("Dashboard"), { replace: true });
              }
              return;
            } else {
              setError("Usuário autenticado, mas nenhum perfil administrativo foi encontrado.");
              setIsLoading(false);
              return;
            }
          } else {
            setError(authError?.message === "Invalid login credentials" ? "Usuário ou senha incorretos." : (authError?.message || "Erro ao autenticar. Verifique suas credenciais."));
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="space-y-3 text-center pb-6">
          <div className="mx-auto w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Acesso Administrativo
          </CardTitle>
          <p className="text-sm text-gray-600">
            Portal de Gestão — Restaurantes e Painel Master
          </p>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Digite seu usuário"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            
            <Button 
              type="submit" 
              className="w-full bg-red-600 hover:bg-red-700 h-11 text-base"
              disabled={isLoading}
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
            
            <div className="text-center pt-4">
              <p className="text-xs text-gray-500">
                Apenas administradores autorizados
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}