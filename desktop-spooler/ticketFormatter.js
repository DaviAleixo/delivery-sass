/**
 * Formatador de Comanda Térmica em Texto Puro para Impressoras Térmicas (80mm / 58mm)
 * Otimizado para máxima legibilidade, alinhamento milimétrico e compatibilidade universal
 * com qualquer impressora térmica (Epson, Elgin, Bematech, Daruma, POS-58, POS-80, Xprinter).
 */

function formatMoney(val) {
  const num = Number(val);
  return isNaN(num) ? "0,00" : num.toFixed(2).replace(".", ",");
}

/**
 * Remove acentos e caracteres especiais para garantir 100% de compatibilidade
 * com qualquer firmware de impressora térmica (evita caracteres corrompidos).
 */
export function cleanText(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentuação mantendo letras base (Á -> A, ç -> c)
    .replace(/[^\x20-\x7E\r\n\t]/g, "") // remove emojis e caracteres não-ASCII
    .trim();
}

function padLine(left, right, width = 42) {
  const l = String(left || "");
  const r = String(right || "");
  const space = Math.max(1, width - l.length - r.length);
  return l + " ".repeat(space) + r;
}

function centerText(text, width = 42) {
  const str = String(text || "").trim();
  if (str.length >= width) return str.slice(0, width);
  const leftPad = Math.floor((width - str.length) / 2);
  return " ".repeat(leftPad) + str;
}

function divider(char = "-", width = 42) {
  return char.repeat(width);
}

/**
 * Quebra textos longos (endereço, observações, adicionais) respeitando as palavras.
 */
function wordWrap(text, maxWidth) {
  if (!text) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const result = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += " " + word;
    } else {
      result.push(current);
      current = word;
    }
  }
  if (current) {
    result.push(current);
  }
  return result;
}

/**
 * Formata a linha de um item do pedido, garantindo que o preço fique à direita
 * e o nome do item quebre elegantemente sem desalinhar o cupom.
 */
function formatItemLines(qty, name, priceStr, width) {
  const prefix = `${qty}x `;
  const price = priceStr;
  const maxFirstNameWidth = width - price.length - 1;

  const fullLine = `${prefix}${name}`;
  if (fullLine.length + 1 + price.length <= width) {
    const space = width - fullLine.length - price.length;
    return [`${fullLine}${" ".repeat(space)}${price}`];
  }

  // Nome longo: quebra em palavras
  const availableWidth = maxFirstNameWidth - prefix.length;
  const words = name.split(/\s+/).filter(Boolean);
  let firstLineName = "";
  let remainingWords = [];

  for (let i = 0; i < words.length; i++) {
    const test = firstLineName ? `${firstLineName} ${words[i]}` : words[i];
    if (test.length <= availableWidth) {
      firstLineName = test;
    } else {
      remainingWords = words.slice(i);
      break;
    }
  }

  const lines = [];
  if (firstLineName) {
    const left = `${prefix}${firstLineName}`;
    const space = Math.max(1, width - left.length - price.length);
    lines.push(`${left}${" ".repeat(space)}${price}`);
  } else {
    lines.push(padLine(prefix, price, width));
    remainingWords = words;
  }

  if (remainingWords.length > 0) {
    const restText = remainingWords.join(" ");
    const wrapped = wordWrap(restText, width - 4);
    wrapped.forEach((w) => lines.push(`    ${w}`));
  }

  return lines;
}

