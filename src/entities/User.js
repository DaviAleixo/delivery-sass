import { createEntityModel, getActiveTenantId } from "./storage";
import { MOCK_USERS } from "@/utils/mockData";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const baseUserModel = createEntityModel("users", MOCK_USERS);

function getStoreSlug() {
  if (typeof window === "undefined") return "vrumm";
  const segments = window.location.pathname.split("/").filter(Boolean);
  const RESERVED = new Set([
    "menu", "dashboard", "orders", "pdv", "clients", "products",
    "categories", "banners", "coupons", "complements", "reports",
    "settings", "superadmin", "adminlogin", "myorders", "printorder", "home", "api"
  ]);
  const routeSlug = segments.length > 0 && !RESERVED.has(segments[0].toLowerCase()) ? segments[0].toLowerCase() : null;
  return routeSlug || localStorage.getItem("current_tenant_slug") || "vrumm";
}

function getStoreUserKey() {
  const slug = getStoreSlug();
  if (slug === "vrumm" || slug === "vruum-burguer") {
    return "vrumburguer_current_user";
  }
  return `client_user_${slug}`;
}

function getStorePhoneKey() {
  const slug = getStoreSlug();
  if (slug === "vrumm" || slug === "vruum-burguer") {
    return "vrumburguer_customer_phone";
  }
  return `customer_phone_${slug}`;
}

function getStoreGuestKey() {
  const slug = getStoreSlug();
  if (slug === "vrumm" || slug === "vruum-burguer") {
    return "vrumburguer_guest_info";
  }
  return `guest_info_${slug}`;
}

export const User = {
  ...baseUserModel,

  async me() {
    if (typeof window === "undefined") return null;
    try {
      const userKey = getStoreUserKey();
      const stored = localStorage.getItem(userKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.email === "cliente@vrumburguer.com" || parsed?.full_name === "Cliente Demo" || parsed?.id === "user-1") {
          localStorage.removeItem(userKey);
          localStorage.removeItem(getStorePhoneKey());
          localStorage.removeItem(getStoreGuestKey());
          return null;
        }
        if (parsed && (!parsed.full_name || parsed.full_name === "Cliente")) {
          try {
            const guestInfo = JSON.parse(localStorage.getItem(getStoreGuestKey()) || "{}");
            if (guestInfo.customer_name && guestInfo.customer_name !== "Cliente") {
              parsed.full_name = guestInfo.customer_name.trim();
              localStorage.setItem(userKey, JSON.stringify(parsed));
            }
          } catch {}
        }
        return parsed;
      }
      return null;
    } catch (_e) {
      return null;
    }
  },

  async login(userObj = null) {
    const userToLogin = userObj || MOCK_USERS[0];
    if (typeof window !== "undefined") {
      localStorage.setItem(getStoreUserKey(), JSON.stringify(userToLogin));
    }
    return userToLogin;
  },

  async loginWithPhone(phone, fullName = "", storeTenantId = null) {
    if (!phone) return null;
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone) return null;

    const cleanFullName = fullName && typeof fullName === "string" ? fullName.trim() : "";
    const userKey = getStoreUserKey();
    const phoneKey = getStorePhoneKey();
    const activeTenantId = storeTenantId || getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";

    try {
      // 1. Grava no Supabase na tabela public.customers com o tenant_id da loja ativa
      if (isSupabaseConfigured() && supabase && activeTenantId) {
        const { data: custData, error: custErr } = await supabase
          .from("customers")
          .upsert(
            {
              tenant_id: activeTenantId,
              phone: phone,
              full_name: (cleanFullName && cleanFullName !== "Cliente") ? cleanFullName : "Cliente",
              updated_date: new Date().toISOString()
            },
            { onConflict: "tenant_id,phone" }
          )
          .select()
          .maybeSingle();

        if (!custErr && custData) {
          const loggedUser = {
            id: custData.id,
            tenant_id: custData.tenant_id,
            full_name: custData.full_name,
            phone: custData.phone,
            email: custData.email || "",
            role: "user",
          };
          if (typeof window !== "undefined") {
            localStorage.setItem(userKey, JSON.stringify(loggedUser));
            localStorage.setItem(phoneKey, phone);
          }
          return loggedUser;
        }
      }

      // 2. Fallback local isolado por tenant
      const allUsers = await baseUserModel.list();
      let existingUser = (allUsers || []).find(u => (u.phone || "").replace(/\D/g, "") === cleanPhone);

      if (existingUser) {
        if (cleanFullName && cleanFullName !== "Cliente" && existingUser.full_name !== cleanFullName) {
          try {
            await baseUserModel.update(existingUser.id, { full_name: cleanFullName });
            existingUser.full_name = cleanFullName;
          } catch {}
        }
      } else {
        const newUserObj = {
          tenant_id: activeTenantId,
          full_name: (cleanFullName && cleanFullName !== "Cliente") ? cleanFullName : "Cliente",
          phone: phone,
          email: "",
          role: "user",
          created_date: new Date().toISOString()
        };
        existingUser = await baseUserModel.create(newUserObj);
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(userKey, JSON.stringify(existingUser));
        localStorage.setItem(phoneKey, phone);
      }
      return existingUser;
    } catch (err) {
      console.error("Erro ao fazer login com telefone:", err);
      const fallbackUser = {
        id: `user_${cleanPhone}`,
        tenant_id: activeTenantId,
        full_name: (cleanFullName && cleanFullName !== "Cliente") ? cleanFullName : "Cliente",
        phone: phone,
        email: "",
        role: "user"
      };
      if (typeof window !== "undefined") {
        localStorage.setItem(userKey, JSON.stringify(fallbackUser));
        localStorage.setItem(phoneKey, phone);
      }
      return fallbackUser;
    }
  },

  async logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem(getStoreUserKey());
      localStorage.removeItem(getStorePhoneKey());
      localStorage.removeItem(getStoreGuestKey());
    }
    return { success: true };
  },
};
