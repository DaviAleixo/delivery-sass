/**
 * Serviço de Busca de Bairros Oficiais por Cidade (OpenStreetMap / Overpass)
 * Gratuito, sem dependência de chaves de API, com cache local no navegador.
 */

const CACHE_PREFIX = "delivery_nh_cache_";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

// Lista oficial curada para cidades principais (retorno instantâneo em 0ms sem falha de rede/Overpass)
const KNOWN_CITY_NEIGHBORHOODS = {
  "conselheiro lafaiete": [
    "Albertina", "Albinópolis", "Amigo", "Angélica", "Antônio Severino", "Arcádia", 
    "Barreira", "Bela Vista", "Belavinha", "Buena Vista", "Cachoeira", "Campo Alegre", 
    "Carijós", "Centro", "Chapada", "Cidade Satélite", "Copacabana", "Distrito Industrial", 
    "Dom Silvério", "Fonte Grande", "Gagé", "Granja das Hortênsias", "Jardim Alvorada", 
    "Jardim América", "Jardim Cachoeira", "Jardim do Sol", "Jardim Europa", "Morro da Mina", 
    "Morro Vermelho", "Novo Horizonte", "Oscar Correia", "Padre Pedro", "Paulo VI", 
    "Progresso", "Queluz", "Real de Queluz", "Recanto dos Colibris", "Residencial Aroeiras", 
    "Residencial Dom Silvério", "Residencial Granja das Hortênsias", "Residencial Topázio", 
    "Sagrado Coração de Jesus", "Santa Cecília", "Santa Cruz", "Santa Efigênia", 
    "Santa Luzia", "Santa Maria", "Santa Matilde", "Santa Rosa", "Santa Terezinha", 
    "Santo Agostinho", "Santo Antônio", "São Benedito", "São Dimas", "São Geraldo", 
    "São Gonçalo", "São João", "São José", "São Judas Tadeu", "São Lucas", "São Marcos", 
    "São Sebastião", "Siderúrgico", "Sion", "Triângulo", "União", "Vila Imperial", 
    "Vila Resende", "Vista Alegre"
  ],
  "congonhas": [
    "Alvorada", "Basílica", "Boa Vista", "Campinho", "Centro", "Dom Oscar", "Eldorado", 
    "Grand Park", "Ideal", "Jardim Profeta", "Lamartine", "Lobo Leite", "Matriz", 
    "Nova Cidade", "Novo Cruzeiro", "Pascoal Vartuli", "Praia", "Primavera", 
    "Pires", "Residencial Gualter", "Rosário", "Santa Mônica", "São Gonçalo", "Vila Andréas", "Vila São Vicente"
  ],
  "ouro branco": [
    "Amália Rodrigues", "Belvedere", "Centro", "Coqueiros", "Inconfidentes", "Luzia Augusta", 
    "Nossa Senhora da Conceição", "Novo Horizonte", "Pioneiros", "Primeiro de Maio", 
    "Residencial Vale do Sol", "São Francisco", "Siderurgia", "Soledade", "Tiradentes", "Vale do Sol"
  ]
};

export async function fetchCityNeighborhoods(cityName, stateUf = "MG") {
  if (!cityName || !cityName.trim()) {
    return { success: false, neighborhoods: [], error: "Nome da cidade não informado." };
  }

  const cleanCity = cityName.trim();
  const normalizedKey = cleanCity.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Verificar catálogo oficial embutido para retorno imediato (0ms, 100% offline-ready)
  if (KNOWN_CITY_NEIGHBORHOODS[normalizedKey]) {
    const list = KNOWN_CITY_NEIGHBORHOODS[normalizedKey];
    return {
      success: true,
      neighborhoods: list,
      count: list.length,
      city: cleanCity,
      fromKnownCatalog: true
    };
  }

  const cacheKey = `${CACHE_PREFIX}${cleanCity.toLowerCase()}_${(stateUf || "").toLowerCase()}`;

  // 2. Tentar ler do Cache Local
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
