import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { sanitizeOrderData, sanitizeProductData } from "@/schemas/sanitizers";

/**
 * Storage manager supporting Supabase with ultra-low egress caching,
 * in-flight request deduplication, explicit column projections (no SELECT *),
 * and localStorage fallback.
 */
const STORAGE_PREFIX = "vrumburguer_db_";

// Mapeamento de projeção de colunas estritas (PROIBIDO SELECT *)
// Retorna apenas as colunas indispensáveis para economizar banda/egress do Supabase
const TABLE_COLUMNS = {
  settings: "id,restaurant_name,restaurant_logo,opening_time,closing_time,open_days,phone,address,instagram,whatsapp,delivery_fee,min_order_value,delivery_time,manual_store_open,manual_override_date",
  categories: "id,tenant_id,name,order_index,is_combo,created_date",
  products: "id,tenant_id,name,description,price,category,category_id,image_url,available,popular,created_date",
  product_additionals: "id,tenant_id,product_id,name,price,required,max_quantity,active",
  complement_groups: "id,tenant_id,name,description,min_quantity,max_quantity,required,active,order_index",
  complement_items: "id,tenant_id,group_id,name,description,price,max_quantity,image_url,active,order_index",
  product_complement_groups: "id,tenant_id,product_id,group_id,order_index",
  banner_images: "id,tenant_id,title,image_url,order_index,active",
  banners: "id,tenant_id,title,image_url,order_index,active",
  coupons: "id,tenant_id,code,name,description,discount_type,discount_value,apply_to,applicable_products,min_order_value,usage_limit,start_date,end_date,active",
  coupon_usages: "id,tenant_id,coupon_id,user_email,order_id,created_date",
  orders: "id,tenant_id,order_number,customer_name,customer_phone,customer_email,customer_address,delivery_address,total_amount,total,subtotal,delivery_fee,status,payment_method,order_type,table_number,notes,coupon_code,discount_amount,discount,user_email,items,sent_at,created_date",
  users: "id,full_name,email,phone,role,created_date",
  user_addresses: "id,tenant_id,user_email,user_phone,name,cep,zip_code,street,number,complement,neighborhood,city,state,reference,is_default",
  admin_users: "id,tenant_id,username,initial_password,role,active,permissions,created_date,updated_date",
};

// Tabelas estáticas elegíveis para cache persistido em LocalStorage
const PERSISTENT_CACHE_TABLES = new Set([
  "settings",
  "categories",
  "complement_groups",
  "complement_items",
  "product_complement_groups",
  "banner_images",
  "banners"
]);

// Memória Cache em tempo de execução para eliminar egress redundante
const memoryCache = new Map();

// Compartilhamento de requisições simultâneas em andamento (In-Flight Promise Deduplication)
const inFlightPromises = new Map();

// Tabela de tempos de expiração de cache (TTL em milissegundos)
// Tempos ágeis para garantir atualização imediata no site da loja ao alterar no painel
const CACHE_TTL_MAP = {
  settings: 5 * 1000,                    // 5 segundos
  categories: 10 * 1000,                 // 10 segundos
  banner_images: 5 * 1000,               // 5 segundos
  banners: 5 * 1000,                     // 5 segundos
  complement_groups: 10 * 1000,          // 10 segundos
  complement_items: 10 * 1000,           // 10 segundos
  product_complement_groups: 10 * 1000,  // 10 segundos
  products: 10 * 1000,                   // 10 segundos (com invalidação instantânea no CRUD)
  product_additionals: 10 * 1000,        // 10 segundos
  coupons: 5 * 1000,                     // 5 segundos
  orders: 3 * 1000,                      // 3 segundos
  users: 30 * 1000,                      // 30 segundos
  user_addresses: 30 * 1000,             // 30 segundos
  admin_users: 5 * 1000,                 // 5 segundos
};

// Coleções com dados isolados por restaurante (tenant_id)
const MULTI_TENANT_COLLECTIONS = new Set([
  "categories",
  "products",
  "product_additionals",
  "complement_groups",
  "complement_items",
  "product_complement_groups",
  "banner_images",
  "banners",
  "coupons",
  "coupon_usages",
  "orders",
  "admin_users",
  "user_addresses",
  "users",
  "customers",
]);

