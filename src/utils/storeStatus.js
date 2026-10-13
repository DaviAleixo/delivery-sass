import { getBrasiliaParts, getBrasiliaTodayKey, BRASILIA_TIMEZONE } from "./dateTime";

/**
 * Retorna a chave da data atual no formato YYYY-MM-DD considerando o fuso horário oficial de Brasília
 */
export const getTodayDateKey = (timeZone = BRASILIA_TIMEZONE) => {
  return getBrasiliaTodayKey(timeZone);
};

/**
 * Determina se o restaurante está aberto considerando:
 * 1. Fuso Horário Oficial de Brasília (independente do relógio descalibrado do cliente)
 * 2. Override manual forçado para o dia de hoje (manual_override_date === todayKey && manual_store_open !== null)
 * 3. Tolerância a Turnos Noturnos que cruzam a meia-noite (madrugada de 00:00 até o fechamento da noite anterior)
 * 4. Horários automáticos configurados em open_days ou opening_time / closing_time
 */
export const isStoreOpen = (settings) => {
  if (!settings) return true;

  const timeZone = settings.timezone || BRASILIA_TIMEZONE;
  const nowParts = getBrasiliaParts(new Date(), timeZone);
  const todayKey = nowParts.dateKey;

  // 1. Se houver override manual ativo definido para o dia de hoje em Brasília, respeita a escolha manual
  if (
    settings.manual_override_date === todayKey &&
    settings.manual_store_open !== null &&
    settings.manual_store_open !== undefined
  ) {
    return Boolean(settings.manual_store_open);
  }

  const currentDay = nowParts.dayOfWeek; // 0 = Domingo, 1 = Segunda, ...
  const currentTime = nowParts.minutesOfDay; // minutos desde as 00:00 em Brasília

  // 2. Horários por dia da semana (open_days)
  if (Array.isArray(settings.open_days) && settings.open_days.length > 0) {
    // 2A. Verificação de Madrugada: O expediente do dia anterior ainda está aberto?
    // Ex: Segunda abre 18:00 e fecha 02:00. Na Terça à 01:15, o expediente da Segunda ainda está ativo!
    const prevDay = (currentDay + 6) % 7;
    const prevDayConfig = settings.open_days.find((d) => d.day === prevDay);

    if (
      prevDayConfig &&
      prevDayConfig.enabled &&
      prevDayConfig.opening_time &&
      prevDayConfig.closing_time
    ) {
      const [poh, pom] = prevDayConfig.opening_time.split(":").map(Number);
      const [pch, pcm] = prevDayConfig.closing_time.split(":").map(Number);
      const prevOpen = poh * 60 + pom;
      const prevClose = pch * 60 + pcm;

      // Se o expediente do dia anterior cruzava a meia-noite (fechamento menor que abertura)
      // e o horário atual da madrugada ainda é menor que o horário de fechamento:
      if (prevClose < prevOpen && currentTime < prevClose) {
        return true;
      }
    }

    // 2B. Verificação do expediente iniciado hoje
    const dayConfig = settings.open_days.find((d) => d.day === currentDay);
    if (!dayConfig || !dayConfig.enabled) return false;
    if (!dayConfig.opening_time || !dayConfig.closing_time) return true;

    const [oh, om] = dayConfig.opening_time.split(":").map(Number);
    const [ch, cm] = dayConfig.closing_time.split(":").map(Number);
    const openTime = oh * 60 + om;
    const closeTime = ch * 60 + cm;

    // Se o turno de hoje cruza a meia-noite (ex: abre 18:00 fecha 02:00)
    if (closeTime < openTime) {
      // Aberto se já passou da abertura de hoje (18:00 até 23:59)
      // (a parte da madrugada pós 00:00 é coberta pela regra 2A quando o dia vira)
      return currentTime >= openTime;
    }

    // Turno regular no mesmo dia (ex: 11:00 às 23:00)
    return currentTime >= openTime && currentTime < closeTime;
  }

  // 3. Fallback genérico (opening_time e closing_time globais na loja)
  if (!settings.opening_time || !settings.closing_time) return true;
  const [openHour, openMinute] = settings.opening_time.split(":").map(Number);
  const [closeHour, closeMinute] = settings.closing_time.split(":").map(Number);
  const openTime = openHour * 60 + openMinute;
  const closeTime = closeHour * 60 + closeMinute;

  if (closeTime < openTime) {
    return currentTime >= openTime || currentTime < closeTime;
  }
  return currentTime >= openTime && currentTime < closeTime;
};

/**
 * Retorna detalhes do status da loja
 */
export const getStoreStatusInfo = (settings) => {
  const isOpen = isStoreOpen(settings);
  const timeZone = settings?.timezone || BRASILIA_TIMEZONE;
  const todayKey = getTodayDateKey(timeZone);
  const isManual = Boolean(
    settings &&
    settings.manual_override_date === todayKey &&
    settings.manual_store_open !== null &&
    settings.manual_store_open !== undefined
  );

  return {
    isOpen,
    isManual,
    overrideDate: settings?.manual_override_date,
  };
};
