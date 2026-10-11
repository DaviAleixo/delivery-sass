/**
 * Utilitários de Máscara e Formatação de Moeda Brasileira (R$ Real)
 */

/**
 * Converte qualquer valor (number, string formatada com R$, ponto ou vírgula) em número float
 * Ex: "R$ 1.250,50" -> 1250.5
 * Ex: "15,00" -> 15
 * Ex: 32.9 -> 32.9
 */
export function parseBRLToNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;

  const str = String(value).trim();
  // Se contiver R$ ou vírgula decimal brasileira
  if (str.includes(",") || str.includes("R$")) {
    const digits = str.replace(/\D/g, "");
    if (!digits) return 0;
    return parseInt(digits, 10) / 100;
  }

  // Caso seja string numérica pura (ex: "15.50" ou "15")
  const num = parseFloat(str.replace(/\s/g, ""));
  return isNaN(num) ? 0 : num;
}

/**
 * Formata um valor vindo do banco/estado (número ou string) para BRL
 * Ex: 15 -> "R$ 15,00"
 * Ex: "15.50" -> "R$ 15,50"
 */
export function formatToBRL(value, withPrefix = true) {
  if (value === null || value === undefined || value === "") return "";
  
  if (typeof value === "number") {
    const formatted = value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return withPrefix ? `R$ ${formatted}` : formatted;
  }

  const str = String(value).trim();
  if (str.startsWith("R$")) return withPrefix ? str : str.replace("R$", "").trim();

  const clean = str.replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(clean);
  if (!isNaN(num)) {
    const formatted = num.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return withPrefix ? `R$ ${formatted}` : formatted;
  }

  return str;
}

/**
 * Aplica máscara de moeda dinâmica durante a digitação (centavos da direita para esquerda)
 * Ex: digita 1 -> "R$ 0,01"
 * Ex: digita 1500 -> "R$ 15,00"
 */
export function maskBRLInput(rawValue, withPrefix = true) {
  if (!rawValue && rawValue !== 0) return "";
  const digits = String(rawValue).replace(/\D/g, "");
  if (!digits) return "";

  const num = parseInt(digits, 10) / 100;
  const formatted = num.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return withPrefix ? `R$ ${formatted}` : formatted;
}
