/**
 * Utilitários Oficiais de Data e Fuso Horário (Horário de Brasília - America/Sao_Paulo)
 * Garante que cálculos de abertura de loja, turnos noturnos e impressões de cupom
 * sejam independentes do relógio ou fuso desconfigurado do dispositivo cliente.
 */

export const BRASILIA_TIMEZONE = "America/Sao_Paulo";

/**
 * Retorna os componentes da data/hora atual (ou de uma data específica)
 * projetados no fuso horário oficial de Brasília (America/Sao_Paulo).
 */
export function getBrasiliaParts(dateInput = new Date(), timeZone = BRASILIA_TIMEZONE) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(validDate);
  const partMap = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  let hour = parseInt(partMap.hour, 10);
  if (hour === 24) hour = 0; // Algumas engines normalizam 00:00 como 24:00
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);
  const dayOfWeek = weekdayMap[partMap.weekday] ?? 0;

  const pad = (n) => String(n).padStart(2, "0");

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek, // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
    dateKey: `${year}-${pad(month)}-${pad(day)}`,
    timeKey: `${pad(hour)}:${pad(minute)}`,
    minutesOfDay: hour * 60 + minute,
  };
}

/**
 * Retorna a chave do dia de hoje (YYYY-MM-DD) no fuso oficial de Brasília.
 */
export function getBrasiliaTodayKey(timeZone = BRASILIA_TIMEZONE) {
  return getBrasiliaParts(new Date(), timeZone).dateKey;
}

/**
 * Formata qualquer data (ISO UTC, timestamp ou Date) no fuso de Brasília.
 * Exemplo de saída: "13/10/2026 12:25" ou "13/10/2026 às 12:25"
 */
export function formatInBrasilia(
  dateInput,
  {
    includeTime = true,
    includeSeconds = false,
    separator = " ",
    timeZone = BRASILIA_TIMEZONE,
  } = {}
) {
  if (!dateInput) return "";
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const parts = getBrasiliaParts(d, timeZone);
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;

  if (!includeTime) return dateStr;

  const timeStr = includeSeconds
    ? `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`
    : `${pad(parts.hour)}:${pad(parts.minute)}`;

  return `${dateStr}${separator}${timeStr}`;
}

/**
 * Retorna os dados da data considerando a virada do dia comercial (Business Day Cutoff).
 * Ex: Se o cutoff for "04:00" (4h da manhã), qualquer pedido feito entre 00:00 e 03:59:59
 * é contabilizado como pertencente ao expediente da noite anterior (D - 1 dia).
 * Se o cutoff for "00:00", o dia comercial coincide exatamente com o dia civil.
 *
 * @param {Date|string|number} dateInput
 * @param {string} cutoffTime - Horário no formato "HH:mm", ex: "04:00"
 * @param {string} timeZone
 */
export function getBusinessDayParts(
  dateInput = new Date(),
  cutoffTime = "04:00",
  timeZone = BRASILIA_TIMEZONE
) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const parts = getBrasiliaParts(validDate, timeZone);

  let cutoffMinutes = 240; // 04:00 por padrão
  if (cutoffTime && typeof cutoffTime === "string") {
    const [h, m] = cutoffTime.split(":").map((v) => parseInt(v, 10));
    if (!isNaN(h)) {
      cutoffMinutes = h * 60 + (isNaN(m) ? 0 : m);
    }
  }

  // Se o pedido ocorreu antes do horário de corte da madrugada, retroage 24 horas
  if (cutoffMinutes > 0 && parts.minutesOfDay < cutoffMinutes) {
    const shiftedDate = new Date(validDate.getTime() - 24 * 60 * 60 * 1000);
    const shiftedParts = getBrasiliaParts(shiftedDate, timeZone);
    return {
      ...parts,
      businessDateKey: shiftedParts.dateKey,
      businessDayOfWeek: shiftedParts.dayOfWeek,
      isOvernightShift: true,
      cutoffTime,
    };
  }

  return {
    ...parts,
    businessDateKey: parts.dateKey,
    businessDayOfWeek: parts.dayOfWeek,
    isOvernightShift: false,
    cutoffTime,
  };
}
