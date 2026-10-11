import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const TenantContext = createContext({
  tenant: null,
  tenantId: null,
  tenantSlug: null,
  isLoadingTenant: true,
  themeConfig: null,
});

// Lista de palavras reservadas que não são slugs de lojas
const RESERVED_SLUGS = new Set([
  "menu",
  "dashboard",
  "orders",
  "pedidos",
  "pdv",
  "pdvorders",
  "clients",
  "products",
  "categories",
  "banners",
  "coupons",
  "complements",
  "reports",
  "settings",
  "superadmin",
  "adminlogin",
  "myorders",
  "printorder",
  "home",
  "api",
]);

export function TenantProvider({ children }) {
  const location = useLocation();
  const [tenant, setTenant] = useState(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);

  // Extrai o possível slug do primeiro segmento da URL
  const extractSlugFromPath = () => {
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const first = segments[0].toLowerCase();
      if (!RESERVED_SLUGS.has(first)) {
        return first;
      }
    }
    // Se for SuperAdmin, não há tenant ativo
    if (location.pathname.toLowerCase().includes("superadmin")) {
      return null;
    }
    // Fallback para o tenant salvo na sessão ou nulo
    return localStorage.getItem("current_tenant_slug") || null;
  };

  const currentSlug = extractSlugFromPath();

  useEffect(() => {
    loadTenantData(currentSlug);
  }, [currentSlug, location.pathname]);

  const loadTenantData = async (slugToSearch) => {
    if (!slugToSearch) {
      setTenant(null);
      setIsLoadingTenant(false);
      return;
    }

    setIsLoadingTenant(true);
    try {
      if (isSupabaseConfigured() && supabase) {
        // Busca o restaurante pelo slug (suporta alias vrumm / vruum-burguer)
        const targetSlug = slugToSearch === "vruum-burguer" ? "vrumm" : slugToSearch;

        // 1. Tenta buscar pelo slug exato da URL / sessão
        let { data, error } = await supabase
          .from("tenants")
          .select("*")
          .eq("slug", targetSlug)
          .maybeSingle();

        if (!error && data) {
          setTenant(data);
          localStorage.setItem("current_tenant_id", data.id);
          localStorage.setItem("current_tenant_slug", data.slug);
          localStorage.setItem("current_tenant_name", data.name);

          // Injeta a cor primária dinâmica da marca no CSS
          if (data.theme_config?.primary_color) {
            document.documentElement.style.setProperty("--primary-color", data.theme_config.primary_color);
          }
          return;
        }
      }

      // Se o slug for especificamente a loja piloto Vruum Burguer
      if (slugToSearch === "vrumm" || slugToSearch === "vruum-burguer") {
        const fallbackTenant = {
          id: "a0000000-0000-0000-0000-000000000001",
          slug: "vrumm",
          name: "Vruum Burguer",
          plan: "basic",
          logo_url: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=300&h=300&fit=crop",
          banner_url: "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=1200&h=400&fit=crop",
          phone: "(11) 99999-9999",
          whatsapp: "11999999999",
          address: "Av. Brasil, 1500 - Centro",
          delivery_fee: 6.50,
          min_order_value: 20.00,
          delivery_time: "40-50 min",
          opening_time: "18:00",
          closing_time: "23:59",
          open_days: ["segunda","terca","quarta","quinta","sexta","sabado","domingo"],
          theme_config: { primary_color: "#E11D48", secondary_color: "#111827" },
          is_active: true,
        };
        setTenant(fallbackTenant);
        localStorage.setItem("current_tenant_id", fallbackTenant.id);
        localStorage.setItem("current_tenant_slug", fallbackTenant.slug);
        localStorage.setItem("current_tenant_name", fallbackTenant.name);
      } else {
        // Se for uma nova loja, NUNCA herda dados da Vruum Burguer: tudo 100% limpo!
        const cleanName = slugToSearch.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        const cleanTenant = {
          id: localStorage.getItem("current_tenant_id") || null,
          slug: slugToSearch,
          name: localStorage.getItem("current_tenant_name") || cleanName,
          plan: "basic",
          logo_url: null,
          banner_url: null,
          phone: "",
          whatsapp: "",
          address: "",
          instagram: "",
          delivery_fee: 0,
          min_order_value: 0,
          delivery_time: "40-50 min",
          opening_time: "18:00",
          closing_time: "23:59",
          open_days: [],
          theme_config: { primary_color: "#E11D48", secondary_color: "#111827" },
          is_active: true,
        };
        setTenant(cleanTenant);
      }
    } catch (_err) {
      console.warn("Erro ao resolver tenant:", _err);
    } finally {
      setIsLoadingTenant(false);
    }
  };

  const value = {
    tenant,
    tenantId: tenant?.id || localStorage.getItem("current_tenant_id") || null,
    tenantSlug: tenant?.slug || currentSlug || null,
    isLoadingTenant,
    themeConfig: tenant?.theme_config || null,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}
