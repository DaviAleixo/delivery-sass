/**
 * Serviço de Busca de Bairros Oficiais por Cidade (OpenStreetMap / Overpass)
 * Gratuito, sem dependência de chaves de API, com cache local no navegador.
 */

const CACHE_PREFIX = "delivery_nh_cache_";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

export async function fetchCityNeighborhoods(cityName, stateUf = "MG") {
  if (!cityName || !cityName.trim()) {
    return { success: false, neighborhoods: [], error: "Nome da cidade não informado." };
  }

  const cleanCity = cityName.trim();
  const cacheKey = `${CACHE_PREFIX}${cleanCity.toLowerCase()}_${(stateUf || "").toLowerCase()}`;

  // 1. Tentar ler do Cache Local
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL_MS && Array.isArray(parsed.neighborhoods) && parsed.neighborhoods.length > 0) {
        return {
          success: true,
          neighborhoods: parsed.neighborhoods,
          count: parsed.neighborhoods.length,
          city: cleanCity,
          fromCache: true
        };
      }
    }
  } catch (_e) {
    // LocalStorage indisponível ou erro de parse
  }

  // 2. Consulta Overpass API
  try {
    const query = `[out:json][timeout:20];
area["name"="${cleanCity}"]->.searchArea;
(
  node["place"~"suburb|neighbourhood|quarter"](area.searchArea);
  way["place"~"suburb|neighbourhood|quarter"](area.searchArea);
  relation["place"~"suburb|neighbourhood|quarter"](area.searchArea);
);
out tags;`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "User-Agent": "DeliveryApp/1.0 (delivery@app.local)",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "data=" + encodeURIComponent(query),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.elements)) {
        const uniqueNames = new Set();
        data.elements.forEach(el => {
          const name = el.tags?.name?.trim();
          if (name && name.length >= 2 && !name.toLowerCase().includes("loteamento sem nome")) {
            uniqueNames.add(name);
          }
        });

        const list = Array.from(uniqueNames).sort((a, b) => a.localeCompare(b, "pt-BR"));
        if (list.length > 0) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              timestamp: Date.now(),
              neighborhoods: list
            }));
          } catch {}

          return {
            success: true,
            neighborhoods: list,
            count: list.length,
            city: cleanCity
          };
        }
      }
    }
  } catch (overpassErr) {
    console.warn("Overpass API falhou ou timeout, tentando fallback Nominatim:", overpassErr.message);
  }

  // 3. Fallback: Nominatim OpenStreetMap Search
  try {
    const q = `bairros ${cleanCity} ${stateUf || ""}`.trim();
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=50`;
    
    const nomRes = await fetch(nomUrl, {
      headers: { "User-Agent": "DeliveryApp/1.0" }
    });
    
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      const uniqueNames = new Set();
      (nomData || []).forEach(item => {
        const addr = item.address || {};
        const nh = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district;
        if (nh && nh.trim()) {
          uniqueNames.add(nh.trim());
        }
      });

      const list = Array.from(uniqueNames).sort((a, b) => a.localeCompare(b, "pt-BR"));
      if (list.length > 0) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            neighborhoods: list
          }));
        } catch {}

        return {
          success: true,
          neighborhoods: list,
          count: list.length,
          city: cleanCity
        };
      }
    }
  } catch (nomErr) {
    console.warn("Nominatim fallback falhou:", nomErr);
  }

  return {
    success: false,
    neighborhoods: [],
    city: cleanCity,
    error: `Nenhum bairro encontrado automaticamente para "${cleanCity}". Você pode adicionar manualmente os bairros atendidos.`
  };
}
