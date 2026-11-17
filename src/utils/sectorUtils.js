import { createPageUrl } from "@/utils";

/**
 * Converte um nome de setor em slug seguro para URL e busca estável.
 */
export function slugifySector(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "setor";
}

/**
 * Encontra o setor configurado correspondente ao parâmetro da URL (id ou slug).
 */
export function findSectorByParam(sectors = [], param = "") {
  if (!param || !Array.isArray(sectors)) return null;
  const normalized = String(param).trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "todos") return null;

  return (
    sectors.find(
      (s) =>
        String(s.id).toLowerCase() === normalized ||
        String(s.slug || "").toLowerCase() === normalized
    ) || null
  );
}

/**
 * Extrai com segurança o array de itens de um pedido (suporta array ou JSON string).
 */
export function parseOrderItems(order) {
  if (!order) return [];
  if (Array.isArray(order.items)) return order.items;
  if (typeof order.items === "string") {
    try {
      const parsed = JSON.parse(order.items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Seleciona o setor KDS padrão de fallback para itens sem setor vinculado
 * (prioriza "Cozinha"; caso não exista, usa o primeiro setor KDS ativo).
 */
export function getDefaultKdsFallbackSector(sectors = []) {
  const activeKds = (Array.isArray(sectors) ? sectors : [])
    .filter((s) => s && s.is_active !== false && s.operation_mode !== "print_only")
    .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));

  if (activeKds.length === 0) return null;

  return (
    activeKds.find((s) => {
      const sl = String(s.slug || "").toLowerCase();
      const nm = slugifySector(s.name || "");
      return sl === "cozinha" || nm === "cozinha" || sl.includes("cozinha") || nm.includes("cozinha");
    }) || activeKds[0]
  );
}

/**
 * Resolve o setor de produção de um item do carrinho/pedido.
 * Prioridade: snapshot no item -> override do produto -> setor padrão da categoria.
 */
export function resolveItemSector(item, { sectors = [], products = [], categories = [] } = {}) {
  if (!item) return { sectorId: null, sectorName: null, sector: null };

  let sectorId = item.sector_id || null;

  if (!sectorId) {
    const itemProdId = item.product_id || item.id;
    const itemProdName = String(item.product_name || item.name || "").trim().toLowerCase();
    const prod =
      products.find((p) => itemProdId && String(p.id) === String(itemProdId)) ||
      (itemProdName
        ? products.find((p) => String(p.name || "").trim().toLowerCase() === itemProdName)
        : null);

    if (prod?.sector_id) {
      sectorId = prod.sector_id;
    } else {
      const catCandidates = [
        item.category_id,
        prod?.category_id,
        prod?.category,
        item.category_name,
        typeof item.category === "string" ? item.category : item.category?.id || item.category?.name,
      ]
        .filter(Boolean)
        .map((val) => String(val).trim());

      const cat = categories.find((c) => {
        const cId = String(c.id || "").trim();
        const cName = String(c.name || "").trim().toLowerCase();
        return catCandidates.some(
          (cand) => (cId && cId === cand) || (cName && cName === cand.toLowerCase())
        );
      });

      if (cat?.sector_id) {
        sectorId = cat.sector_id;
      }
    }
  }

  if (!sectorId) {
    return { sectorId: null, sectorName: null, sector: null };
  }

  const sector = sectors.find((s) => String(s.id) === String(sectorId)) || null;
  return {
    sectorId: String(sectorId),
    sectorName: sector?.name || item.sector_name || null,
    sector,
  };
}

/**
 * Carimba sector_id, sector_name e category_id em cada item antes de salvar o pedido.
 */
export function stampOrderItemsWithSectors(items = [], { sectors = [], products = [], categories = [] } = {}) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const prod = products.find((p) => String(p.id) === String(item.product_id || item.id));
    const categoryId = item.category_id || prod?.category_id || prod?.category || null;
    const { sectorId, sectorName } = resolveItemSector(
      { ...item, category_id: categoryId },
      { sectors, products, categories }
    );

    return {
      ...item,
      ...(categoryId ? { category_id: String(categoryId) } : {}),
      ...(sectorId ? { sector_id: sectorId } : {}),
      ...(sectorName ? { sector_name: sectorName } : {}),
    };
  });
}

/**
 * Filtra os itens de um pedido que pertencem a um determinado setor.
 * Itens sem setor vinculado podem usar fallbackSectorId (ex.: Cozinha no KDS) para nunca perder pedidos.
 */