export function getActiveTenantId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("current_tenant_id") || null;
}

function getCacheKey(collectionKey, method, query, sort, limit) {
  const tenantId = MULTI_TENANT_COLLECTIONS.has(collectionKey) ? getActiveTenantId() : "global";
  return `${collectionKey}_${tenantId || "default"}_${method}_${JSON.stringify(query || {})}_${sort || ""}_${limit || ""}`;
}

export function invalidateCache(collectionKey) {
  const keysToInvalidate = [collectionKey];
  if (collectionKey === "banners" || collectionKey === "banner_images") {
    keysToInvalidate.push("banners", "banner_images");
  }

  for (const targetKey of keysToInvalidate) {
    for (const key of memoryCache.keys()) {
      if (key.startsWith(`${targetKey}_`)) {
        memoryCache.delete(key);
      }
    }
    if (typeof window !== "undefined") {
      try {
        const tenantId = getActiveTenantId();
        const prefix = tenantId ? `${STORAGE_PREFIX}${tenantId}_` : STORAGE_PREFIX;
        localStorage.removeItem(`${prefix}cache_ts_${targetKey}`);
        localStorage.removeItem(`${STORAGE_PREFIX}cache_ts_${targetKey}`);
      } catch {}
    }
  }
}

// Canal cross-tab para sincronização em tempo real entre painel e loja
const broadcast = typeof window !== "undefined" && typeof window.BroadcastChannel !== "undefined"
  ? new BroadcastChannel("vrumburguer_db_sync")
  : null;

if (broadcast) {
  broadcast.onmessage = (event) => {
    const { collectionKey, type, data, id } = event.data || {};
    if (collectionKey) {
      invalidateCache(collectionKey);
      const localEvent = new CustomEvent(`db_event_${collectionKey}`, {
        detail: { type, data, id },
      });
      window.dispatchEvent(localEvent);
    }
  };
}

// Fallback de sincronização cross-tab via StorageEvent
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === `${STORAGE_PREFIX}last_sync` && e.newValue) {
      try {
        const { collectionKey, type, data, id } = JSON.parse(e.newValue);
        if (collectionKey) {
          invalidateCache(collectionKey);
          const localEvent = new CustomEvent(`db_event_${collectionKey}`, {
            detail: { type, data, id },
          });
          window.dispatchEvent(localEvent);
        }
      } catch {}
    }
  });
}

// Garantir que a versão oficial do cardápio seja carregada
const MENU_DATA_VERSION = "delivery_menu_v1_0";
if (typeof window !== "undefined") {
  try {
    const currentVer = localStorage.getItem(`${STORAGE_PREFIX}menu_data_version`);
    if (currentVer !== MENU_DATA_VERSION) {
      localStorage.setItem(`${STORAGE_PREFIX}menu_data_version`, MENU_DATA_VERSION);
      localStorage.removeItem(`${STORAGE_PREFIX}products`);
      localStorage.removeItem(`${STORAGE_PREFIX}categories`);
      localStorage.removeItem(`${STORAGE_PREFIX}complement_groups`);
      localStorage.removeItem(`${STORAGE_PREFIX}complement_items`);
      localStorage.removeItem(`${STORAGE_PREFIX}product_complement_groups`);
      localStorage.removeItem(`${STORAGE_PREFIX}product_additionals`);
      for (const key of ["products", "categories", "complement_groups", "complement_items", "product_complement_groups"]) {
        localStorage.removeItem(`${STORAGE_PREFIX}cache_ts_${key}`);
      }
    }
  } catch {}
}

function getStoragePrefixForCollection(collectionKey) {
  if (MULTI_TENANT_COLLECTIONS.has(collectionKey)) {
    const tenantId = getActiveTenantId();
    if (tenantId) return `${STORAGE_PREFIX}${tenantId}_`;
  }
  return STORAGE_PREFIX;
}

