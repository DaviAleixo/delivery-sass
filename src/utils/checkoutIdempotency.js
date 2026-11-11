const STORAGE_PREFIX = "pm_checkout_idem_";
const CHECKOUT_KEY_TTL_MS = 2 * 60 * 60 * 1000;

function generateUuidV4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `ord_cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function buildCartFingerprint(cart = []) {
  if (!Array.isArray(cart) || cart.length === 0) return "empty";
  const normalized = cart.map((item) => ({
    id: String(item.id || item.product_id || ""),
    q: Number(item.quantity || 1),
    s: String(item.size_id || item.pizza_size_id || ""),
    n: String(item.notes || ""),
    a: Array.isArray(item.additionals)
      ? item.additionals
          .map((add) => `${String(add.id || add.name || "")}:${Number(add.quantity || 1)}`)
          .sort()
      : [],
  }));
  return JSON.stringify(normalized);
}

function getStorageKey(tenantId) {
  return `${STORAGE_PREFIX}${tenantId || "default"}`;
}

export function getOrCreateCheckoutOrderId(tenantId, cart = []) {
  const fingerprint = buildCartFingerprint(cart);
  const key = getStorageKey(tenantId);

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ageMs = Date.now() - Number(parsed?.createdAt || 0);
        if (
          parsed?.orderId &&
          parsed?.fingerprint === fingerprint &&
          ageMs >= 0 &&
          ageMs < CHECKOUT_KEY_TTL_MS
        ) {
          return parsed.orderId;
        }
      }

      const freshOrderId = generateUuidV4();
      window.sessionStorage.setItem(
        key,
        JSON.stringify({
          orderId: freshOrderId,
          fingerprint,
          createdAt: Date.now(),
        })
      );
      return freshOrderId;
    }
  } catch {
    // Fallback gracefully in restricted environments
  }

  return generateUuidV4();
}

export function clearCheckoutIdempotencyKey(tenantId) {
  const key = getStorageKey(tenantId);
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
}

