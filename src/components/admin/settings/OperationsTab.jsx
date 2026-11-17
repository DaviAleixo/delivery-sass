import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Gift,
  Sliders,
  GitBranch,
} from "lucide-react";

export default function OperationsTab({
  settings,
  handleInputChange,
  isVisualOnly = false,
  isTableOnly = false,
}) {
  return (
    <div className="space-y-6">
      {/* SEÇÃO 1: TURNOS & AUDITORIA DE CAIXA */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 bg-stone-50/70 border-b border-stone-200/80">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-stone-700" />
            <span>Turnos, Horários & Auditoria de Caixa</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Políticas de corte da madrugada e regras de segurança para abertura e conferência de caixa.
          </p>
        </div>

        <div className="divide-y divide-stone-100">
          {/* Virada do Dia Comercial (Corte da Madrugada) */}
          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-900">
                  Virada do Dia Comercial (Corte da Madrugada)
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-800 border-emerald-200"
                >
                  {settings.business_day_cutoff_time || "04:00"}
                </Badge>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                Define até que horário da madrugada os pedidos realizados continuam pertencendo ao expediente e data da noite anterior nos relatórios de vendas e padrão semanal.
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200">
              {[
                { value: "04:00", label: "04:00", title: "Padrão Recomendado (Bares e Deliveries)" },
                { value: "05:00", label: "05:00", title: "Madrugada Estendida" },
                { value: "06:00", label: "06:00", title: "Casas Noturnas e Baladas" },
                { value: "00:00", label: "00:00", title: "Meia-noite (Lojas Diurnas)" },
              ].map((opt) => {
                const isSelected = (settings.business_day_cutoff_time || "04:00") === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleInputChange("business_day_cutoff_time", opt.value)}
                    title={opt.title}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      isSelected
                        ? "bg-white text-stone-900 shadow-2xs font-bold"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fechamento Cego de Caixa */}
          {!isVisualOnly && !isTableOnly && (
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-stone-900">
                    Fechamento Cego de Caixa (Padrão Antifraude)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold ${
                      settings.blind_cash_closing
                        ? "bg-stone-900 text-white border-stone-900"
                        : "bg-stone-100 text-stone-600 border-stone-200"
                    }`}
                  >
                    {settings.blind_cash_closing ? "ATIVADO" : "PADRÃO ABERTO"}
                  </Badge>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Oculta os saldos esperados na gaveta ao fechar o turno. O operador deve contar as notas e moedas sem saber o valor previsto, revelando quebras e sobras reais no relatório do proprietário.
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-3">
                <Switch
                  checked={Boolean(settings.blind_cash_closing)}
                  onCheckedChange={(val) => handleInputChange("blind_cash_closing", val)}
                  className="data-[state=checked]:bg-stone-900 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO 2: FLUXO DE PEDIDOS & ESTEIRA DE EXPEDIÇÃO */}
      {!isVisualOnly && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-4 bg-stone-50/70 border-b border-stone-200/80">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-stone-700" />
              <span>Fluxo de Pedidos & Esteira de Expedição</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Defina quais canais geram cartões na tela de Pedidos (Kanban) e quais vão direto para impressão e KDS sem poluir o delivery.
            </p>
          </div>

          <div className="divide-y divide-stone-100">
            {/* 1. Pedidos de Salão & Mesas no Kanban */}
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-stone-900">
                    Exibir pedidos de Salão & Mesas na esteira de Pedidos (Kanban)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${
                      settings.kanban_show_dine_in
                        ? "bg-blue-50 text-blue-800 border-blue-200"
                        : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}
                  >
                    {settings.kanban_show_dine_in ? "Exibir no Kanban" : "Apenas Impressão / KDS (Recomendado)"}
                  </Badge>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Quando desativado, os pedidos lançados nas mesas (pelo PC ou QR Code da mesa) vão direto para a impressora do setor (Bar/Cozinha) e ficam acumulados na comanda em Salão & Mesas, sem misturar com as entregas de motoboy.
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <Switch
                  checked={Boolean(settings.kanban_show_dine_in)}
                  onCheckedChange={(val) => handleInputChange("kanban_show_dine_in", val)}
                  className="data-[state=checked]:bg-emerald-700 cursor-pointer"
                />
              </div>
            </div>

            {/* 2. Vendas do PDV Balcão no Kanban */}
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-stone-900">
                    Exibir vendas rápidas do PDV Balcão na esteira de Pedidos (Kanban)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${
                      settings.kanban_show_pos
                        ? "bg-blue-50 text-blue-800 border-blue-200"
                        : "bg-stone-100 text-stone-700 border-stone-200"
                    }`}
                  >
                    {settings.kanban_show_pos ? "Exibir no Kanban" : "Direto para Impressão"}
                  </Badge>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Vendas rápidas finalizadas diretamente no caixa balcão já nascem pagas. Quando desativado, elas imprimem a comanda na cozinha/balcão sem ocupar espaço na fila de despacho do delivery.
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <Switch
                  checked={Boolean(settings.kanban_show_pos)}
                  onCheckedChange={(val) => handleInputChange("kanban_show_pos", val)}
                  className="data-[state=checked]:bg-emerald-700 cursor-pointer"
                />
              </div>
            </div>

            {/* 3. Enviar pedidos do Salão para o KDS */}
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-stone-900">
                    Enviar pedidos do Salão & Mesas para a tela do KDS
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${
                      settings.kds_show_dine_in !== false
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-stone-100 text-stone-600 border-stone-200"
                    }`}
                  >
                    {settings.kds_show_dine_in !== false ? "Ativo no KDS" : "Somente Impressora"}
                  </Badge>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Se o restaurante utilizar monitor KDS na cozinha ou no bar, os pedidos das mesas aparecem na tela para a equipe preparar e dar baixa.
                </p>
              </div>

              <div className="shrink-0 flex items-center">
                <Switch
                  checked={settings.kds_show_dine_in !== false}
                  onCheckedChange={(val) => handleInputChange("kds_show_dine_in", val)}
                  className="data-[state=checked]:bg-emerald-700 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 3: ATENDIMENTO NO SALÃO & CARDÁPIO */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 bg-stone-50/70 border-b border-stone-200/80">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-stone-700" />
            <span>Salão, Mesas & Precificação</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Configurações de atendimento presencial e regras de precificação fracionada de itens.
          </p>
        </div>

        <div className="divide-y divide-stone-100">
          {/* Taxa de Serviço do Salão & Mesas (10%) */}
          {!isVisualOnly && (
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-stone-900">
                    Taxa de Serviço do Salão (Comissões & Garçons)
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${
                      settings.table_service_fee_enabled
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-stone-100 text-stone-600 border-stone-200"
                    }`}
                  >
                    {settings.table_service_fee_enabled
                      ? `${settings.table_service_fee_rate ?? 10}% Ativo`
                      : "Desativado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Aplica a taxa sugerida no encerramento da comanda de mesas e salão, discriminando o repasse nos relatórios e extratos de fechamento.
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-3">
                {settings.table_service_fee_enabled && (
                  <div className="flex items-center gap-1.5 bg-stone-50 px-3 py-1 rounded-xl border border-stone-200">
                    <Label htmlFor="service_rate" className="text-xs font-semibold text-stone-600">
                      Taxa:
                    </Label>
                    <Input
                      id="service_rate"
                      type="number"
                      min="1"
                      max="30"
                      step="1"
                      value={settings.table_service_fee_rate ?? 10}
                      onChange={(e) =>
                        handleInputChange(
                          "table_service_fee_rate",
                          Math.max(1, Math.min(30, Number(e.target.value) || 0))
                        )
                      }
                      className="w-16 h-7 text-center font-mono font-bold text-xs bg-white border-stone-300 rounded-md"
                    />
                    <span className="text-xs font-bold text-stone-700">%</span>
                  </div>
                )}
                <Switch
                  checked={Boolean(settings.table_service_fee_enabled)}
                  onCheckedChange={(val) => handleInputChange("table_service_fee_enabled", val)}
                  className="data-[state=checked]:bg-emerald-700 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Regra de Cobrança de Pizzas Fracionadas */}
          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-900">
                  Cobrança de Pizzas Meio a Meio
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold bg-stone-100 text-stone-700 border-stone-200"
                >
                  {settings.pizza_pricing_rule === "average" ? "Média Ponderada" : "Maior Valor"}
                </Badge>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                Define como o sistema calcula o valor final da pizza quando o cliente seleciona sabores com preços diferentes na mesma montagem.
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200">
              <button
                type="button"
                onClick={() => handleInputChange("pizza_pricing_rule", "highest_price")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  settings.pizza_pricing_rule !== "average"
                    ? "bg-white text-stone-900 shadow-2xs font-bold"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Pelo Maior Valor (Padrão)
              </button>
              <button
                type="button"
                onClick={() => handleInputChange("pizza_pricing_rule", "average")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  settings.pizza_pricing_rule === "average"
                    ? "bg-white text-stone-900 shadow-2xs font-bold"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                Pela Média dos Sabores
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 3: PROGRAMA DE FIDELIDADE (CASHBACK) */}
      {!isVisualOnly && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
          <div className="px-5 py-4 bg-stone-50/70 border-b border-stone-200/80">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Gift className="w-4 h-4 text-stone-700" />
              <span>Programa de Fidelidade (Cashback da Loja)</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Crédito virtual de loja para estimular retorno semanal sem custo de emissão para a plataforma.
            </p>
          </div>

          <div className="divide-y divide-stone-100">
            {/* Ativação Principal */}
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-stone-900">
                    Ativar Saldo de Cashback para Clientes
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${
                      settings.cashback_enabled
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-stone-100 text-stone-600 border-stone-200"
                    }`}
                  >
                    {settings.cashback_enabled ? "Ativo no Cardápio" : "Desativado"}
                  </Badge>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed">
                  Os clientes acumulam percentual da compra como saldo em carteira para abater em pedidos futuros dentro do prazo de validade.
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-3">
                <Switch
                  checked={Boolean(settings.cashback_enabled)}
                  onCheckedChange={(val) => handleInputChange("cashback_enabled", val)}
                  className="data-[state=checked]:bg-emerald-700 cursor-pointer"
                />
              </div>
            </div>

            {/* Parâmetros detalhados do Cashback */}
            {settings.cashback_enabled && (
              <div className="p-5 bg-stone-50/40">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 space-y-1.5">
                    <Label htmlFor="cashback_rate" className="text-xs font-bold text-stone-800 block">
                      % de Volta por Pedido
                    </Label>
                    <p className="text-[10px] text-stone-500">
                      Recomendado de 5% a 10%
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        id="cashback_rate"
                        type="number"
                        min="1"
                        max="30"
                        step="0.5"
                        value={settings.cashback_rate ?? 5}
                        onChange={(e) =>
                          handleInputChange(
                            "cashback_rate",
                            Math.max(0.5, Math.min(30, Number(e.target.value) || 0))
                          )
                        }
                        className="w-20 h-8 text-center font-mono font-bold text-xs bg-stone-50 border-stone-300 rounded-lg"
                      />
                      <span className="text-xs font-bold text-stone-700">%</span>
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 space-y-1.5">
                    <Label htmlFor="cashback_validity" className="text-xs font-bold text-stone-800 block">
                      Validade do Crédito
                    </Label>
                    <p className="text-[10px] text-stone-500">
                      Cria urgência de recompra
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        id="cashback_validity"
                        type="number"
                        min="1"
                        max="90"
                        step="1"
                        value={settings.cashback_validity_days ?? 15}
                        onChange={(e) =>
                          handleInputChange(
                            "cashback_validity_days",
                            Math.max(1, Math.min(90, Number(e.target.value) || 1))
                          )
                        }
                        className="w-20 h-8 text-center font-mono font-bold text-xs bg-stone-50 border-stone-300 rounded-lg"
                      />
                      <span className="text-xs font-bold text-stone-700">dias</span>
                    </div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-stone-200 space-y-1.5">
                    <Label htmlFor="cashback_max_discount" className="text-xs font-bold text-stone-800 block">
                      Limite de Abatimento
                    </Label>
                    <p className="text-[10px] text-stone-500">
                      Trava de segurança na compra
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Input
                        id="cashback_max_discount"
                        type="number"
                        min="10"
                        max="100"
                        step="5"
                        value={settings.cashback_max_discount_percentage ?? 50}
                        onChange={(e) =>
                          handleInputChange(
                            "cashback_max_discount_percentage",
                            Math.max(10, Math.min(100, Number(e.target.value) || 50))
                          )
                        }
                        className="w-20 h-8 text-center font-mono font-bold text-xs bg-stone-50 border-stone-300 rounded-lg"
                      />
                      <span className="text-xs font-bold text-stone-700">% do pedido</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
