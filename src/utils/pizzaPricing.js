export const CATEGORY_TYPES = {
  STANDARD: "standard",
  VARIATION_GRID: "variation_grid",
  PIZZA: "pizza",
};

export const DEFAULT_PIZZA_SIZES = [
  { id: "broto", name: "Broto (4 fatias)", slices: 4, max_flavors: 1 },
  { id: "media", name: "Média (6 fatias)", slices: 6, max_flavors: 2 },
  { id: "grande", name: "Grande (8 fatias)", slices: 8, max_flavors: 2 },
  { id: "familia", name: "Família (12 fatias)", slices: 12, max_flavors: 3 },
];

export const VARIATION_GRID_PRESETS = {
  cervejas: {
    label: "Cervejas (Latão, Long Neck, Mega Latão, 600ml, Lata)",
    sizes: [
      { id: "latao", name: "Latão" },
      { id: "long_neck", name: "Long Neck" },
      { id: "mega_latao", name: "Mega Latão" },
      { id: "600ml", name: "600ml" },
      { id: "lata", name: "Lata" },
    ],
  },
  refrigerantes: {
    label: "Refrigerantes (Lata, 600ml, 1L, 2L)",
    sizes: [
      { id: "lata_350ml", name: "Lata 350ml" },
      { id: "600ml", name: "600ml" },
      { id: "1l", name: "1 Litro" },
      { id: "2l", name: "2 Litros" },
    ],
  },
  copos_acai: {
    label: "Copos / Açaí (300ml, 500ml, 700ml, 1L)",
    sizes: [
      { id: "300ml", name: "300ml" },
      { id: "500ml", name: "500ml" },
      { id: "700ml", name: "700ml" },
      { id: "1l", name: "1 Litro" },
    ],
  },
  porcoes_marmitas: {
    label: "Tamanhos (P, M, G)",
    sizes: [
      { id: "p", name: "Pequeno (P)" },
      { id: "m", name: "Médio (M)" },
      { id: "g", name: "Grande (G)" },
    ],
  },
};

export function normalizeVariationId(name, fallbackIndex = 0) {
  const cleaned = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || `var_${fallbackIndex}_${Date.now()}`;
}

export function isPizzaCategory(category) {
  return category?.type === CATEGORY_TYPES.PIZZA;
}

export function isVariationGridCategory(category) {
  return (
    category?.type === CATEGORY_TYPES.VARIATION_GRID ||
    category?.type === "grid" ||
    (category?.type !== CATEGORY_TYPES.PIZZA &&
      Array.isArray(category?.pizza_sizes) &&
      category.pizza_sizes.length > 0)
  );
}

export function hasCategorySizeMatrix(category) {
  return isPizzaCategory(category) || isVariationGridCategory(category);
}

export function getCategoryMatrixSizes(category) {
  if (!category) return [];
  if (Array.isArray(category.pizza_sizes) && category.pizza_sizes.length > 0) {
    return category.pizza_sizes;
  }
  if (isPizzaCategory(category)) {
    return DEFAULT_PIZZA_SIZES;
  }
  return [];
}

export function formatBRLValue(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;
}

export function hasPizzaPrices(product) {
  return Boolean(
    product?.pizza_prices &&
      typeof product.pizza_prices === "object" &&
      Object.values(product.pizza_prices).some((v) => Number(v) > 0)
  );
}

/**
 * Retorna o menor preço positivo entre os tamanhos/variações configurados do produto.
 */
export function getMinPizzaPrice(product, categorySizes = []) {
  const map = product?.pizza_prices;
  if (!map || typeof map !== "object") {
    return Number(product?.price || 0);
  }

  const sizeIds = Array.isArray(categorySizes)
    ? categorySizes.map((s) => s.id).filter(Boolean)
    : [];

  const matchedPrices = sizeIds
    .map((id) => Number(map[id]))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (matchedPrices.length > 0) {
    return Math.min(...matchedPrices);
  }

  const allPositive = Object.values(map)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (allPositive.length > 0) {
    return Math.min(...allPositive);
  }

  return Number(product?.price || 0);
}

