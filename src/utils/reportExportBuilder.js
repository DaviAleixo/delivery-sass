/**
 * reportExportBuilder.js
 * 
 * Utilitário puro e modular para compilação, formatação e exportação
 * de relatórios executivos em formatos A4 (PDF vetorial) e Planilhas CSV (Excel).
 */

import { getBrasiliaParts, formatInBrasilia } from "./dateTime";

/**
 * Normaliza e compila os dados dos pedidos conforme o modelo de relatório solicitado.
 */
export function buildReportData({
  orders = [],
  sessions = [],
  reportType = "financial", // "financial" | "orders" | "products"
  dateRange = { start: new Date(), end: new Date() },
  options = {
    includePayments: true,
    includeServiceFee: true,
    includeCancellations: true,
    includeChannels: true,
  },
  tenantSettings = {},
  storeName = "PedeMuleke",
}) {
  const startMs = new Date(dateRange.start).getTime();
  const endMs = new Date(dateRange.end).getTime();

  // Filtra pedidos dentro da janela de datas
  const periodOrders = orders.filter((order) => {
    if (!order.created_date && !order.created_at) return false;
    const t = new Date(order.created_date || order.created_at).getTime();
    return t >= startMs && t <= endMs;
  });

  const validOrders = periodOrders.filter((o) => o.status !== "cancelado");
  const canceledOrders = periodOrders.filter((o) => o.status === "cancelado");

  // Totais globais
  const totalGrossRevenue = validOrders.reduce(
    (sum, o) => sum + (Number(o.total_amount ?? o.total ?? 0) || 0),
    0
  );
  const totalCanceledRevenue = canceledOrders.reduce(
    (sum, o) => sum + (Number(o.total_amount ?? o.total ?? 0) || 0),
    0
  );
  const totalOrdersCount = validOrders.length;
  const canceledOrdersCount = canceledOrders.length;
  const averageTicket = totalOrdersCount > 0 ? totalGrossRevenue / totalOrdersCount : 0;

  // 1. Distribuição de Métodos de Pagamento
  const methodMap = {
    pix: { label: "Pix", count: 0, revenue: 0 },
    cartao_credito: { label: "Cartão de Crédito", count: 0, revenue: 0 },
    cartao_debito: { label: "Cartão de Débito", count: 0, revenue: 0 },
    dinheiro: { label: "Dinheiro", count: 0, revenue: 0 },
    vale_refeicao: { label: "Vale Refeição / Voucher", count: 0, revenue: 0 },
    outros: { label: "Outros / Não Identificado", count: 0, revenue: 0 },
  };

  const normalizeKey = (key) => {
    if (!key) return "outros";
    const k = String(key).toLowerCase().trim();
    if (k.includes("pix") || k === "mercadopago") return "pix";
    if (k.includes("crédito") || k.includes("credito") || k === "credit") return "cartao_credito";
    if (k.includes("débito") || k.includes("debito") || k === "debit") return "cartao_debito";
    if (k.includes("dinheiro") || k === "cash") return "dinheiro";
    if (k.includes("vale") || k.includes("refei") || k.includes("alimenta") || k === "voucher") return "vale_refeicao";
    return "outros";
  };

  validOrders.forEach((o) => {
    const amt = Number(o.total_amount ?? o.total ?? 0) || 0;
    if (amt <= 0) return;

    let detailsPayments = null;
    if (o.payment_details) {
      if (Array.isArray(o.payment_details.payments) && o.payment_details.payments.length > 0) {
        detailsPayments = o.payment_details.payments;
      } else if (Array.isArray(o.payment_details) && o.payment_details.length > 0) {
        detailsPayments = o.payment_details;
      }
    }

    if (detailsPayments && detailsPayments.length > 0) {
      detailsPayments.forEach((p) => {
        const pAmt = Number(p.amount) || 0;
        if (pAmt <= 0) return;
        const norm = normalizeKey(p.method);
        methodMap[norm].revenue += pAmt;
        methodMap[norm].count += 1;
      });
    } else {
      const norm = normalizeKey(o.payment_method);
      methodMap[norm].revenue += amt;
      methodMap[norm].count += 1;
    }
  });

  const paymentMethodsList = Object.entries(methodMap)
    .filter(([_, data]) => data.revenue > 0 || data.count > 0)
    .map(([key, data]) => {
      const percentage = totalGrossRevenue > 0 ? (data.revenue / totalGrossRevenue) * 100 : 0;
      const avg = data.count > 0 ? data.revenue / data.count : 0;
      return {
        id: key,
        label: data.label,
        count: data.count,
        revenue: data.revenue,
        percentage: Number(percentage.toFixed(1)),
        averageTicket: Number(avg.toFixed(2)),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // 2. Canais de Venda (Delivery vs Balcão vs Salão/Mesas)
  const channelMap = {
    delivery: { label: "Delivery", count: 0, revenue: 0 },
    takeaway: { label: "Retirada no Balcão", count: 0, revenue: 0 },
    table: { label: "Consumo no Salão / Mesas", count: 0, revenue: 0 },
  };

  validOrders.forEach((o) => {
    const amt = Number(o.total_amount ?? o.total ?? 0) || 0;
    const isMesa = Boolean(o.table_number || o.table_session_id || o.order_type === "table" || o.order_type === "mesa");
    const isRetirada = Boolean(o.order_type === "takeaway" || o.delivery_type === "takeaway" || o.order_type === "retirada");

    if (isMesa) {
      channelMap.table.revenue += amt;
      channelMap.table.count += 1;
    } else if (isRetirada) {
      channelMap.takeaway.revenue += amt;
      channelMap.takeaway.count += 1;
    } else {
      channelMap.delivery.revenue += amt;
      channelMap.delivery.count += 1;
    }
  });

  const channelsList = Object.entries(channelMap)
    .filter(([_, data]) => data.revenue > 0 || data.count > 0)
    .map(([key, data]) => ({
      id: key,
      label: data.label,
      count: data.count,
      revenue: data.revenue,
      percentage: totalGrossRevenue > 0 ? Number(((data.revenue / totalGrossRevenue) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // 3. Curva ABC de Produtos Mais Vendidos
  const productMap = new Map();
  validOrders.forEach((o) => {
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach((it) => {
      const key = it.product_id || it.product_name || it.name || "Item";
      const name = it.product_name || it.name || "Item";
      const category = it.category_name || it.category || "Geral";
      const qty = Math.max(1, Number(it.quantity || it.qty || 1));
      const unitPrice = Number(it.product_price ?? it.price ?? 0);
      const subtotal = Number(it.subtotal ?? (unitPrice * qty));

      if (productMap.has(key)) {
        const prev = productMap.get(key);
        prev.quantity += qty;
        prev.revenue += subtotal;
      } else {
        productMap.set(key, {
          id: key,
          name,
          category,
          quantity: qty,
          revenue: subtotal,
        });
      }
    });
  });

  const productsList = Array.from(productMap.values())
    .map((p) => ({
      ...p,
      averageUnitPrice: p.quantity > 0 ? p.revenue / p.quantity : 0,
      percentage: totalGrossRevenue > 0 ? Number(((p.revenue / totalGrossRevenue) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // 4. Extrato Individual de Pedidos (Ordenados por Data)
  const ordersDetailedList = validOrders
    .map((o) => {
      const dt = new Date(o.created_date || o.created_at || Date.now());
      const isMesa = Boolean(o.table_number || o.table_session_id);
      const canal = isMesa ? `Mesa ${String(o.table_number || "").replace(/^Mesa\s*/i, "")}` : (o.order_type === "takeaway" ? "Balcão" : "Delivery");
      const orderNum = o.order_number || o.id?.slice(-6) || "—";
      const total = Number(o.total_amount ?? o.total ?? 0);
      const taxa = Number(o.delivery_fee ?? o.service_fee ?? 0);
      const subtotal = Math.max(0, total - taxa);

      return {
        id: o.id,
        orderNumber: String(orderNum),
        dateTimeFormatted: formatInBrasilia(dt, { includeSeconds: false }),
        customerName: o.customer_name || "Cliente Balcão",
        customerPhone: o.customer_phone || "",
        channel: canal,
        paymentMethod: o.payment_method || "Dinheiro",
        subtotal,
        fee: taxa,
        total,
      };
    })
    .sort((a, b) => b.dateTimeFormatted.localeCompare(a.dateTimeFormatted));

  const generatedAtFormatted = formatInBrasilia(new Date(), { includeSeconds: true });
  const periodLabel = `De ${formatInBrasilia(dateRange.start, { includeTime: false })} até ${formatInBrasilia(dateRange.end, { includeTime: false })}`;

  return {
    reportType,
    storeName: tenantSettings?.restaurant_name || storeName || "PedeMuleke",
    cnpj: tenantSettings?.cnpj || tenantSettings?.document || null,
    address: tenantSettings?.address ? `${tenantSettings.address}${tenantSettings.city ? ` - ${tenantSettings.city}` : ""}` : null,
    generatedAtFormatted,
    periodLabel,
    dateRange,
    options,
    summary: {
      totalGrossRevenue,
      totalCanceledRevenue,
      netRevenue: totalGrossRevenue,
      totalOrdersCount,
      canceledOrdersCount,
      averageTicket,
    },
    paymentMethodsList,
    channelsList,
    productsList,
    ordersDetailedList,
  };
}

/**
 * Sanitiza células CSV contra CSV Formula Injection (=, +, -, @, \t, \r) e escapa aspas duplas.
 */
function sanitizeCsvCell(value) {
  let str = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Dispara o download de uma planilha em formato .CSV compatível com Excel brasileiro.
 */
export function exportReportToCSV(reportData, customFilename = null) {
  if (!reportData) return;

  const { storeName, reportType, periodLabel, summary, paymentMethodsList, productsList, ordersDetailedList } = reportData;
  const cleanName = String(storeName || "loja").toLowerCase().replace(/[^a-z0-9]/g, "_");
  const filename = customFilename || `relatorio_${reportType}_${cleanName}_${new Date().toISOString().slice(0, 10)}.csv`;

  const lines = [];

  // Cabeçalho do CSV
  lines.push(sanitizeCsvCell(`${storeName} - Relatório Gerencial`));
  lines.push(sanitizeCsvCell(`Período: ${periodLabel}`));
  lines.push(sanitizeCsvCell(`Data de Emissão: ${reportData.generatedAtFormatted}`));
  lines.push("");

  // Resumo Financeiro
  lines.push('"RESUMO EXECUTIVO"');
  lines.push(`"Faturamento Líquido";${sanitizeCsvCell(`R$ ${summary.totalGrossRevenue.toFixed(2).replace(".", ",")}`)}`);
  lines.push(`"Total de Pedidos";${sanitizeCsvCell(summary.totalOrdersCount)}`);
  lines.push(`"Ticket Médio";${sanitizeCsvCell(`R$ ${summary.averageTicket.toFixed(2).replace(".", ",")}`)}`);
  lines.push(`"Pedidos Cancelados";${sanitizeCsvCell(summary.canceledOrdersCount)}`);
  lines.push(`"Receita Perdida por Cancelamento";${sanitizeCsvCell(`R$ ${summary.totalCanceledRevenue.toFixed(2).replace(".", ",")}`)}`);
  lines.push("");

  if (reportType === "financial" || reportType === "all") {
    lines.push('"DISTRIBUIÇÃO POR MÉTODO DE PAGAMENTO"');
    lines.push('"Canal";"Qtd. Transações";"Faturamento Total (R$)";"% Representatividade";"Ticket Médio (R$)"');
    paymentMethodsList.forEach((m) => {
      lines.push(
        [
          sanitizeCsvCell(m.label),
          sanitizeCsvCell(m.count),
          sanitizeCsvCell(`R$ ${m.revenue.toFixed(2).replace(".", ",")}`),
          sanitizeCsvCell(`${m.percentage}%`),
          sanitizeCsvCell(`R$ ${m.averageTicket.toFixed(2).replace(".", ",")}`),
        ].join(";")
      );
    });
    lines.push("");
  }

  if (reportType === "products" || reportType === "all") {
    lines.push('"CURVA ABC - PRODUTOS MAIS VENDIDOS"');
    lines.push('"Produto";"Categoria";"Qtd. Vendida";"Faturamento (R$)";"% Participação"');
    productsList.forEach((p) => {
      lines.push(
        [
          sanitizeCsvCell(p.name),
          sanitizeCsvCell(p.category),
          sanitizeCsvCell(p.quantity),
          sanitizeCsvCell(`R$ ${p.revenue.toFixed(2).replace(".", ",")}`),
          sanitizeCsvCell(`${p.percentage}%`),
        ].join(";")
      );
    });
    lines.push("");
  }

  if (reportType === "orders" || reportType === "all") {
    lines.push('"EXTRATO OPERACIONAL DE PEDIDOS"');
    lines.push('"Pedido #";"Data / Hora";"Cliente";"Canal";"Forma de Pagamento";"Subtotal (R$)";"Taxa (R$)";"Total Líquido (R$)"');
    ordersDetailedList.forEach((o) => {
      lines.push(
        [
          sanitizeCsvCell(o.orderNumber),
          sanitizeCsvCell(o.dateTimeFormatted),
          sanitizeCsvCell(o.customerName),
          sanitizeCsvCell(o.channel),
          sanitizeCsvCell(o.paymentMethod),
          sanitizeCsvCell(`R$ ${o.subtotal.toFixed(2).replace(".", ",")}`),
          sanitizeCsvCell(`R$ ${o.fee.toFixed(2).replace(".", ",")}`),
          sanitizeCsvCell(`R$ ${o.total.toFixed(2).replace(".", ",")}`),
        ].join(";")
      );
    });
    lines.push("");
  }

  // BOM UTF-8 (\uFEFF) para forçar o Excel a reconhecer caracteres acentuados
  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Dispara a impressão A4 nativa de alta fidelidade vetorial do elemento visualizado.
 */
export function triggerA4Print(elementId = "report-printable-area") {
  const printElement = document.getElementById(elementId);
  if (!printElement) {
    window.print();
    return;
  }

  // Cria iframe isolado invisível para não interferir na tela do app
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Relatório Gerencial</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 10mm 12mm 10mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #1c1917;
          background: #ffffff;
          font-size: 11px;
          line-height: 1.4;
        }
        .page-container {
          width: 100%;
          max-width: 190mm;
          margin: 0 auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          margin-bottom: 14px;
          font-size: 10px;
        }
        th, td {
          padding: 5px 7px;
          border-bottom: 1px solid #e7e5e4;
        }
        th {
          background-color: #f5f5f4 !important;
          color: #44403c;
          text-transform: uppercase;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        tr:nth-child(even) td {
          background-color: #fafaf9 !important;
        }
        .font-mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }
        .avoid-break { page-break-inside: avoid; }
      </style>
    </head>
    <body>
      <div class="page-container">
        ${printElement.innerHTML}
      </div>
    </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1500);
  }, 400);
}

