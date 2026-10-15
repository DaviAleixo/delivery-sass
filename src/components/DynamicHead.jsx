import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTenant } from "@/lib/TenantContext";

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

export default function DynamicHead() {
  const location = useLocation();
  const { tenant } = useTenant();

  useEffect(() => {
    const pathname = location.pathname.toLowerCase();

    // 1. Caso especial: Super Admin (Torre de Controle Master da Plataforma)
    if (pathname.includes("superadmin")) {
      document.title = "Painel Master — Super Admin";
      clearFavicon();
      return;
    }

    // 2. Extrai slug da loja na URL se presente (ex: /texas-grill/dashboard -> slug = "texas-grill")
    const segments = location.pathname.split("/").filter(Boolean);
    const firstSegment = segments.length > 0 ? segments[0].toLowerCase() : null;
    const urlSlug = firstSegment && !RESERVED_SLUGS.has(firstSegment) ? firstSegment : null;

    // Caso especial: Login Geral da plataforma (sem loja específica)
    if (!urlSlug && pathname.includes("adminlogin")) {
      document.title = "PedeMuleke — Login Administrativo";
      clearFavicon();
      return;
    }

    // 3. Determina o nome e foto (logo) da loja ativa
    let storeName = tenant?.name || "Vruum Burguer";
    let logoUrl = null;

    if (urlSlug) {
      if (tenant?.slug === urlSlug) {
        storeName = tenant.name || urlSlug;
        logoUrl = tenant.logo_url || null;
      } else if (localStorage.getItem("current_tenant_slug") === urlSlug) {
        storeName = localStorage.getItem("current_tenant_name") || urlSlug;
      } else {
        storeName = urlSlug
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      }
    } else {
      storeName = tenant?.name || localStorage.getItem("current_tenant_name") || "Vruum Burguer";
      logoUrl = tenant?.logo_url || null;
    }

    // Garantia estrita: se a loja NÃO for a Vruum Burguer, NUNCA usa imagem da Vruum Burguer
    if (urlSlug && urlSlug !== "vrumm" && urlSlug !== "vruum-burguer") {
      if (logoUrl && logoUrl.includes("photo-1550547660-d9450f859349")) {
        logoUrl = null;
      }
    }

    // 4. Título dinâmico da aba com base na tela
    if (pathname.includes("dashboard")) {
      document.title = `${storeName} — Painel Admin`;
    } else if (pathname.includes("clients") || pathname.includes("clientes")) {
      document.title = `${storeName} — Clientes`;
    } else if (pathname.includes("orders") || pathname.includes("pedidos")) {
      document.title = `${storeName} — Pedidos`;
    } else if (pathname.includes("products") || pathname.includes("produtos")) {
      document.title = `${storeName} — Produtos`;
    } else if (pathname.includes("categories") || pathname.includes("categorias")) {
      document.title = `${storeName} — Categorias`;
    } else if (pathname.includes("settings") || pathname.includes("configuracoes")) {
      document.title = `${storeName} — Configurações`;
    } else if (pathname.includes("reports") || pathname.includes("relatorios")) {
      document.title = `${storeName} — Relatórios`;
    } else if (pathname.includes("pdv")) {
      document.title = `${storeName} — PDV Balcão`;
    } else if (pathname.includes("adminlogin") || pathname.endsWith("/admin")) {
      document.title = `${storeName} — Login Administrativo`;
    } else if (pathname.includes("myorders") || pathname.includes("meus-pedidos")) {
      document.title = `${storeName} — Meus Pedidos`;
    } else {
      document.title = `${storeName} — Cardápio Online`;
    }

    // 5. Favicon dinâmico da aba:
    // SÓ mostra se tiver foto real da empresa configurada. Se não tiver foto, fica SEM NADA.
    if (logoUrl) {
      updateFavicon(logoUrl, "image/png");
    } else {
      clearFavicon();
    }
  }, [location.pathname, tenant]);

  const clearFavicon = () => {
    const existingIcons = document.querySelectorAll("link[rel*='icon']");
    existingIcons.forEach((el) => el.remove());

    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.href = "data:,";
    document.head.appendChild(favicon);

    const shortcut = document.createElement("link");
    shortcut.rel = "shortcut icon";
    shortcut.href = "data:,";
    document.head.appendChild(shortcut);

    const appleTouchIcon = document.createElement("link");
    appleTouchIcon.rel = "apple-touch-icon";
    appleTouchIcon.href = "data:,";
    document.head.appendChild(appleTouchIcon);
  };

  const updateFavicon = (href, type = "image/png") => {
    const existingIcons = document.querySelectorAll("link[rel*='icon']");
    existingIcons.forEach((el) => el.remove());

    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.type = type;
    favicon.href = href;
    document.head.appendChild(favicon);

    const shortcut = document.createElement("link");
    shortcut.rel = "shortcut icon";
    shortcut.type = type;
    shortcut.href = href;
    document.head.appendChild(shortcut);

    const appleTouchIcon = document.createElement("link");
    appleTouchIcon.rel = "apple-touch-icon";
    appleTouchIcon.href = href;
    document.head.appendChild(appleTouchIcon);
  };

  return null;
}