export function filterOrderItemsForSector(order, sector, lookup = {}) {
  const items = parseOrderItems(order);
  if (!sector) return items;

  const fallbackSectorId = lookup?.fallbackSectorId ? String(lookup.fallbackSectorId) : null;

  return items.filter((item) => {
    const { sectorId } = resolveItemSector(item, lookup);
    const effectiveSectorId = sectorId || fallbackSectorId;
    return effectiveSectorId && String(effectiveSectorId) === String(sector.id);
  });
}

/**
 * Normaliza o canal de origem do pedido para 'delivery', 'pickup' ou 'dine_in'.
 */
export function normalizeOrderChannel(order) {
  if (!order) return "delivery";
  const type = String(order.order_type || "").toLowerCase();
  const tableStr = String(order.table_number || "").toLowerCase();

  if (
    type === "pickup" ||
    type === "balcao" ||
    type === "takeaway" ||
    type === "takeout" ||
    tableStr.includes("balc")
  ) {
    return "pickup";
  }
  if (type === "dine_in" || type === "mesa" || (tableStr && !tableStr.includes("balc"))) {
    return "dine_in";
  }
  return "delivery";
}

/**
 * Analisa os jobs de impressão por setor de um pedido, separando jobs prontos agora
 * dos que aguardam aceite no Delivery ('print_on_delivery === "on_accept"').
 */
export function analyzeOrderPrintJobs(
  order,
  { sectors = [], products = [], categories = [], ignoreDeliveryTrigger = false } = {}
) {
  const activePrintSectors = (Array.isArray(sectors) ? sectors : [])
    .filter(
      (s) =>
        s.is_active !== false &&
        (s.operation_mode === "kds_and_print" || s.operation_mode === "print_only")
    )
    .sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));

  if (activePrintSectors.length === 0) {
    return { hasActivePrintSectors: false, jobs: [], deferredJobs: [] };
  }

  const channel = normalizeOrderChannel(order);
  const status = String(order?.status || "").toLowerCase();
  const lookup = { sectors, products, categories };
  const allItems = parseOrderItems(order);
  const jobs = [];
  const deferredJobs = [];

  for (const sector of activePrintSectors) {
    const allowedChannels =
      Array.isArray(sector.allowed_channels) && sector.allowed_channels.length > 0
        ? sector.allowed_channels
        : ["delivery", "pickup", "dine_in"];

    if (!allowedChannels.includes(channel)) {
      continue;
    }

    const isFullTicket = sector.content_mode === "full_ticket" || sector.content_mode === "short_receipt";
    const targetItems = isFullTicket
      ? allItems
      : filterOrderItemsForSector(order, sector, lookup);

    if (!targetItems || targetItems.length === 0) {
      continue;
    }

    const job = {
      sector_id: sector.id,
      sector_key: String(sector.id),
      sector_name: sector.name,
      printer_name: sector.printer_name || null,
      printer_type: sector.printer_type || "thermal_raw",
      paper_width: sector.paper_width || "80mm",
      content_mode: sector.content_mode || "production_only",
      copies: Math.max(1, Math.min(5, Number(sector.copies) || 1)),
      items: targetItems,
    };

    const waitDeliveryAccept =
      !ignoreDeliveryTrigger &&
      channel === "delivery" &&
      sector.print_on_delivery === "on_accept" &&
      (status === "pendente" || status === "aguardando_pagamento");

    if (waitDeliveryAccept) {
      deferredJobs.push(job);
    } else {
      jobs.push(job);
    }
  }

  return { hasActivePrintSectors: true, jobs, deferredJobs };
}

/**
 * Constrói os jobs de impressão por setor prontos para execução imediata.
 * Se não houver setores com impressão ativa, retorna array vazio para permitir fallback legado.
 */
export function buildOrderPrintJobs(order, options = {}) {
  return analyzeOrderPrintJobs(order, options).jobs;
}

/**
 * Gera a URL direta (relativa e absoluta) do KDS filtrada para uma seção/setor específico.
 */
export function buildSectorKdsLinks(slug, sector, { kiosk = true } = {}) {
  const basePath = createPageUrl("KDS", slug);
  const params = new URLSearchParams();
  if (sector) {
    params.set("sector", sector.slug || sector.id);
  }
  if (kiosk) {
    params.set("kiosk", "true");
  }
  const query = params.toString();
  const relativePath = query ? `${basePath}?${query}` : basePath;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return {
    relativePath,
    absoluteUrl: origin ? `${origin}${relativePath}` : relativePath,
  };
}

