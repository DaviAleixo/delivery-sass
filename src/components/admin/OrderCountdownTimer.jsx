import React, { useState, useEffect, memo } from "react";
import { Timer, AlertTriangle } from "lucide-react";

/**
 * Extrai os minutos estimados a partir da string de tempo (ex: "40-50 min" -> 50 min)
 */
export function parseEstimatedMinutes(timeStr, orderType = "delivery") {
  if (orderType === "pickup" || orderType === "dine_in") {
    return 25; // Tempo padrão para retirada/mesa: 25 minutos
  }

  if (!timeStr) return 45;
  const numbers = String(timeStr).match(/\d+/g);
  if (numbers && numbers.length > 0) {
    const parsed = numbers.map(Number);
    // Pega o maior número da faixa (ex: "40-50" -> 50)
    return Math.max(...parsed);
  }
  return 45;
}

function OrderCountdownTimerBase({ 
  order, 
  deliveryTimeSetting = "40-50 min", 
  size = "normal" 
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Atualiza a cada 1000ms apenas se o pedido estiver em andamento
    if (!order || !['confirmado', 'preparando', 'enviado'].includes(order.status)) {
      return;
    }

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [order?.status]);

  if (!order || !order.created_date) return null;

  // Apenas exibe cronômetro para pedidos em andamento após saírem de "pendente"
  if (!['confirmado', 'preparando', 'enviado'].includes(order.status)) {
    return null;
  }

  const estimatedMinutes = parseEstimatedMinutes(deliveryTimeSetting, order.order_type);
  const rawDateStr = String(order.created_date || "").trim();
  const isoDateStr = rawDateStr.includes(" ") && !rawDateStr.includes("T") ? rawDateStr.replace(" ", "T") : rawDateStr;
  const createdTime = new Date(isoDateStr).getTime();
  if (isNaN(createdTime)) return null;

  const deadlineTime = createdTime + (estimatedMinutes * 60 * 1000);
  const diffMs = deadlineTime - now;

  const isOverdue = diffMs <= 0;
  const absDiffSec = Math.floor(Math.abs(diffMs) / 1000);
  const minutes = Math.floor(absDiffSec / 60);
  const seconds = absDiffSec % 60;

  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  // Estilos dependendo do tempo restante
  if (isOverdue) {
    return (
      <div className={`inline-flex items-center gap-1.5 font-black rounded-xl border bg-red-600 text-white border-red-700 shadow-md animate-pulse ${
        size === "small" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"
      }`}>
        <AlertTriangle className={size === "small" ? "w-3 h-3" : "w-3.5 h-3.5"} />
        <span>Atrasado +{formattedTime}</span>
      </div>
    );
  }

  // Dentro do prazo
  let badgeStyle = "bg-emerald-50 text-emerald-800 border-emerald-300";
  let pulse = "";
  if (minutes < 5) {
    badgeStyle = "bg-orange-100 text-orange-900 border-orange-400";
    pulse = "animate-pulse";
  } else if (minutes < 15) {
    badgeStyle = "bg-amber-50 text-amber-800 border-amber-300";
  }

  return (
    <div className={`inline-flex items-center gap-1.5 font-bold rounded-xl border shadow-sm ${badgeStyle} ${pulse} ${
      size === "small" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
    }`}>
      <Timer className={size === "small" ? "w-3 h-3 text-current" : "w-3.5 h-3.5 text-current"} />
      <span>Restam {formattedTime} min</span>
    </div>
  );
}

export default memo(OrderCountdownTimerBase);