function getStoredLocalCache(collectionKey, ttl) {
  if (typeof window === "undefined" || !PERSISTENT_CACHE_TABLES.has(collectionKey)) return null;
  try {
    const prefix = getStoragePrefixForCollection(collectionKey);
    const rawTs = localStorage.getItem(`${prefix}cache_ts_${collectionKey}`);
    if (!rawTs) return null;
    const ts = parseInt(rawTs, 10);
    if (Date.now() - ts > ttl) return null;

    const rawData = localStorage.getItem(`${prefix}${collectionKey}`);
    if (!rawData) return null;
    return JSON.parse(rawData);
  } catch {
    return null;
  }
}

function setStoredLocalCache(collectionKey, data) {
  if (typeof window === "undefined" || !PERSISTENT_CACHE_TABLES.has(collectionKey)) return;
  try {
    const prefix = getStoragePrefixForCollection(collectionKey);
    localStorage.setItem(`${prefix}cache_ts_${collectionKey}`, String(Date.now()));
    localStorage.setItem(`${prefix}${collectionKey}`, JSON.stringify(data));
  } catch {}
}

function getCollection(collectionKey, defaultData = []) {
  if (typeof window === "undefined") return defaultData;
  const prefix = getStoragePrefixForCollection(collectionKey);
  const tenantId = getActiveTenantId();
  // Se for uma nova empresa que não seja a Vruum ("a0000000-0000-0000-0000-000000000001"), o defaultData deve ser zerado []
  const effectiveDefault = MULTI_TENANT_COLLECTIONS.has(collectionKey) && tenantId && tenantId !== "a0000000-0000-0000-0000-000000000001"
    ? []
    : defaultData;

  try {
    const raw = localStorage.getItem(prefix + collectionKey);
    if (!raw) {
      localStorage.setItem(prefix + collectionKey, JSON.stringify(effectiveDefault));
      return effectiveDefault;
    }
    return JSON.parse(raw);
  } catch (_e) {
    return effectiveDefault;
  }
}

function setCollection(collectionKey, items) {
  if (typeof window === "undefined") return;
  const prefix = getStoragePrefixForCollection(collectionKey);
  try {
    localStorage.setItem(prefix + collectionKey, JSON.stringify(items));
  } catch (_e) {
    console.error("Failed to save to localStorage", _e);
  }
}

function notifySubscribers(collectionKey, type, data, id) {
  if (typeof window === "undefined") return;
  const detail = { type, data, id };
  const event = new CustomEvent(`db_event_${collectionKey}`, { detail });
  window.dispatchEvent(event);

  if (collectionKey === "banners" || collectionKey === "banner_images") {
    const altKey = collectionKey === "banners" ? "banner_images" : "banners";
    window.dispatchEvent(new CustomEvent(`db_event_${altKey}`, { detail }));
  }

  // Cross-tab broadcast
  if (broadcast) {
    try {
      broadcast.postMessage({ collectionKey, type, data, id });
    } catch {}
  }

  // LocalStorage fallback para sincronização entre abas
  try {
    localStorage.setItem(`${STORAGE_PREFIX}last_sync`, JSON.stringify({ collectionKey, type, data, id, ts: Date.now() }));
  } catch {}
}

function sortItems(items, sortField) {
  if (!sortField) return items;
  const isDesc = sortField.startsWith("-");
  const field = isDesc ? sortField.substring(1) : sortField;
  return [...items].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    if (aVal === bVal) return 0;
    if (aVal === undefined || aVal === null) return 1;
    if (bVal === undefined || bVal === null) return -1;
    if (isDesc) {
      return aVal < bVal ? 1 : -1;
    }
    return aVal > bVal ? 1 : -1;
  });
}

function matchQuery(item, query) {
  if (!query || Object.keys(query).length === 0) return true;
  for (const [key, value] of Object.entries(query)) {
    if (item[key] !== value) return false;
  }
  return true;
}

