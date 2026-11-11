import { getBrasiliaParts, getBrasiliaTodayKey, BRASILIA_TIMEZONE } from "./dateTime";

/**
 * Retorna a chave da data atual no formato YYYY-MM-DD considerando o fuso horário oficial de Brasília
 */
export const getTodayDateKey = (timeZone = BRASILIA_TIMEZONE) => {
  return getBrasiliaTodayKey(timeZone);
};

/**
 * Determina se o restaurante está aberto.
 * Modo 100% MANUAL: O restaurante só abre quando o lojista clica em "Abrir Loja",
 * e só fecha quando o lojista clica em "Fechar Loja".
 * Não há abertura nem fechamento automático por relógio.
 */
export const isStoreOpen = (settings) => {
  if (!settings) return true;

  // Se o lojista marcou explicitamente como fechado (manual_store_open === false), fica fechado.
  if (settings.manual_store_open === false) {
    return false;
  }

  // Se manual_store_open for true (ou se ainda não foi definido, padrão true), fica aberto.
  return true;
};

/**
 * Retorna detalhes do status da loja
 */
export const getStoreStatusInfo = (settings) => {
  const isOpen = isStoreOpen(settings);

  return {
    isOpen,
    isManual: true,
  };
};
