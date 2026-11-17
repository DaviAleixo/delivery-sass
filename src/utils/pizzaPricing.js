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
    key: "cervejas",
    title: "Cervejas",
    iconName: "Beer",
    tags: ["Latão", "Long Neck", "600ml", "Lata", "Mega Latão"],
    badge: "5 tamanhos",
    description: "Latão, Long Neck, Mega Latão, 600ml e Lata",
    sizes: [
      { id: "latao", name: "Latão" },
      { id: "long_neck", name: "Long Neck" },
      { id: "mega_latao", name: "Mega Latão" },
      { id: "600ml", name: "600ml" },
      { id: "lata", name: "Lata" },
    ],
  },
  refrigerantes: {
    key: "refrigerantes",
    title: "Refrigerantes & Sucos",
    iconName: "CupSoda",
    tags: ["Lata 350ml", "600ml", "1 Litro", "2 Litros"],
    badge: "4 tamanhos",
    description: "Lata 350ml, 600ml, 1 Litro e 2 Litros",
    sizes: [
      { id: "lata_350ml", name: "Lata 350ml" },
      { id: "600ml", name: "600ml" },
      { id: "1l", name: "1 Litro" },
      { id: "2l", name: "2 Litros" },
    ],
  },
  copos_acai: {
    key: "copos_acai",
    title: "Açaí & Copos",
    iconName: "GlassWater",
    tags: ["300ml", "500ml", "700ml", "1 Litro"],
    badge: "4 tamanhos",
    description: "300ml, 500ml, 700ml e 1 Litro",
    sizes: [
      { id: "300ml", name: "300ml" },
      { id: "500ml", name: "500ml" },
      { id: "700ml", name: "700ml" },
      { id: "1l", name: "1 Litro" },
    ],
  },
  porcoes_marmitas: {
    key: "porcoes_marmitas",
    title: "Porções & Marmitas",
    iconName: "Layers",
    tags: ["Pequeno (P)", "Médio (M)", "Grande (G)"],
    badge: "3 tamanhos",
    description: "Pequeno (P), Médio (M) e Grande (G)",
    sizes: [
      { id: "p", name: "Pequeno (P)" },
      { id: "m", name: "Médio (M)" },
      { id: "g", name: "Grande (G)" },
    ],
  },
};

export function parsePizzaPrices(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function parseCategorySizes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Localiza com máxima resiliência a categoria correspondente a um produto,
 * tolerando diferenças de ID vs Nome, acentuação, maiúsculas/minúsculas e emojis (ex: 'cerveja 🍻' vs 'cerveja').
 */
export function findMatchingCategory(product, categories = []) {
  if (!product || !Array.isArray(categories) || categories.length === 0) return null;

  const normalize = (str) =>
    String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\w\s]/gi, "")
      .trim();

  const prodCatId = String(product.category_id || "").trim();
  const prodCatName = String(product.category || "").trim();
  const normProdCatName = normalize(prodCatName);
  const normProdCatId = normalize(prodCatId);

  // 1. Correspondência exata por ID
  let found = categories.find((c) => {
    const cId = String(c.id || "").trim();
    return cId && (cId === prodCatId || cId === prodCatName);
  });
  if (found) return found;

  // 2. Correspondência exata por Nome (case-insensitive)
  found = categories.find((c) => {
    const cName = String(c.name || "").trim().toLowerCase();
    return cName && (cName === prodCatName.toLowerCase() || cName === prodCatId.toLowerCase());
  });
  if (found) return found;

  // 3. Correspondência normalizada (sem acentos, pontuações ou emojis)
  found = categories.find((c) => {
    const normCName = normalize(c.name);
    return normCName && (normCName === normProdCatName || normCName === normProdCatId);
  });
  if (found) return found;

  // 4. Inclusão de substring (ex: 'cerveja' dentro de 'cerveja 🍻' ou 'cervejas')
  found = categories.find((c) => {
    const normCName = normalize(c.name);
    if (!normCName) return false;
    if (normProdCatName && (normCName.includes(normProdCatName) || normProdCatName.includes(normCName))) return true;
    if (normProdCatId && (normCName.includes(normProdCatId) || normProdCatId.includes(normCName))) return true;
    return false;
  });

  return found || null;
}

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
  if (!category) return false;
  const sizes = parseCategorySizes(category.pizza_sizes);
  return (
    category.type === CATEGORY_TYPES.VARIATION_GRID ||
    category.type === "grid" ||
    category.type === "variation_grid" ||
    (category.type !== CATEGORY_TYPES.PIZZA && sizes.length > 0)
  );
}