export function formatOrderToThermalText(order, options = {}) {
  const width = options.paperWidth === "58mm" ? 32 : 42;
  const lines = [];

  const rawStoreName = options.storeName || order.restaurant_name || "PEDEMULEKE DELIVERY";
  const storeName = cleanText(rawStoreName);
  const orderId = String(order.id || "").slice(-6).toUpperCase();
  const orderType = order.order_type || (order.table_number ? "dine_in" : "delivery");

  // Cabeçalho da Loja
  lines.push(divider("=", width));
  lines.push(centerText(storeName.toUpperCase(), width));
  lines.push(centerText("SISTEMA PEDEMULEKE", width));
  lines.push(divider("=", width));
  lines.push("");

  // Número do Pedido e Identificação
  lines.push(centerText(`>>> PEDIDO #${orderId} <<<`, width));
  
  let channelBadge = "DELIVERY - ENTREGA";
  if (orderType === "takeaway" || orderType === "pickup" || orderType === "balcao") {
    channelBadge = "RETIRADA NO BALCAO";
  }
  if (orderType === "dine_in" || order.table_number) {
    const tableStr = order.table_number 
      ? (String(order.table_number).toLowerCase().includes("mesa") ? order.table_number : `MESA ${order.table_number}`) 
      : "MESA SALAO";
    channelBadge = `CONSUMO NO SALAO: ${tableStr.toUpperCase()}`;
  }
  lines.push(centerText(`[ ${channelBadge} ]`, width));

  const dataHora = order.created_date 
    ? new Date(order.created_date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) 
    : new Date().toLocaleString("pt-BR");
  lines.push(padLine("Horario:", dataHora, width));
  lines.push(divider("-", width));

  // Dados do Cliente ou Mesa
  if (orderType === "dine_in" || order.table_number) {
    lines.push("DADOS DA MESA:");
    lines.push(`Mesa: ${cleanText(order.table_number || "Salao")}`);
    if (order.customer_name) {
      lines.push(`Identificacao: ${cleanText(order.customer_name)}`);
    }
  } else {
    lines.push(`CLIENTE: ${cleanText(order.customer_name || "Nao informado")}`);
    if (order.customer_phone) {
      lines.push(`WhatsApp/Tel: ${cleanText(order.customer_phone)}`);
    }

    if (orderType === "delivery") {
      lines.push("");
      lines.push("ENDERECO DE ENTREGA:");
      const rawAddr = order.customer_address || order.delivery_address || "";
      const wrappedAddr = wordWrap(cleanText(rawAddr), width);
      wrappedAddr.forEach((a) => lines.push(a));

      if (order.customer_complement) {
        const wrappedCompl = wordWrap(`Compl: ${cleanText(order.customer_complement)}`, width);
        wrappedCompl.forEach((c) => lines.push(c));
      }
      if (order.customer_reference) {
        const wrappedRef = wordWrap(`Ref: ${cleanText(order.customer_reference)}`, width);
        wrappedRef.forEach((r) => lines.push(r));
      }
      if (order.customer_neighborhood) {
        lines.push(`Bairro: ${cleanText(order.customer_neighborhood)}`);
      }
    } else {
      lines.push("MODALIDADE: Retirada pelo cliente na loja");
    }
  }

  lines.push(divider("=", width));
  lines.push(padLine("QTD ITEM", "VALOR", width));
  lines.push(divider("-", width));

  // Itens do Pedido
  let items = [];
  try {
    items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || "[]");
  } catch (_e) {
    items = [];
  }

  items.forEach((item) => {
    const qty = item.quantity || 1;
    const name = cleanText(item.product_name || item.name || "Item sem nome");
    const itemTotal = (item.total_price || ((item.price || 0) * qty));
    const priceStr = `R$ ${formatMoney(itemTotal)}`;

    const formattedLines = formatItemLines(qty, name, priceStr, width);
    formattedLines.forEach((l) => lines.push(l));

    // Sabores Fracionados da Pizza (ex: [1/2] Calabresa, [1/2] 4 Queijos)
    const pizzaFlavors = item.pizza_flavors || [];
    if (Array.isArray(pizzaFlavors) && pizzaFlavors.length > 0) {
      pizzaFlavors.forEach((f) => {
        const frac = f.fraction || "1/2";
        const fName = cleanText(f.name || "");
        lines.push(`  [${frac}] ${fName}`);
        if (Array.isArray(f.additionals) && f.additionals.length > 0) {
          f.additionals.forEach((fAdd) => {
            const addName = cleanText(fAdd.name || "");
            const addPrice = Number(fAdd.price || 0);
            const addPriceStr = addPrice > 0 ? ` (+R$ ${formatMoney(addPrice)})` : "";
            lines.push(`     + ${addName}${addPriceStr}`);
          });
        }
        if (f.notes) {
          lines.push(`     Obs: ${cleanText(f.notes)}`);
        }
      });
    }

    // Adicionais / Complementos
    const adds = item.additionals || item.complements || [];
    if (Array.isArray(adds) && adds.length > 0) {
      adds.forEach((add) => {
        const addName = cleanText(add.name || add.additional_name || "");
        const addPrice = Number(add.price || 0);
        const addPriceStr = addPrice > 0 ? ` (+R$ ${formatMoney(addPrice)})` : "";
        const fullAdd = ` + ${addName}${addPriceStr}`;
        const wrappedAdd = wordWrap(fullAdd, width - 2);
        wrappedAdd.forEach((wa) => lines.push(`  ${wa}`));
      });
    }

    // Observações do Item
    const note = item.notes || item.observation;
    if (note) {
      const wrappedNote = wordWrap(`OBS: ${cleanText(note)}`, width - 2);
      wrappedNote.forEach((wn) => lines.push(`  ${wn}`));
    }
  });

  lines.push(divider("-", width));

  // Observações Gerais da Cozinha
  if (order.notes) {
    lines.push("OBSERVACOES GERAIS:");
    const wrappedGeneralNotes = wordWrap(`"${cleanText(order.notes)}"`, width);
    wrappedGeneralNotes.forEach((gn) => lines.push(gn));
    lines.push(divider("-", width));
  }

  // Totais Financeiros
  const subtotal = Number(order.subtotal || order.subtotal_amount || 0);
  const deliveryFee = Number(order.delivery_fee || 0);
  const discount = Number(order.discount_value || order.discount || 0);
  const total = Number(order.total_amount || order.total || 0);

  if (subtotal > 0 && (deliveryFee > 0 || discount > 0)) {
    lines.push(padLine("Subtotal Itens:", `R$ ${formatMoney(subtotal)}`, width));
  }
  if (deliveryFee > 0) {
    lines.push(padLine("Taxa de Entrega:", `R$ ${formatMoney(deliveryFee)}`, width));
  }
  if (discount > 0) {
    lines.push(padLine("Desconto (Cupom):", `- R$ ${formatMoney(discount)}`, width));
  }

  lines.push(divider("=", width));
  lines.push(padLine("TOTAL:", `R$ ${formatMoney(total)}`, width));
  lines.push(divider("=", width));

  // Forma de Pagamento
  let paymentMethod = cleanText(order.payment_method || "Nao informada").toUpperCase();
  if (orderType === "dine_in" || order.table_number) {
    paymentMethod = "PAGAR NO CAIXA AO FINALIZAR";
  } else if (paymentMethod.includes("ONLINE") || order.payment_status === "paid") {
    paymentMethod = "PIX ONLINE (JA PAGO)";
  } else if (paymentMethod.includes("DINHEIRO") && order.change_for) {
    paymentMethod = `DINHEIRO (Troco p/ R$ ${formatMoney(order.change_for)})`;
  }

  lines.push("FORMA DE PAGAMENTO:");
  const wrappedPayment = wordWrap(`>> ${paymentMethod} <<`, width);
  wrappedPayment.forEach((p) => lines.push(p));
  lines.push(divider("-", width));

  // Rodapé e avanço de papel para guilhotina não cortar o texto
  lines.push("");
  lines.push(centerText("Obrigado pela preferencia!", width));
  lines.push(centerText("www.pedemuleke.com", width));
  lines.push("");
  lines.push("");
  lines.push("");
  lines.push(""); // 4 linhas vazias garantem avanço físico além da lâmina

  return lines.join("\r\n");
}
