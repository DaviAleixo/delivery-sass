import React from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Printer,
  FileSpreadsheet,
  X,
  FileText,
  Building2,
} from "lucide-react";
import { triggerA4Print, exportReportToCSV } from "@/utils/reportExportBuilder";

export default function ReportDocumentPreviewModal({
  isOpen,
  onClose,
  reportData,
}) {
  if (!reportData) return null;

  const {
    storeName,
    cnpj,
    address,
    periodLabel,
    generatedAtFormatted,
    reportType,
    summary,
    paymentMethodsList = [],
    channelsList = [],
    productsList = [],
    ordersDetailedList = [],
  } = reportData;

  const formatMoney = (val) =>
    `R$ ${Number(val || 0).toFixed(2).replace(".", ",")}`;

  const getReportTitle = () => {
    if (reportType === "financial") return "BALANÇO FINANCEIRO & CONTÁBIL DE FATURAMENTO";
    if (reportType === "orders") return "EXTRATO OPERACIONAL DE PEDIDOS CONSOLIDADOS";
    if (reportType === "products") return "CURVA ABC DE VENDAS & RANKING DE PRODUTOS";
    return "RELATÓRIO GERENCIAL CONSOLIDADO";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[92vh] flex flex-col p-0 overflow-hidden bg-stone-100 rounded-2xl border border-stone-300 shadow-2xl">
        {/* Barra de Ações Superior do Modal (Estilo Toolbar Executiva) */}
        <div className="bg-stone-900 text-white px-5 py-3 flex items-center justify-between border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center text-emerald-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white tracking-wide">
                Pré-visualização do Relatório Oficial (A4)
              </p>
              <p className="text-[10px] text-stone-400">
                Revise os números tabulados antes de imprimir ou salvar como PDF
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => exportReportToCSV(reportData)}
              variant="outline"
              className="h-8 px-3 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700 rounded-lg gap-1.5 cursor-pointer shadow-2xs"
              title="Baixar planilha compatível com Microsoft Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Exportar Excel (.CSV)</span>
            </Button>

            <Button
              type="button"
              onClick={() => triggerA4Print("report-printable-area")}
              className="h-8 px-3.5 text-xs font-bold bg-[#047857] hover:bg-[#036348] text-white rounded-lg gap-1.5 cursor-pointer shadow-xs"
              title="Gera PDF vetorial com 1 clique"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Salvar PDF</span>
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition-colors ml-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Área de Visualização da Folha A4 com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center bg-stone-200/60">
          {/* Folha A4 Virtual */}
          <div
            id="report-printable-area"
            className="w-full max-w-[210mm] min-h-[297mm] bg-white p-8 sm:p-10 rounded-sm shadow-xl border border-stone-300 text-stone-900 flex flex-col justify-between"
            style={{ boxSizing: "border-box" }}
          >
            <div>
              {/* 1. CABEÇALHO TIMBRADO OFICIAL DO RELATÓRIO */}
              <div className="border-b-2 border-stone-900 pb-4 mb-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-stone-800" />
                      <h1 className="text-xl font-black text-stone-900 tracking-tight uppercase">
                        {storeName}
                      </h1>
                    </div>
                    {cnpj && (
                      <p className="text-xs font-mono font-medium text-stone-600 mt-0.5">
                        CNPJ: {cnpj}
                      </p>
                    )}
                    {address && (
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        {address}
                      </p>
                    )}
                  </div>

                  <div className="text-left sm:text-right text-xs">
                    <span className="inline-block px-2.5 py-1 rounded bg-stone-100 text-stone-800 font-bold uppercase text-[10px] tracking-wider border border-stone-300 mb-1">
                      Documento Contábil / Gerencial
                    </span>
                    <p className="text-stone-600 font-medium">
                      <span className="font-bold">Emissão:</span> {generatedAtFormatted}
                    </p>
                    <p className="text-stone-600 font-medium">
                      <span className="font-bold">Período:</span> {periodLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-dashed border-stone-300 text-center">
                  <h2 className="text-sm sm:text-base font-black text-stone-900 tracking-wide uppercase">
                    {getReportTitle()}
                  </h2>
                </div>
              </div>

              {/* 2. RESUMO DE KPIS CONSOLIDADOS */}
              <div className="mb-6 avoid-break">
                <h3 className="text-xs font-bold uppercase text-stone-700 tracking-wider mb-2 border-l-2 border-stone-900 pl-2">
                  1. Indicadores Principais de Performance
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                    <p className="text-[10px] font-semibold text-stone-500 uppercase">Faturamento Líquido</p>
                    <p className="text-base font-bold font-mono text-emerald-800 mt-0.5">
                      {formatMoney(summary.netRevenue)}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                    <p className="text-[10px] font-semibold text-stone-500 uppercase">Pedidos Entregues</p>
                    <p className="text-base font-bold font-mono text-stone-900 mt-0.5">
                      {summary.totalOrdersCount} un.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                    <p className="text-[10px] font-semibold text-stone-500 uppercase">Ticket Médio</p>
                    <p className="text-base font-bold font-mono text-stone-900 mt-0.5">
                      {formatMoney(summary.averageTicket)}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                    <p className="text-[10px] font-semibold text-stone-500 uppercase">Perdas / Cancelados</p>
                    <p className="text-base font-bold font-mono text-rose-700 mt-0.5">
                      {summary.canceledOrdersCount} ({formatMoney(summary.totalCanceledRevenue)})
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. CONTEÚDO CONFORME MODELO */}

              {/* Modelo A: Balanço Financeiro & Fiscal */}
              {(reportType === "financial" || reportType === "all") && (
                <div className="space-y-6 mb-6">
                  {/* Tabela de Métodos de Pagamento */}
                  <div className="avoid-break">
                    <h3 className="text-xs font-bold uppercase text-stone-700 tracking-wider mb-2 border-l-2 border-stone-900 pl-2">
                      2. Faturamento Discriminado por Meio de Pagamento
                    </h3>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-stone-300">
                          <th className="text-left py-2 px-2.5">Método de Pagamento</th>
                          <th className="text-center py-2 px-2.5">Transações</th>
                          <th className="text-right py-2 px-2.5">Ticket Médio</th>
                          <th className="text-right py-2 px-2.5">Faturamento Total</th>
                          <th className="text-right py-2 px-2.5">% do Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentMethodsList.map((m) => (
                          <tr key={m.id} className="border-b border-stone-200">
                            <td className="py-1.5 px-2.5 font-bold text-stone-900">{m.label}</td>
                            <td className="py-1.5 px-2.5 text-center font-mono">{m.count} un.</td>
                            <td className="py-1.5 px-2.5 text-right font-mono">{formatMoney(m.averageTicket)}</td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold">{formatMoney(m.revenue)}</td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-800">{m.percentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-stone-900 font-bold bg-stone-50">
                          <td className="py-2 px-2.5 uppercase">Total Consolidado</td>
                          <td className="py-2 px-2.5 text-center font-mono">{summary.totalOrdersCount} un.</td>
                          <td className="py-2 px-2.5 text-right font-mono">{formatMoney(summary.averageTicket)}</td>
                          <td className="py-2 px-2.5 text-right font-mono text-emerald-900">{formatMoney(summary.netRevenue)}</td>
                          <td className="py-2 px-2.5 text-right font-mono">100%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Tabela de Canais de Venda */}
                  {channelsList.length > 0 && (
                    <div className="avoid-break">
                      <h3 className="text-xs font-bold uppercase text-stone-700 tracking-wider mb-2 border-l-2 border-stone-900 pl-2">
                        3. Origem de Faturamento por Canal
                      </h3>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-stone-300">
                            <th className="text-left py-2 px-2.5">Canal</th>
                            <th className="text-center py-2 px-2.5">Pedidos</th>
                            <th className="text-right py-2 px-2.5">Faturamento</th>
                            <th className="text-right py-2 px-2.5">Participação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {channelsList.map((c) => (
                            <tr key={c.id} className="border-b border-stone-200">
                              <td className="py-1.5 px-2.5 font-semibold text-stone-900">{c.label}</td>
                              <td className="py-1.5 px-2.5 text-center font-mono">{c.count} un.</td>
                              <td className="py-1.5 px-2.5 text-right font-mono font-bold">{formatMoney(c.revenue)}</td>
                              <td className="py-1.5 px-2.5 text-right font-mono font-bold text-stone-800">{c.percentage}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Modelo B: Curva ABC de Produtos */}
              {(reportType === "products") && (
                <div className="mb-6 avoid-break">
                  <h3 className="text-xs font-bold uppercase text-stone-700 tracking-wider mb-2 border-l-2 border-stone-900 pl-2">
                    2. Ranking de Produtos & Faturamento por Item
                  </h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-300">
                        <th className="text-left py-2 px-2.5">#</th>
                        <th className="text-left py-2 px-2.5">Produto</th>
                        <th className="text-left py-2 px-2.5">Categoria</th>
                        <th className="text-center py-2 px-2.5">Qtd. Vendida</th>
                        <th className="text-right py-2 px-2.5">Preço Médio</th>
                        <th className="text-right py-2 px-2.5">Faturamento Total</th>
                        <th className="text-right py-2 px-2.5">% Participação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsList.slice(0, 35).map((p, pIdx) => (
                        <tr key={p.id || pIdx} className="border-b border-stone-200">
                          <td className="py-1 px-2.5 font-mono text-stone-400">{pIdx + 1}</td>
                          <td className="py-1 px-2.5 font-bold text-stone-900">{p.name}</td>
                          <td className="py-1 px-2.5 text-stone-600">{p.category}</td>
                          <td className="py-1 px-2.5 text-center font-mono font-semibold">{p.quantity} un.</td>
                          <td className="py-1 px-2.5 text-right font-mono">{formatMoney(p.averageUnitPrice)}</td>
                          <td className="py-1 px-2.5 text-right font-mono font-bold">{formatMoney(p.revenue)}</td>
                          <td className="py-1 px-2.5 text-right font-mono font-bold text-emerald-800">{p.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-stone-900 font-bold bg-stone-50">
                        <td colSpan={3} className="py-2 px-2.5 uppercase">Totais dos Produtos Listados</td>
                        <td className="py-2 px-2.5 text-center font-mono">
                          {productsList.reduce((s, p) => s + p.quantity, 0)} un.
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono">—</td>
                        <td className="py-2 px-2.5 text-right font-mono text-emerald-900">{formatMoney(summary.netRevenue)}</td>
                        <td className="py-2 px-2.5 text-right font-mono">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Modelo C: Extrato Operacional de Pedidos */}
              {(reportType === "orders") && (
                <div className="mb-6">
                  <h3 className="text-xs font-bold uppercase text-stone-700 tracking-wider mb-2 border-l-2 border-stone-900 pl-2">
                    2. Relação Pedido a Pedido no Período
                  </h3>
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-stone-300">
                        <th className="text-left py-2 px-2">Pedido #</th>
                        <th className="text-left py-2 px-2">Data/Hora</th>
                        <th className="text-left py-2 px-2">Cliente</th>
                        <th className="text-left py-2 px-2">Canal</th>
                        <th className="text-left py-2 px-2">Pagamento</th>
                        <th className="text-right py-2 px-2">Subtotal</th>
                        <th className="text-right py-2 px-2">Taxa</th>
                        <th className="text-right py-2 px-2">Total Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersDetailedList.slice(0, 100).map((o) => (
                        <tr key={o.id} className="border-b border-stone-200">
                          <td className="py-1.5 px-2 font-mono font-bold text-stone-900">{o.orderNumber}</td>
                          <td className="py-1.5 px-2 font-mono text-stone-600">{o.dateTimeFormatted}</td>
                          <td className="py-1.5 px-2 font-medium text-stone-800 truncate max-w-[120px]">{o.customerName}</td>
                          <td className="py-1.5 px-2 text-stone-700">{o.channel}</td>
                          <td className="py-1.5 px-2 font-semibold text-stone-700 capitalize">{o.paymentMethod}</td>
                          <td className="py-1.5 px-2 text-right font-mono">{formatMoney(o.subtotal)}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-stone-500">{formatMoney(o.fee)}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold text-stone-900">{formatMoney(o.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-stone-900 font-bold bg-stone-50">
                        <td colSpan={5} className="py-2 px-2 uppercase">Total Consolidado ({ordersDetailedList.length} pedidos)</td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatMoney(ordersDetailedList.reduce((s, o) => s + o.subtotal, 0))}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatMoney(ordersDetailedList.reduce((s, o) => s + o.fee, 0))}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-emerald-900">
                          {formatMoney(summary.netRevenue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {ordersDetailedList.length > 100 && (
                    <p className="text-[10px] text-stone-500 italic mt-1 text-center">
                      Exibindo os primeiros 100 pedidos na visualização impressa. A exportação em planilha (.CSV) contém 100% dos registros.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 4. RODAPÉ DE AUTENTICIDADE E ASSINATURA */}
            <div className="pt-6 border-t border-stone-300 mt-auto avoid-break">
              <div className="flex flex-col sm:flex-row items-end justify-between gap-6 text-[10px] text-stone-500">
                <div>
                  <p className="font-bold text-stone-700">Sistema de Gestão PedeMuleke ERP</p>
                  <p>Documento gerado automaticamente para conferência contábil e administrativa.</p>
                  <p className="font-mono mt-0.5">Autenticidade: SEC-{Date.now().toString(36).toUpperCase()}</p>
                </div>

                <div className="text-center sm:text-right min-w-[200px]">
                  <div className="border-b border-stone-400 mb-1 w-48 sm:ml-auto"></div>
                  <p className="font-bold text-stone-800">Assinatura do Gestor / Responsável</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