export function createEntityModel(collectionKey, defaultData = []) {
  const defaultTTL = CACHE_TTL_MAP[collectionKey] || 5 * 1000;
  const projection = TABLE_COLUMNS[collectionKey] || "*";

  return {
    async list(sort = null, limit = null) {
      const cacheKey = getCacheKey(collectionKey, "list", null, sort, limit);
      const cached = memoryCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp < defaultTTL)) {
        return cached.data;
      }

      // Deduplicação de requisições simultâneas em andamento
      if (inFlightPromises.has(cacheKey)) {
        return inFlightPromises.get(cacheKey);
      }

      // Tenta carregar do cache persistente do LocalStorage se for recente
      if (!queryRequiresFreshNetwork(collectionKey)) {
        const localStored = getStoredLocalCache(collectionKey, defaultTTL);
        if (localStored && Array.isArray(localStored)) {
          let items = localStored;
          if (sort) items = sortItems(items, sort);
          if (limit && limit > 0) items = items.slice(0, limit);
          memoryCache.set(cacheKey, { timestamp: now, data: items });
          return items;
        }
      }

      const fetchPromise = (async () => {
        if (isSupabaseConfigured() && supabase) {
          try {
            let q = supabase.from(collectionKey).select(projection);
            const activeTenantId = getActiveTenantId();
            if (MULTI_TENANT_COLLECTIONS.has(collectionKey) && activeTenantId) {
              q = q.eq("tenant_id", activeTenantId);
            }
            if (sort) {
              const isDesc = sort.startsWith("-");
              const field = isDesc ? sort.substring(1) : sort;
              q = q.order(field, { ascending: !isDesc });
            }
            if (limit && limit > 0) q = q.limit(limit);
            let { data, error } = await q;

            // Fallback de compatibilidade caso a tabela não exista (erro SQL)
            if (error && (collectionKey === "banner_images" || collectionKey === "banners")) {
              const altTable = collectionKey === "banner_images" ? "banners" : "banner_images";
              try {
                let altQ = supabase.from(altTable).select(projection);
                if (activeTenantId) {
                  altQ = altQ.eq("tenant_id", activeTenantId);
                }
                if (sort) {
                  const isDesc = sort.startsWith("-");
                  const field = isDesc ? sort.substring(1) : sort;
                  altQ = altQ.order(field, { ascending: !isDesc });
                }
                if (limit && limit > 0) altQ = altQ.limit(limit);
                const altRes = await altQ;
                if (!altRes.error && altRes.data) {
                  data = altRes.data;
                  error = null;
                }
              } catch {}
            }

            if (!error && data !== null && data !== undefined) {
              memoryCache.set(cacheKey, { timestamp: Date.now(), data });
              setStoredLocalCache(collectionKey, data);
              setCollection(collectionKey, data);
              return data;
            }
          } catch (_err) {
            console.warn(`[Supabase] Erro ao listar ${collectionKey}, usando fallback local:`, _err);
          }
        }

        let items = getCollection(collectionKey, defaultData);
        if (sort) items = sortItems(items, sort);
        if (limit && limit > 0) items = items.slice(0, limit);
        memoryCache.set(cacheKey, { timestamp: Date.now(), data: items });
        return items;
      })().finally(() => {
        inFlightPromises.delete(cacheKey);
      });

      inFlightPromises.set(cacheKey, fetchPromise);
      return fetchPromise;
    },

    async filter(query = {}, sort = null, limit = null) {
      const cacheKey = getCacheKey(collectionKey, "filter", query, sort, limit);
      const cached = memoryCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp < defaultTTL)) {
        return cached.data;
      }

      // Deduplicação de requisições simultâneas em andamento
      if (inFlightPromises.has(cacheKey)) {
        return inFlightPromises.get(cacheKey);
      }

      const fetchPromise = (async () => {
        if (isSupabaseConfigured() && supabase) {
          try {
            let q = supabase.from(collectionKey).select(projection);
            const activeTenantId = getActiveTenantId();
            const filterQuery = { ...(query || {}) };
            if (MULTI_TENANT_COLLECTIONS.has(collectionKey) && activeTenantId && !filterQuery.tenant_id) {
              filterQuery.tenant_id = activeTenantId;
            }
            if (Object.keys(filterQuery).length > 0) {
              q = q.match(filterQuery);
            }
            if (sort) {
              const isDesc = sort.startsWith("-");
              const field = isDesc ? sort.substring(1) : sort;
              q = q.order(field, { ascending: !isDesc });
            }
            if (limit && limit > 0) q = q.limit(limit);
            let { data, error } = await q;

            // Fallback de compatibilidade apenas se houver erro SQL na tabela
            if (error && (collectionKey === "banner_images" || collectionKey === "banners")) {
              const altTable = collectionKey === "banner_images" ? "banners" : "banner_images";
              try {
                let altQ = supabase.from(altTable).select(projection);
                if (Object.keys(filterQuery).length > 0) {
                  altQ = altQ.match(filterQuery);
                }
                if (sort) {
                  const isDesc = sort.startsWith("-");
                  const field = isDesc ? sort.substring(1) : sort;
                  altQ = altQ.order(field, { ascending: !isDesc });
                }
                if (limit && limit > 0) altQ = altQ.limit(limit);
                const altRes = await altQ;
                if (!altRes.error && altRes.data) {
                  data = altRes.data;
                  error = null;
                }
              } catch {}
            }

            if (!error && data !== null && data !== undefined) {
              memoryCache.set(cacheKey, { timestamp: Date.now(), data });
              return data;
            }
          } catch (_err) {
            console.warn(`[Supabase] Erro ao filtrar ${collectionKey}, usando fallback local:`, _err);
          }
        }

        let items = getCollection(collectionKey, defaultData);
        items = items.filter((item) => matchQuery(item, query));
        if (sort) items = sortItems(items, sort);
        if (limit && limit > 0) items = items.slice(0, limit);
        memoryCache.set(cacheKey, { timestamp: Date.now(), data: items });
        return items;
      })().finally(() => {
        inFlightPromises.delete(cacheKey);
      });

      inFlightPromises.set(cacheKey, fetchPromise);
      return fetchPromise;
    },

    async get(id) {
      if (isSupabaseConfigured() && supabase) {
        try {
          const { data, error } = await supabase
            .from(collectionKey)
            .select(projection)
            .eq("id", id)
            .maybeSingle();
          if (!error && data) return data;
        } catch (_err) {
          console.warn(`[Supabase] Erro ao buscar ${collectionKey} por id:`, _err);
        }
      }

      const items = getCollection(collectionKey, defaultData);
      return items.find((item) => String(item.id) === String(id)) || null;
    },

    async create(data) {
      invalidateCache(collectionKey);
      let sanitized = data;
      if (collectionKey === "orders") {
        sanitized = sanitizeOrderData(data);
      } else if (collectionKey === "products") {
        sanitized = sanitizeProductData(data);
      }

      const isUuidTable = ["orders", "coupons", "coupon_usages", "users", "user_addresses", "settings", "admin_users"].includes(collectionKey);
      const newId = sanitized.id || (isUuidTable && typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" 
        ? crypto.randomUUID() 
        : `${collectionKey}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);
      
      const activeTenantId = getActiveTenantId();
      const newItem = {
        id: newId,
        created_date: new Date().toISOString(),
        ...(MULTI_TENANT_COLLECTIONS.has(collectionKey) && activeTenantId && !sanitized.tenant_id ? { tenant_id: activeTenantId } : {}),
        ...sanitized,
      };

      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: created, error } = await supabase
            .from(collectionKey)
            .insert([newItem])
            .select("id")
            .single();
          if (!error && created) {
            invalidateCache(collectionKey);
            const items = getCollection(collectionKey, defaultData);
            const updated = [newItem, ...items];
            setCollection(collectionKey, updated);
            setStoredLocalCache(collectionKey, updated);
            notifySubscribers(collectionKey, "create", newItem, newId);
            return { ...newItem, id: created.id || newId };
          }
        } catch (_err) {
          console.warn(`[Supabase] Erro ao criar em ${collectionKey}:`, _err);
        }
      }

      const items = getCollection(collectionKey, defaultData);
      const updated = [newItem, ...items];
      setCollection(collectionKey, updated);
      setStoredLocalCache(collectionKey, updated);
      notifySubscribers(collectionKey, "create", newItem, newId);
      return newItem;
    },

    async update(id, data) {
      invalidateCache(collectionKey);
      let sanitized = data;
      if (collectionKey === "orders") {
        sanitized = sanitizeOrderData(data);
      } else if (collectionKey === "products") {
        sanitized = sanitizeProductData(data);
      }

      if (isSupabaseConfigured() && supabase) {
        try {
          const { data: updated, error } = await supabase
            .from(collectionKey)
            .update(sanitized)
            .eq("id", id)
            .select("id")
            .single();
          if (!error && updated) {
            invalidateCache(collectionKey);
            const items = getCollection(collectionKey, defaultData);
            const updatedItems = items.map((item) => {
              if (String(item.id) === String(id)) {
                return { ...item, ...sanitized };
              }
              return item;
            });
            setCollection(collectionKey, updatedItems);
            setStoredLocalCache(collectionKey, updatedItems);
            notifySubscribers(collectionKey, "update", { id, ...sanitized }, id);
            return { id, ...sanitized };
          }
        } catch (_err) {
          console.warn(`[Supabase] Erro ao atualizar em ${collectionKey}:`, _err);
        }
      }

      const items = getCollection(collectionKey, defaultData);
      let updatedItem = null;
      const updated = items.map((item) => {
        if (String(item.id) === String(id)) {
          updatedItem = { ...item, ...data };
          return updatedItem;
        }
        return item;
      });
      if (updatedItem) {
        setCollection(collectionKey, updated);
        setStoredLocalCache(collectionKey, updated);
        notifySubscribers(collectionKey, "update", updatedItem, id);
      }
      return updatedItem || { id, ...data };
    },

    async delete(id) {
      invalidateCache(collectionKey);
      if (isSupabaseConfigured() && supabase) {
        try {
          const { error } = await supabase.from(collectionKey).delete().eq("id", id);
          if (!error) {
            invalidateCache(collectionKey);
            const items = getCollection(collectionKey, defaultData);
            const updated = items.filter((item) => String(item.id) !== String(id));
            setCollection(collectionKey, updated);
            setStoredLocalCache(collectionKey, updated);
            notifySubscribers(collectionKey, "delete", null, id);
            return { success: true, id };
          }
        } catch (_err) {
          console.warn(`[Supabase] Erro ao deletar em ${collectionKey}:`, _err);
        }
      }

      const items = getCollection(collectionKey, defaultData);
      const updated = items.filter((item) => String(item.id) !== String(id));
      setCollection(collectionKey, updated);
      setStoredLocalCache(collectionKey, updated);
      notifySubscribers(collectionKey, "delete", null, id);
      return { success: true, id };
    },

    subscribe(callback, options = {}) {
      if (typeof window === "undefined") return () => {};

      // Realtime do Supabase somente é aberto quando explicitamente solicitado COM filtro específico
      // Isso impede abertura acidental de canais globais sem filtro de tenant
      const allowSupabaseRealtime = collectionKey === "orders" && Boolean(options?.filter);

      if (allowSupabaseRealtime && isSupabaseConfigured() && supabase) {
        const channelFilter = options?.filter ? { filter: options.filter } : {};
        const channelName = `rt_${collectionKey}_${Math.random().toString(36).substr(2, 6)}`;
        const channel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: collectionKey, ...channelFilter },
            (payload) => {
              invalidateCache(collectionKey);
              const type = payload.eventType === "INSERT" ? "create" : payload.eventType === "UPDATE" ? "update" : "delete";
              callback({ type, data: payload.new || payload.old, id: payload.new?.id || payload.old?.id });
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }

      const handler = (e) => {
        invalidateCache(collectionKey);
        callback(e.detail);
      };
      window.addEventListener(`db_event_${collectionKey}`, handler);
      return () => {
        window.removeEventListener(`db_event_${collectionKey}`, handler);
      };
    },
  };
}

function queryRequiresFreshNetwork(collectionKey) {
  return collectionKey === "orders";
}
