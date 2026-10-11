/**
 * Utilitário de Normalização e Correspondência Inteligente de Bairros (Fuzzy & Levenshtein)
 * Usado para cálculo confiável de taxa de entrega por bairro com tolerância a erros de digitação e abreviações.
 */

/**
 * Remove acentos, pontuação, padroniza minúsculas e expande abreviações comuns no Brasil
 */
export const normalizeNeighborhoodName = (text = "") => {
  if (!text || typeof text !== "string") return "";

  let norm = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^\w\s]/g, " ")       // Remove pontuações e traços
    .replace(/\s+/g, " ");          // Remove espaços extras

  // Expansão de abreviações comuns de bairros brasileiros
  const abbrevMap = [
    { regex: /\bjd\b/g, replace: "jardim" },
    { regex: /\bvl\b/g, replace: "vila" },
    { regex: /\bpq\b/g, replace: "parque" },
    { regex: /\bsto\b/g, replace: "santo" },
    { regex: /\bsta\b/g, replace: "santa" },
    { regex: /\bconj\b/g, replace: "conjunto" },
    { regex: /\bhab\b/g, replace: "habitacional" },
    { regex: /\bres\b/g, replace: "residencial" },
    { regex: /\bdist\b/g, replace: "distrito" },
    { regex: /\bset\b/g, replace: "setor" },
    { regex: /\bcentro\b/g, replace: "centro" },
  ];

  for (const item of abbrevMap) {
    norm = norm.replace(item.regex, item.replace);
  }

  return norm.trim();
};

/**
 * Normalização fonética simples para português (trata Z/S, C/S, CH/X, etc.)
 */
export const phoneticTransform = (text = "") => {
  let p = normalizeNeighborhoodName(text);
  p = p
    .replace(/ph/g, "f")
    .replace(/ch/g, "x")
    .replace(/k/g, "c")
    .replace(/y/g, "i")
    .replace(/w/g, "v")
    .replace(/z/g, "s")
    .replace(/([a-z])\1+/g, "$1"); // remove letras dobradas (ex: "nn" -> "n")
  return p;
};

/**
 * Distância de Levenshtein (número de edições/inserções/remoções)
 */
export const levenshteinDistance = (a = "", b = "") => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const matrix = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) matrix[i][0] = i;
  for (let j = 0; j <= n; j++) matrix[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deleção
        matrix[i][j - 1] + 1,       // inserção
        matrix[i - 1][j - 1] + cost // substituição
      );
    }
  }

  return matrix[m][n];
};

/**
 * Similaridade entre duas strings de 0 a 1 (1 = 100% igual)
 */
export const calculateSimilarity = (a = "", b = "") => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / maxLen;
};

/**
 * Busca o bairro correspondente na lista do restaurante
 * @param {string} customerNeighborhood - Bairro informado pelo cliente ou retornado pelo ViaCEP
 * @param {Array} registeredNeighborhoods - Lista de bairros cadastrados pelo restaurante
 * @returns {Object|null} Objeto com dados do bairro e da taxa, ou null se não atendido
 */
export const matchNeighborhood = (customerNeighborhood, registeredNeighborhoods = []) => {
  if (!customerNeighborhood || !Array.isArray(registeredNeighborhoods) || registeredNeighborhoods.length === 0) {
    return null;
  }

  const cleanCustomer = normalizeNeighborhoodName(customerNeighborhood);
  const phoneticCustomer = phoneticTransform(customerNeighborhood);

  if (!cleanCustomer) return null;

  // Filtra apenas bairros ativos
  const activeNeighborhoods = registeredNeighborhoods.filter(item => item && (item.active !== false));

  // 1. Passada: Match exato normalizado
  for (const item of activeNeighborhoods) {
    const cleanItem = normalizeNeighborhoodName(item.name);
    if (cleanCustomer === cleanItem) {
      return {
        matched: true,
        matchType: "exact",
        neighborhood: item,
        fee: Number(item.fee || 0),
        timeEstimate: item.time_estimate || null
      };
    }
  }

  // 2. Passada: Substring / Inclusão (ex: "Jardim América - Setor 1" contém "Jardim América")
  for (const item of activeNeighborhoods) {
    const cleanItem = normalizeNeighborhoodName(item.name);
    if (cleanItem.length >= 4 && (cleanCustomer.includes(cleanItem) || cleanItem.includes(cleanCustomer))) {
      return {
        matched: true,
        matchType: "contains",
        neighborhood: item,
        fee: Number(item.fee || 0),
        timeEstimate: item.time_estimate || null
      };
    }
  }

  // 3. Passada: Fonética idêntica (ex: "Santa Teresa" vs "Santa Tereza")
  for (const item of activeNeighborhoods) {
    const phoneticItem = phoneticTransform(item.name);
    if (phoneticCustomer === phoneticItem) {
      return {
        matched: true,
        matchType: "phonetic",
        neighborhood: item,
        fee: Number(item.fee || 0),
        timeEstimate: item.time_estimate || null
      };
    }
  }

  // 4. Passada: Distância de Levenshtein (tolerância de até 2 letras ou similaridade >= 80%)
  let bestMatch = null;
  let highestSimilarity = 0;

  for (const item of activeNeighborhoods) {
    const cleanItem = normalizeNeighborhoodName(item.name);
    const dist = levenshteinDistance(cleanCustomer, cleanItem);
    const sim = calculateSimilarity(cleanCustomer, cleanItem);

    // Aceita se distância for de no máximo 2 letras (para nomes com mais de 4 letras) ou similaridade >= 80%
    if ((dist <= 2 && cleanItem.length >= 4) || sim >= 0.80) {
      if (sim > highestSimilarity) {
        highestSimilarity = sim;
        bestMatch = {
          matched: true,
          matchType: "fuzzy",
          similarity: sim,
          distance: dist,
          neighborhood: item,
          fee: Number(item.fee || 0),
          timeEstimate: item.time_estimate || null
        };
      }
    }
  }

  return bestMatch;
};

/**
 * Normaliza o nome da cidade para comparação segura
 */
export const normalizeCityName = (city = "") => {
  if (!city || typeof city !== "string") return "";
  return city
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^\w\s]/g, " ")       // Remove pontuações
    .replace(/\s+/g, " ")          // Remove espaços extras
    .trim();
};

/**
 * Verifica se a cidade do cliente é atendida pela loja
 * @param {string} customerCity - Cidade informada pelo cliente ou ViaCEP
 * @param {string} storeCity - Cidade cadastrada da loja
 * @param {Array} allowedCities - Cidades adicionais permitidas (opcional)
 */
export const isCityAllowed = (customerCity, storeCity, allowedCities = []) => {
  if (!storeCity || !storeCity.trim()) return true; // Se loja não tem cidade, não bloqueia
  if (!customerCity || !customerCity.trim()) return true; // Se cliente ainda não preencheu cidade, não bloqueia prematuramente

  const normCustomer = normalizeCityName(customerCity);
  const normStore = normalizeCityName(storeCity);

  if (normCustomer === normStore) return true;

  if (Array.isArray(allowedCities)) {
    for (const city of allowedCities) {
      if (normalizeCityName(city) === normCustomer) return true;
    }
  }

  return false;
};
