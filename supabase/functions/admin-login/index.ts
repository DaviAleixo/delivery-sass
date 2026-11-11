// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonRes({ success: false, error: "Método não permitido." }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonRes({ success: false, error: "Serviço de autenticação não configurado." }, 500);
  }

  try {
    const body = await req.json();
    const action = String(body?.action || "login");
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "login") {
      const cleanStore = String(body?.storeIdentifier || "").trim().toLowerCase();
      const cleanUser = String(body?.username || "").trim();
      const cleanPassword = String(body?.password || "").trim();

      if (!cleanStore || !cleanUser || !cleanPassword) {
        return jsonRes({ success: false, error: "Informe loja, usuário e senha." }, 400);
      }

      let emailToTry = cleanUser;
      if (!cleanUser.includes("@")) {
        const { data: resolvedEmail } = await supabaseAdmin.rpc("resolve_admin_login_email", {
          p_username: cleanUser,
          p_tenant_slug: cleanStore,
        });
        emailToTry = resolvedEmail || `${cleanUser.toLowerCase()}@${cleanStore}.delivery.internal`;
      }

      const { data: authResult, error: authError } = await supabasePublic.auth.signInWithPassword({
        email: emailToTry,
        password: cleanPassword,
      });

      // Nunca revelar se o e-mail existe ou não — sempre erro uniforme em falha
      if (authError || !authResult?.session || !authResult?.user) {
        return jsonRes({ success: false, error: "Identificador da loja, usuário ou senha incorretos." }, 401);
      }

      const { data: profile } = await supabaseAdmin
        .from("tenant_admins")
        .select("id, user_id, tenant_id, role, username, is_active")
        .eq("user_id", authResult.user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!profile) {
        return jsonRes({ success: false, error: "Usuário autenticado, mas nenhum perfil administrativo ativo foi encontrado." }, 403);
      }

      if ((cleanStore === "superadmin" || cleanStore === "master") && profile.role !== "super_admin") {
        return jsonRes({ success: false, error: "Acesso negado. Este usuário não possui privilégios de SuperAdmin." }, 403);
      }

      let tenant = null;
      if (profile.tenant_id) {
        const { data: tenantData } = await supabaseAdmin
          .from("tenants")
          .select("id, slug, name, plan, salon_mode")
          .eq("id", profile.tenant_id)
          .maybeSingle();
        tenant = tenantData || null;
      }

      let resolvedPermissions: string[] = ["*"];
      if (profile.role !== "super_admin" && profile.role !== "admin") {
        const { data: adminUser } = await supabaseAdmin
          .from("admin_users")
          .select("permissions")
          .eq("id", authResult.user.id)
          .maybeSingle();
        resolvedPermissions = Array.isArray(adminUser?.permissions) ? adminUser.permissions : [];
      }

      return jsonRes({
        success: true,
        session: {
          access_token: authResult.session.access_token,
          refresh_token: authResult.session.refresh_token,
        },
        profile: {
          id: profile.id,
          user_id: authResult.user.id,
          username: profile.username,
          role: profile.role || "admin",
          tenant_id: profile.tenant_id,
          tenant_slug: tenant?.slug || null,
          tenant_name: tenant?.name || "Restaurante",
          tenant_plan: tenant?.plan || "basic",
          tenant_salon_mode: tenant?.salon_mode || "full",
          permissions: resolvedPermissions,
        },
      });
    }

    if (action === "request_reset") {
      const cleanStore = String(body?.storeIdentifier || "").trim().toLowerCase();
      const cleanEmail = String(body?.email || "").trim().toLowerCase();
      const redirectTo = String(body?.redirectTo || "").trim();

      if (!cleanStore || !cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.endsWith(".delivery.internal")) {
        return jsonRes({ success: false, error: "Informe um Código da Loja e um e-mail real válido." }, 400);
      }

      const { data: isAuthorized } = await supabaseAdmin.rpc("verify_admin_reset_email", {
        p_tenant_slug: cleanStore,
        p_email: cleanEmail,
      });

      if (isAuthorized) {
        await supabasePublic.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: redirectTo || undefined,
        });
      }

      // Sempre retorna resposta neutra para impedir enumeração de e-mails de admins/SuperAdmin
      return jsonRes({
        success: true,
        message: "Se este e-mail estiver vinculado à loja informada, enviaremos o link de redefinição em instantes.",
      });
    }

    return jsonRes({ success: false, error: "Ação desconhecida." }, 400);
  } catch (_err) {
    return jsonRes({ success: false, error: "Erro ao processar autenticação." }, 500);
  }
});