/**
 * Verifica se o produto possui múltiplos preços distintos na grade de variações.
 */
export function hasMultipleDistinctVariationPrices(product, categorySizes = []) {
  const list = getPizzaSizePriceList(product, categorySizes);
  if (list.length <= 1) return false;
  const uniquePrices = new Set(list.map((item) => Number(item.price).toFixed(2)));
  return uniquePrices.size > 1;
}

/**
 * Retorna a lista ordenada de tamanhos/variações com preço positivo para exibição no admin e cardápio.
 */
export function getPizzaSizePriceList(product, categorySizes = []) {
  const map = product?.pizza_prices;
  if (!map || typeof map !== "object") return [];

  const shortenName = (name) =>
    String(name || "")
      .replace(/\s*\([^)]*\)\s*/g, "")
      .trim();

  if (Array.isArray(categorySizes) && categorySizes.length > 0) {
    const ordered = [];
    for (const size of categorySizes) {
      const price = Number(map[size.id]);
      if (Number.isFinite(price) && price > 0) {
        ordered.push({
          id: size.id,
          name: size.name,
          shortName: shortenName(size.name) || size.id,
          price,
        });
      }
    }
    if (ordered.length > 0) return ordered;
  }

  const fallbackNames = {
    latao: "Latão",
    long_neck: "Long Neck",
    mega_latao: "Mega Latão",
    "600ml": "600ml",
    lata: "Lata",
    lata_350ml: "Lata 350ml",
    "350ml": "350ml",
    "1l": "1 Litro",
    "2l": "2 Litros",
    broto: "Broto",
    media: "Média",
    grande: "Grande",
    familia: "Família",
  };

  return Object.entries(map)
    .map(([id, raw]) => {
      const resolvedName = fallbackNames[id] || id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ");
      return {
        id,
        name: resolvedName,
        shortName: resolvedName,
        price: Number(raw),
      };
    })
    .filter((item) => Number.isFinite(item.price) && item.price > 0);
}

/**
 * Constrói um grupo de complemento virtual de Escolha Única para produtos de categorias com Grade de Variações
 * (ex: Cervejas com Latão, Long Neck, Mega Latão, 600ml, Lata).
 * Oculta automaticamente variações não preenchidas (---).
 */
export function buildCategoryVariationComplementGroup(product, category) {
  if (!product || isPizzaCategory(category)) return null;
  if (!hasPizzaPrices(product)) return null;

  const categorySizes = getCategoryMatrixSizes(category);
  const activeVariations = getPizzaSizePriceList(product, categorySizes);

  if (activeVariations.length === 0) return null;

  return {
    id: "__category_variation_grid__",
    name: "Escolha a opção",
    description: "",
    min_quantity: 1,
    max_quantity: 1,
    free_quantity: 0,
    required: true,
    active: true,
    is_size_selector: true,
    is_category_variation_group: true,
    order_index: -100,
    items: activeVariations.map((v, idx) => ({
      id: `cat_var_${v.id}`,
      variation_size_id: v.id,
      group_id: "__category_variation_grid__",
      name: v.name,
      description: "",
      price: v.price,
      max_quantity: 1,
      active: true,
      order_index: idx + 1,
      is_category_variation: true,
    })),
  };
}

/**
 * Monta o mapa inicial de preços a partir dos preços padrão da categoria.
 */
export function buildDefaultPizzaPrices(categorySizes = []) {
  const result = {};
  if (!Array.isArray(categorySizes)) return result;

  for (const size of categorySizes) {
    const def = Number(size?.default_price);
    if (size?.id && Number.isFinite(def) && def > 0) {
      result[size.id] = def;
    }
  }
  return result;
}
