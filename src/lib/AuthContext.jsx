import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { soundAlert } from "@/utils/soundAlert";

const AuthContext = createContext({
  user: null,
  role: null,
  tenantId: null,
  isAdminAuthenticated: false,
  isLoadingAuth: true,
  logout: async () => {},
  refreshSession: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Carrega os dados de autorização do usuário na tabela tenant_admins
  const fetchUserProfile = useCallback(async (authUser) => {
    if (!authUser || !supabase) return null;

    try {
      const { data: member, error } = await supabase
        .from("tenant_admins")
        .select("id, user_id, tenant_id, role, username, is_active")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (error || !member) {
        return null;
      }

      let tenantSlug = null;
      let tenantName = "Restaurante";

      if (member.tenant_id) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("slug, name")
          .eq("id", member.tenant_id)
          .maybeSingle();

        if (tenant) {
          tenantSlug = tenant.slug;
          tenantName = tenant.name;
        }
      }

      const sessionUser = {
        id: member.id,
        user_id: authUser.id,
        email: authUser.email,
        username: member.username,
        role: member.role,
        tenant_id: member.tenant_id,
        tenant_slug: tenantSlug,
        tenant_name: tenantName,
        permissions: ["*"],
      };

      // Sincroniza retrocompatibilidade com localStorage para código síncrono legado
      localStorage.setItem("admin_auth", "authenticated");
      localStorage.setItem("admin_user", JSON.stringify(sessionUser));
      if (member.tenant_id) {
        localStorage.setItem("current_tenant_id", member.tenant_id);
        if (tenantSlug) localStorage.setItem("current_tenant_slug", tenantSlug);
        if (tenantName) localStorage.setItem("current_tenant_name", tenantName);
      }

      return sessionUser;
    } catch (_err) {
      return null;
    }
  }, []);

  // Limpa estados e storages locais
  const clearSession = useCallback(() => {
    soundAlert.stopContinuousAlert();
    soundAlert.setPendingCount(0);
    setUser(null);
    setIsAdminAuthenticated(false);
    localStorage.removeItem("admin_auth");
    localStorage.removeItem("admin_user");
  }, []);


  // Inicialização e escuta reativa com Supabase onAuthStateChange
  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured() || !supabase) {
      // Fallback offline / mock se Supabase não estiver configurado
      const stored = localStorage.getItem("admin_auth");
      const rawUser = localStorage.getItem("admin_user");
      if (stored === "authenticated" && rawUser) {
        try {
          setUser(JSON.parse(rawUser));
          setIsAdminAuthenticated(true);
        } catch (_e) {
          clearSession();
        }
      }
      setIsLoadingAuth(false);
      return;
    }

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          const profile = await fetchUserProfile(session.user);
          if (mounted) {
            if (profile) {
              setUser(profile);
              setIsAdminAuthenticated(true);
            } else {
              clearSession();
            }
          }
        } else if (mounted) {
          clearSession();
        }
      } catch (_e) {
        if (mounted) clearSession();
      } finally {
        if (mounted) setIsLoadingAuth(false);
      }
    };

    initAuth();

    // ⚡ Escuta reativa de mudanças de sessão em tempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT" || !session) {
        clearSession();
        setIsLoadingAuth(false);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setIsLoadingAuth(true);
        const profile = await fetchUserProfile(session.user);
        if (mounted) {
          if (profile) {
            setUser(profile);
            setIsAdminAuthenticated(true);
          } else {
            clearSession();
          }
          setIsLoadingAuth(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [clearSession, fetchUserProfile]);

  const logout = async () => {
    if (isSupabaseConfigured() && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (_e) {}
    }
    clearSession();
  };

  const refreshSession = async () => {
    if (isSupabaseConfigured() && supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchUserProfile(session.user);
        if (profile) {
          setUser(profile);
          setIsAdminAuthenticated(true);
        }
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        tenantId: user?.tenant_id || null,
        isAdminAuthenticated,
        isLoadingAuth,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
