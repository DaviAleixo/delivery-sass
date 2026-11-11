import React, { useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  Printer,
  Calendar,
  Layers,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  SlidersHorizontal,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfDay,
  endOfDay,
  subMonths,
} from "date-fns";
import { buildReportData, exportReportToCSV } from "@/utils/reportExportBuilder";
import ReportDocumentPreviewModal from "./ReportDocumentPreviewModal";

const REPORT_MODELS = [
  {
    id: "financial",
    title: "Balanço Financeiro & Contábil",
    description: "Faturamento líquido, discriminação de meios de pagamento (Pix, Cartões, Dinheiro), taxas e cancelamentos para fechamento e contabilidade.",
    icon: DollarSign,
    badge: "Mais Utilizado",
    recommended: true,
  },
  {
    id: "orders",
    title: "Extrato Operacional de Pedidos",
    description: "Relação analítica pedido a pedido com código, cliente, canal (Mesa, Delivery, Balcão), forma de pagamento e total líquido.",
    icon: ShoppingBag,
    badge: "Auditoria",
  },
  {
    id: "products",
    title: "Curva ABC & Ranking de Produtos",
    description: "Relatório de mix de vendas, itens mais pedidos, faturamento individual por produto e representatividade por categoria.",
    icon: TrendingUp,
    badge: "Mix & Vendas",
  },
];

const PERIOD_PRESETS = [
  { id: "today", label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "last_7_days", label: "Últimos 7 dias" },
  { id: "last_30_days", label: "Últimos 30 dias" },
  { id: "this_month", label: "Este Mês" },
  { id: "last_month", label: "Mês Anterior" },
  { id: "this_year", label: "Este Ano" },
  { id: "custom", label: "Personalizado" },
];

