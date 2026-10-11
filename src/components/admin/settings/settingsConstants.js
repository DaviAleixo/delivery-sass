export const DAYS_CONFIG = [
  { day: 1, key: "segunda", name: "Segunda-feira", short: "Seg" },
  { day: 2, key: "terca",   name: "Terça-feira",   short: "Ter" },
  { day: 3, key: "quarta",  name: "Quarta-feira",  short: "Qua" },
  { day: 4, key: "quinta",  name: "Quinta-feira",  short: "Qui" },
  { day: 5, key: "sexta",   name: "Sexta-feira",   short: "Sex" },
  { day: 6, key: "sabado",  name: "Sábado",        short: "Sáb" },
  { day: 0, key: "domingo", name: "Domingo",       short: "Dom" },
];

export const getDayDisplayName = (dayVal) => {
  if (dayVal === undefined || dayVal === null) return "Dia";
  const num = Number(dayVal);
  if (!isNaN(num)) {
    const found = DAYS_CONFIG.find(c => c.day === num);
    if (found) return found.name;
  }
  const str = String(dayVal).toLowerCase().trim();
  const foundStr = DAYS_CONFIG.find(c => c.key === str || c.name.toLowerCase().includes(str));
  if (foundStr) return foundStr.name;
  return String(dayVal);
};

export const normalizeOpenDays = (rawOpenDays, defaultOpening = "18:00", defaultClosing = "23:00") => {
  const defOpen = defaultOpening || "18:00";
  const defClose = defaultClosing || "23:00";

  if (!Array.isArray(rawOpenDays) || rawOpenDays.length === 0) {
    return DAYS_CONFIG.map(cfg => ({
      day: cfg.day,
      enabled: cfg.day !== 0,
      opening_time: defOpen,
      closing_time: defClose,
    }));
  }

  if (typeof rawOpenDays[0] === "string") {
    const stringSet = new Set(rawOpenDays.map(s => String(s).toLowerCase().trim()));
    return DAYS_CONFIG.map(cfg => ({
      day: cfg.day,
      enabled: stringSet.has(cfg.key) || stringSet.has(String(cfg.day)),
      opening_time: defOpen,
      closing_time: defClose,
    }));
  }

  return DAYS_CONFIG.map(cfg => {
    const match = rawOpenDays.find(item => {
      if (!item) return false;
      if (item.day === cfg.day || Number(item.day) === cfg.day) return true;
      if (typeof item.day === "string" && item.day.toLowerCase() === cfg.key) return true;
      return false;
    });

    if (match) {
      return {
        day: cfg.day,
        enabled: match.enabled !== undefined ? Boolean(match.enabled) : true,
        opening_time: match.opening_time || defOpen,
        closing_time: match.closing_time || defClose,
      };
    }

    return {
      day: cfg.day,
      enabled: false,
      opening_time: defOpen,
      closing_time: defClose,
    };
  });
};

export const defaultOpenDays = () => normalizeOpenDays(null);

export const formatPhone = (val) => {
  if (!val || val === "-") return "";
  const raw = String(val).replace(/\D/g, "").slice(0, 11);
  if (raw.length <= 2) return raw.length > 0 ? `(${raw}` : "";
  if (raw.length <= 6) return `(${raw.slice(0, 2)}) ${raw.slice(2)}`;
  if (raw.length <= 10) return `(${raw.slice(0, 2)}) ${raw.slice(2, 6)}-${raw.slice(6)}`;
  return `(${raw.slice(0, 2)}) ${raw.slice(2, 7)}-${raw.slice(7)}`;
};

export const formatCep = (val) => {
  if (!val) return "";
  const clean = String(val).replace(/\D/g, "").slice(0, 8);
  if (clean.length > 5) return `${clean.slice(0, 5)}-${clean.slice(5, 8)}`;
  return clean;
};

export const buildFullAddress = (fields = {}) => {
  const street = (fields.address_street || "").trim();
  const number = (fields.address_number || "").trim();
  const comp = (fields.address_complement || "").trim();
  const neigh = (fields.address_neighborhood || "").trim();
  const city = (fields.address_city || "").trim();
  const state = (fields.address_state || "").trim();

  let line1 = "";
  if (street) {
    line1 = number ? `${street}, nº ${number}` : street;
  } else if (number) {
    line1 = `nº ${number}`;
  }

  if (comp) {
    line1 = line1 ? `${line1} (${comp})` : comp;
  }

  const parts = [];
  if (line1) parts.push(line1);
  if (neigh) parts.push(neigh);
  if (city && state) parts.push(`${city} - ${state}`);
  else if (city) parts.push(city);

  return parts.join(", ");
};

export const ALL_ADMIN_SCREENS = [
  { key: "Dashboard", label: "Dashboard / Visão Geral" },
  { key: "Orders", label: "Pedidos / Gestor" },
  { key: "KDS", label: "KDS Cozinha" },
  { key: "PDV", label: "PDV Balcão" },
  { key: "Clients", label: "Clientes" },
  { key: "Products", label: "Produtos & Cardápio" },
  { key: "Categories", label: "Categorias" },
  { key: "Complements", label: "Complementos & Adicionais" },
  { key: "Coupons", label: "Cupons de Desconto" },
  { key: "Banners", label: "Banners Promocionais" },
  { key: "Reports", label: "Relatórios de Vendas" },
  { key: "Settings", label: "Configurações da Loja & Usuários" },
];
