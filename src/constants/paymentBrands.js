/**
 * Catálogo Oficial de Bandeiras de Cartões e Vales-Refeição/Alimentação (PedeMuleke)
 * Utilizado para configuração do restaurante, seleção do cliente no checkout,
 * impressão térmica em bobina de 80mm/58mm e despacho de motoboy com a maquininha certa.
 */

export const CARD_BRANDS = [
  {
    id: "visa",
    name: "Visa",
    category: "card",
    bgClass: "bg-blue-600 text-white border-blue-700",
    badgeBg: "bg-blue-50 text-blue-700 border-blue-200",
    tag: "VISA",
    color: "#1A1F71",
  },
  {
    id: "mastercard",
    name: "Mastercard",
    category: "card",
    bgClass: "bg-amber-600 text-white border-amber-700",
    badgeBg: "bg-amber-50 text-amber-700 border-amber-200",
    tag: "MASTER",
    color: "#EB001B",
  },
  {
    id: "elo",
    name: "Elo",
    category: "card",
    bgClass: "bg-neutral-900 text-yellow-400 border-neutral-950",
    badgeBg: "bg-neutral-100 text-neutral-800 border-neutral-300",
    tag: "ELO",
    color: "#00A4E0",
  },
  {
    id: "hipercard",
    name: "Hipercard",
    category: "card",
    bgClass: "bg-red-700 text-white border-red-800",
    badgeBg: "bg-red-50 text-red-700 border-red-200",
    tag: "HIPER",
    color: "#B31317",
  },
  {
    id: "amex",
    name: "Amex",
    fullName: "American Express",
    category: "card",
    bgClass: "bg-cyan-700 text-white border-cyan-800",
    badgeBg: "bg-cyan-50 text-cyan-800 border-cyan-200",
    tag: "AMEX",
    color: "#006FCF",
  },
];

export const MEAL_VOUCHER_BRANDS = [
  {
    id: "alelo",
    name: "Alelo",
    category: "meal",
    bgClass: "bg-emerald-600 text-white border-emerald-700",
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
    tag: "ALELO",
    color: "#008542",
  },
  {
    id: "sodexo",
    name: "Sodexo / Pluxee",
    shortName: "Sodexo",
    category: "meal",
    bgClass: "bg-sky-700 text-white border-sky-800",
    badgeBg: "bg-sky-50 text-sky-800 border-sky-200",
    tag: "SODEXO",
    color: "#002D62",
  },
  {
    id: "ticket",
    name: "Ticket Restaurante",
    shortName: "Ticket",
    category: "meal",
    bgClass: "bg-rose-600 text-white border-rose-700",
    badgeBg: "bg-rose-50 text-rose-700 border-rose-200",
    tag: "TICKET",
    color: "#ED1C24",
  },
  {
    id: "vr",
    name: "VR Benefícios",
    shortName: "VR",
    category: "meal",
    bgClass: "bg-teal-600 text-white border-teal-700",
    badgeBg: "bg-teal-50 text-teal-800 border-teal-200",
    tag: "VR",
    color: "#00A650",
  },
  {
    id: "caju",
    name: "Caju",
    category: "meal",
    bgClass: "bg-orange-500 text-white border-orange-600",
    badgeBg: "bg-orange-50 text-orange-800 border-orange-200",
    tag: "CAJU",
    color: "#FF6600",
  },
  {
    id: "flash",
    name: "Flash",
    category: "meal",
    bgClass: "bg-pink-600 text-white border-pink-700",
    badgeBg: "bg-pink-50 text-pink-700 border-pink-200",
    tag: "FLASH",
    color: "#E6007E",
  },
  {
    id: "eva",
    name: "Eva Benefícios",
    shortName: "Eva",
    category: "meal",
    bgClass: "bg-violet-600 text-white border-violet-700",
    badgeBg: "bg-violet-50 text-violet-800 border-violet-200",
    tag: "EVA",
    color: "#7E3AF2",
  },
  {
    id: "swile",
    name: "Swile",
    category: "meal",
    bgClass: "bg-zinc-800 text-pink-400 border-zinc-900",
    badgeBg: "bg-zinc-100 text-zinc-900 border-zinc-300",
    tag: "SWILE",
    color: "#000000",
  },
];

export const ALL_PAYMENT_BRANDS = [...CARD_BRANDS, ...MEAL_VOUCHER_BRANDS];

/**
 * Retorna as informações de estilo e nome de uma bandeira pelo ID ou texto
 */
export function getPaymentBrandInfo(brandIdOrName) {
  if (!brandIdOrName) return null;
  const clean = String(brandIdOrName).trim().toLowerCase();
  return (
    ALL_PAYMENT_BRANDS.find(
      (b) => b.id === clean || b.name.toLowerCase() === clean || b.tag.toLowerCase() === clean
    ) || {
      id: clean,
      name: brandIdOrName,
      category: "other",
      bgClass: "bg-stone-700 text-white",
      badgeBg: "bg-stone-100 text-stone-800 border-stone-300",
      tag: String(brandIdOrName).slice(0, 6).toUpperCase(),
    }
  );
}

