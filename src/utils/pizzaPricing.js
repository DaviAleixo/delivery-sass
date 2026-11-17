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
 * Retorna o menor preço positivo entre os tamanhos configurados da pizza
 * (garantindo que Broto / menor tamanho sempre prevaleça sobre product.price legado).
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
 * Retorna a lista ordenada de tamanhos com preço positivo para exibição no painel admin.
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

  return Object.entries(map)
    .map(([id, raw]) => ({
      id,
      name: id,
      shortName: id.charAt(0).toUpperCase() + id.slice(1),
      price: Number(raw),
    }))
    .filter((item) => Number.isFinite(item.price) && item.price > 0);
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