export default function ReportsCenterTab({
  orders = [],
  sessions = [],
  tenantSettings = {},
  storeName = "PedeMuleke",
}) {
  const [selectedModel, setSelectedModel] = useState("financial");
  const [selectedPeriod, setSelectedPeriod] = useState("this_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const [includePayments, setIncludePayments] = useState(true);
  const [includeServiceFee, setIncludeServiceFee] = useState(true);
  const [includeCancellations, setIncludeCancellations] = useState(true);
  const [includeChannels, setIncludeChannels] = useState(true);

  // Estado do Modal de Prévia A4
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [compiledReport, setCompiledReport] = useState(null);

  const resolveDateRange = () => {
    const today = new Date();
    switch (selectedPeriod) {
      case "today":
        return { start: startOfDay(today), end: endOfDay(today) };
      case "yesterday": {
        const y = subDays(today, 1);
        return { start: startOfDay(y), end: endOfDay(y) };
      }
      case "last_7_days":
        return { start: subDays(today, 6), end: endOfDay(today) };
      case "last_30_days":
        return { start: subDays(today, 29), end: endOfDay(today) };
      case "this_month":
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case "last_month": {
        const lm = subMonths(today, 1);
        return { start: startOfMonth(lm), end: endOfMonth(lm) };
      }
      case "this_year":
        return { start: startOfYear(today), end: endOfYear(today) };
      case "custom":
        return {
          start: customStartDate ? startOfDay(new Date(customStartDate)) : subDays(today, 29),
          end: customEndDate ? endOfDay(new Date(customEndDate)) : endOfDay(today),
        };
      default:
        return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  };

  const handleGeneratePreview = () => {
    const dateRange = resolveDateRange();
    const data = buildReportData({
      orders,
      sessions,
      reportType: selectedModel,
      dateRange,
      options: {
        includePayments,
        includeServiceFee,
        includeCancellations,
        includeChannels,
      },
      tenantSettings,
      storeName,
    });

    setCompiledReport(data);
    setIsPreviewOpen(true);
  };

  const handleExportDirectCSV = () => {
    const dateRange = resolveDateRange();
    const data = buildReportData({
      orders,
      sessions,
      reportType: selectedModel,
      dateRange,
      options: {
        includePayments,
        includeServiceFee,
        includeCancellations,
        includeChannels,
      },
      tenantSettings,
      storeName,
    });

    exportReportToCSV(data);
  };

  return (
    <div className="space-y-6">
      {/* Banner Informativo Superior */}
      <div className="bg-white rounded-xl p-4 sm:p-5 border border-stone-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-700 shrink-0 border border-stone-200">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-stone-900 tracking-tight">
              Central de Emissão de Relatórios Oficiais (PDF / Excel)
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Gere documentos formais com layout A4 timbrado para sua contabilidade, sócios ou conciliação financeira
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            onClick={handleExportDirectCSV}
            variant="outline"
            className="flex-1 sm:flex-none h-10 rounded-xl font-semibold text-xs text-stone-700 border-stone-300 hover:bg-stone-50 gap-2 cursor-pointer shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>Baixar Planilha (.CSV)</span>
          </Button>

          <Button
            type="button"
            onClick={handleGeneratePreview}
            className="flex-1 sm:flex-none h-10 px-5 rounded-xl font-bold text-xs bg-[#047857] hover:bg-[#036348] text-white gap-2 cursor-pointer shadow-xs active:scale-[0.98] transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Gerar Prévia A4 (PDF)</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Esquerdo: Seleção do Modelo de Relatório (7 colunas) */}
        <div className="lg:col-span-7 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
              <Layers className="w-3.5 h-3.5 text-stone-500" />
              1. Selecione o Modelo de Relatório
            </h3>

            <div className="space-y-3">
              {REPORT_MODELS.map((model) => {
                const isSelected = selectedModel === model.id;
                const IconComponent = model.icon;

                return (
                  <div
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={cn(
                      "p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 select-none",
                      isSelected
                        ? "bg-white border-[#047857] shadow-sm ring-1 ring-[#047857]"
                        : "bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/50 shadow-2xs"
                    )}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                        isSelected
                          ? "bg-[#047857] text-white"
                          : "bg-stone-100 text-stone-600"
                      )}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("text-xs sm:text-sm font-bold truncate", isSelected ? "text-stone-900" : "text-stone-800")}>
                          {model.title}
                        </p>
                        {model.badge && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-semibold uppercase px-2 py-0 shrink-0",
                              isSelected
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-stone-50 text-stone-600 border-stone-200"
                            )}
                          >
                            {model.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                        {model.description}
                      </p>
                    </div>

                    <div className="shrink-0 mt-1">
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                          isSelected
                            ? "border-[#047857] bg-[#047857] text-white"
                            : "border-stone-300 bg-white"
                        )}
                      >
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dica Contábil */}
          <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 flex items-start gap-2.5 text-xs text-amber-900">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-bold">Dica para sua contabilidade:</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Para o cálculo do Simples Nacional ou fechamento mensal, utilize o modelo <strong>Balanço Financeiro & Contábil</strong> com o período ajustado para <strong>Mês Anterior</strong>. O arquivo gerado discrimina faturamento bancário (Pix/Cartões) vs Dinheiro em espécie.
              </p>
            </div>
          </div>
        </div>

        {/* Painel Direito: Configuração de Período & Filtros (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white">
            <CardHeader className="bg-stone-50/70 border-b border-stone-200/80 pb-3 pt-3.5 px-4">
              <CardTitle className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-stone-500" />
                2. Período do Relatório
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              {/* Presets em Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {PERIOD_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPeriod(preset.id)}
                    className={cn(
                      "px-2.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer border text-center",
                      selectedPeriod === preset.id
                        ? "bg-stone-900 border-stone-900 text-white shadow-2xs"
                        : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Data Customizada se 'custom' */}
              {selectedPeriod === "custom" && (
                <div className="pt-2 border-t border-stone-100 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] font-semibold text-stone-600 block mb-1">
                      Data Inicial
                    </Label>
                    <Input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="h-8 text-xs font-mono border-stone-300"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-stone-600 block mb-1">
                      Data Final
                    </Label>
                    <Input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="h-8 text-xs font-mono border-stone-300"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Opções e Módulos do Documento */}
          <Card className="border border-stone-200 rounded-xl shadow-2xs bg-white">
            <CardHeader className="bg-stone-50/70 border-b border-stone-200/80 pb-3 pt-3.5 px-4">
              <CardTitle className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-stone-500" />
                3. Informações a Incluir
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-stone-700 select-none">
                <input
                  type="checkbox"
                  checked={includePayments}
                  onChange={(e) => setIncludePayments(e.target.checked)}
                  className="rounded border-stone-300 text-[#047857] focus:ring-[#047857]"
                />
                <span className="font-medium">Detalhamento de Métodos de Pagamento</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-stone-700 select-none">
                <input
                  type="checkbox"
                  checked={includeChannels}
                  onChange={(e) => setIncludeChannels(e.target.checked)}
                  className="rounded border-stone-300 text-[#047857] focus:ring-[#047857]"
                />
                <span className="font-medium">Origem das Vendas (Delivery vs Balcão vs Salão)</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-stone-700 select-none">
                <input
                  type="checkbox"
                  checked={includeCancellations}
                  onChange={(e) => setIncludeCancellations(e.target.checked)}
                  className="rounded border-stone-300 text-[#047857] focus:ring-[#047857]"
                />
                <span className="font-medium">Perdas e Pedidos Cancelados</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-stone-700 select-none">
                <input
                  type="checkbox"
                  checked={includeServiceFee}
                  onChange={(e) => setIncludeServiceFee(e.target.checked)}
                  className="rounded border-stone-300 text-[#047857] focus:ring-[#047857]"
                />
                <span className="font-medium">Taxas de Entrega e Gorjetas / Serviço</span>
              </label>
            </CardContent>
          </Card>

          {/* Botão de Ação Direto */}
          <Button
            type="button"
            onClick={handleGeneratePreview}
            className="w-full h-11 rounded-xl bg-[#047857] hover:bg-[#036348] text-white font-bold text-xs gap-2 cursor-pointer shadow-xs active:scale-[0.98] transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Visualizar Folha A4 & Baixar PDF</span>
          </Button>
        </div>
      </div>

      {/* Modal de Prévia A4 Realista */}
      <ReportDocumentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        reportData={compiledReport}
      />
    </div>
  );
}
