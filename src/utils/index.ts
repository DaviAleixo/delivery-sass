const RESERVED_SLUGS = new Set([
  "menu",
  "dashboard",
  "orders",
  "pedidos",
  "pdv",
  "pdvorders",
  "kds",
  "deliverydrivers",
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

export function getActiveSlug(): string {
  if (typeof window === "undefined") return "vrumm";
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments.length > 0) {
    const first = segments[0].toLowerCase();
    if (!RESERVED_SLUGS.has(first)) {
      return first;
    }
  }
  return localStorage.getItem("current_tenant_slug") || "vrumm";
}

export function createPageUrl(pageName: string, customSlug?: string): string {
  const cleanName = pageName.replace(/^\//, "").replace(/ /g, "-");
  const lower = cleanName.toLowerCase();

  // SuperAdmin e login master geral nunca usam prefixo de slug
  if (lower.startsWith("superadmin")) {
    return "/SuperAdmin";
  }

  const slug = customSlug || getActiveSlug();

  // Se for o cardápio principal
  if (lower === "menu" || lower === "home") {
    return `/${slug}/menu`;
  }

  return `/${slug}/${cleanName}`;
}