export function hasCategorySizeMatrix(category) {
  return isPizzaCategory(category) || isVariationGridCategory(category);
}

export function getCategoryMatrixSizes(category) {
  if (!category) return [];
  const sizes = parseCategorySizes(category.pizza_sizes);
  if (sizes.length > 0) {
    return sizes;
  }
  if (isPizzaCategory(category)) {
    return DEFAULT_PIZZA_SIZES;
  }
  if (isVariationGridCategory(category)) {
    return VARIATION_GRID_PRESETS.cervejas.sizes;
  }
  return [];
}

export function formatBRLValue(val) {
  return `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;
}

export function hasPizzaPrices(product) {
  const map = parsePizzaPrices(product?.pizza_prices);
  return Boolean(
    map &&
      typeof map === "object" &&
      Object.values(map).some((v) => Number(v) > 0)
  );
}

/**
 * Retorna o menor preço positivo entre os tamanhos/variações configurados do produto.
 */
export function getMinPizzaPrice(product, categorySizes = []) {
  const map = parsePizzaPrices(product?.pizza_prices);
  const parsedSizes = parseCategorySizes(categorySizes);

  if (map && typeof map === "object") {
    const sizeIds = parsedSizes.map((s) => s.id).filter(Boolean);
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
  }

  // Se a categoria tem tamanhos com default_price
  const defaultPrices = parsedSizes
    .map((s) => Number(s.default_price))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (defaultPrices.length > 0) {
    return Math.min(...defaultPrices);
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
  const map = parsePizzaPrices(product?.pizza_prices);
  const parsedSizes = parseCategorySizes(categorySizes);

  const shortenName = (name) =>
    String(name || "")
      .replace(/\s*\([^)]*\)\s*/g, "")
      .trim();

  // 1. Se houver categorySizes e o produto tiver mapa de preços
  if (parsedSizes.length > 0 && map && typeof map === "object" && Object.keys(map).length > 0) {
    const ordered = [];
    for (const size of parsedSizes) {
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

  // 2. Mapeamento por chaves do produto usando fallbackNames
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

  if (map && typeof map === "object" && Object.keys(map).length > 0) {
    const fromMap = Object.entries(map)
      .map(([id, raw]) => {
        const matchingCatSize = parsedSizes.find((s) => s.id === id);
        const resolvedName = matchingCatSize?.name || fallbackNames[id] || id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ");
        return {
          id,
          name: resolvedName,
          shortName: shortenName(resolvedName),
          price: Number(raw),
        };
      })
      .filter((item) => Number.isFinite(item.price) && item.price > 0);

    if (fromMap.length > 0) return fromMap;
  }

  // 3. Fallback: Se o produto não possui pizza_prices preenchidos individualmente,
  // mas os tamanhos da categoria possuem default_price ou o produto possui preço base
  if (parsedSizes.length > 0) {
    const basePrice = Number(product?.price || 0);
    return parsedSizes.map((size) => {
      const itemPrice = Number(size.default_price) > 0 ? Number(size.default_price) : basePrice;
      return {
        id: size.id,
        name: size.name,
        shortName: shortenName(size.name) || size.id,
        price: itemPrice,
      };
    }).filter((item) => Number.isFinite(item.price) && item.price > 0);
  }

  return [];
}

/**
 * Constrói um grupo de complemento virtual de Escolha Única para produtos de categorias com Grade de Variações
 * (ex: Cervejas com Latão, Long Neck, Mega Latão, 600ml, Lata).
 * Oculta automaticamente variações não preenchidas (---) quando houver preços específicos.
 */
export function buildCategoryVariationComplementGroup(product, category) {
  if (!product || isPizzaCategory(category)) return null;

  const categorySizes = getCategoryMatrixSizes(category);
  const activeVariations = getPizzaSizePriceList(product, categorySizes);

  if (activeVariations.length === 0) return null;

  const customTitle = category?.variation_title || (categorySizes.length > 0 && categorySizes[0]?.group_title);
  const groupName = customTitle && customTitle.trim() !== "" ? customTitle.trim() : "Escolha a opção";

  return {
    id: "__category_variation_grid__",
    name: groupName,
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
