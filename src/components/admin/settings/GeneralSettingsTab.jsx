import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Search, Loader2 } from "lucide-react";
import { formatPhone } from "./settingsConstants";

export default function GeneralSettingsTab({
  settings,
  handleInputChange,
  handleAddressFieldChange,
  handleCepChange,
  handleLogoUpload,
  isUploadingLogo,
  isFetchingCep,
  cepError,
}) {
  return (
    <div className="space-y-6">
      {/* Identidade do Restaurante */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-stone-900">
            Identidade do Restaurante
          </CardTitle>
          <p className="text-xs text-stone-500">
            Nome exibido no cardápio online e logotipo da sua marca.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name" className="text-sm font-bold text-stone-800">
              Nome do Restaurante <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="name"
              value={settings.restaurant_name}
              onChange={(e) => handleInputChange("restaurant_name", e.target.value)}
              placeholder="Digite o nome do seu restaurante"
              className="mt-1 font-medium bg-white"
            />
          </div>

          <div>
            <Label htmlFor="logo" className="text-sm font-bold text-stone-800">
              Logo do Restaurante
            </Label>
            <Input
              id="logo"
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={isUploadingLogo}
              className="mt-1 cursor-pointer bg-white"
            />
            {isUploadingLogo && (
              <p className="text-xs text-amber-600 mt-1 font-medium animate-pulse">
                Enviando e processando logo...
              </p>
            )}
            {settings.restaurant_logo && !isUploadingLogo && (
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={settings.restaurant_logo}
                  alt="Logo"
                  className="w-20 h-20 object-cover rounded-xl border border-stone-200 shadow-xs"
                />
                <span className="text-xs text-stone-500">Logo atual cadastrada</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Canais de Atendimento: Delivery & Retirada */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <span>🛵</span> Canais de Atendimento (Delivery & Retirada)
          </CardTitle>
          <p className="text-xs text-stone-500">
            Defina como seus clientes remotos podem receber os pedidos. Ideal para lojas que atendem apenas entrega, apenas retirada no balcão ou ambos.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Opção 1: Delivery */}
            <div
              onClick={() => handleInputChange("accepts_delivery", !(settings.accepts_delivery !== false))}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                settings.accepts_delivery !== false
                  ? "border-emerald-600 bg-emerald-50/40 shadow-xs"
                  : "border-stone-200 hover:border-stone-300 bg-stone-50/60 opacity-70"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-800 flex items-center justify-center font-bold text-xl">
                    🛵
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.accepts_delivery !== false}
                    onChange={(e) => handleInputChange("accepts_delivery", e.target.checked)}
                    className="accent-emerald-600 h-5 w-5 rounded cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <h4 className="font-bold text-sm text-stone-900 flex items-center gap-1.5">
                  Aceitar Pedidos para Delivery
                </h4>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                  Clientes informam o endereço e pagam a taxa de entrega. O pedido entra na fila de despacho de entregadores.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-stone-200/60 flex items-center justify-between">
                <span className={`text-[11px] font-bold ${settings.accepts_delivery !== false ? "text-emerald-700" : "text-stone-400"}`}>
                  {settings.accepts_delivery !== false ? "✓ Ativo no cardápio" : "✕ Desativado"}
                </span>
              </div>
            </div>

            {/* Opção 2: Retirada */}
            <div
              onClick={() => handleInputChange("accepts_takeaway", !(settings.accepts_takeaway !== false))}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                settings.accepts_takeaway !== false
                  ? "border-emerald-600 bg-emerald-50/40 shadow-xs"
                  : "border-stone-200 hover:border-stone-300 bg-stone-50/60 opacity-70"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-100/80 text-amber-800 flex items-center justify-center font-bold text-xl">
                    🛍️
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.accepts_takeaway !== false}
                    onChange={(e) => handleInputChange("accepts_takeaway", e.target.checked)}
                    className="accent-emerald-600 h-5 w-5 rounded cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <h4 className="font-bold text-sm text-stone-900 flex items-center gap-1.5">
                  Aceitar Retirada no Balcão
                </h4>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                  O cliente faz o pedido pelo celular e vai buscar na sua loja com frete grátis. Não exige endereço nem taxa.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-stone-200/60 flex items-center justify-between">
                <span className={`text-[11px] font-bold ${settings.accepts_takeaway !== false ? "text-emerald-700" : "text-stone-400"}`}>
                  {settings.accepts_takeaway !== false ? "✓ Ativo no cardápio" : "✕ Desativado"}
                </span>
              </div>
            </div>
          </div>

          {settings.accepts_delivery === false && settings.accepts_takeaway === false && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              ⚠️ Atenção: Se ambos estiverem desativados, seus clientes remotos não conseguirão finalizar pedidos. Recomendamos manter pelo menos um canal ativo.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modo de Atendimento do Cardápio */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <span>🍽️</span> Modo de Atendimento do Cardápio
          </CardTitle>
          <p className="text-xs text-stone-500">
            Defina como seus clientes visualizam e interagem com os pedidos pelo celular.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Opção 1: Visual */}
            <div 
              onClick={() => handleInputChange("salon_mode", "showcase")}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                settings.salon_mode === "showcase" 
                  ? "border-red-600 bg-red-50/50 shadow-sm" 
                  : "border-stone-200 hover:border-stone-300 bg-white"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">📖</span>
                  <input 
                    type="radio" 
                    name="salon_mode" 
                    checked={settings.salon_mode === "showcase"} 
                    onChange={() => handleInputChange("salon_mode", "showcase")}
                    className="accent-red-600 h-4 w-4"
                  />
                </div>
                <h4 className="font-bold text-sm text-stone-900">Apenas Cardápio Visual</h4>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  Sem carrinho. O cliente apenas lê os pratos no celular pelo QR Code e faz o pedido ao garçom.
                </p>
              </div>
              <span className="text-[10px] font-bold text-stone-400 mt-3 uppercase tracking-wider">Zero entregadores</span>
            </div>

            {/* Opção 2: Mesa */}
            <div 
              onClick={() => handleInputChange("salon_mode", "table_only")}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                settings.salon_mode === "table_only" 
                  ? "border-red-600 bg-red-50/50 shadow-sm" 
                  : "border-stone-200 hover:border-stone-300 bg-white"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">🍽️</span>
                  <input 
                    type="radio" 
                    name="salon_mode" 
                    checked={settings.salon_mode === "table_only"} 
                    onChange={() => handleInputChange("salon_mode", "table_only")}
                    className="accent-red-600 h-4 w-4"
                  />
                </div>
                <h4 className="font-bold text-sm text-stone-900">Autoatendimento na Mesa</h4>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  O cliente escaneia o QR Code da mesa, envia o pedido e a comanda imprime direto no caixa.
                </p>
              </div>
              <span className="text-[10px] font-bold text-emerald-600 mt-3 uppercase tracking-wider">Comanda na mesa</span>
            </div>

            {/* Opção 3: Completo */}
            <div 
              onClick={() => handleInputChange("salon_mode", "full")}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                settings.salon_mode === "full" || !settings.salon_mode
                  ? "border-red-600 bg-red-50/50 shadow-sm" 
                  : "border-stone-200 hover:border-stone-300 bg-white"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">🛵</span>
                  <input 
                    type="radio" 
                    name="salon_mode" 
                    checked={settings.salon_mode === "full" || !settings.salon_mode} 
                    onChange={() => handleInputChange("salon_mode", "full")}
                    className="accent-red-600 h-4 w-4"
                  />
                </div>
                <h4 className="font-bold text-sm text-stone-900">Atendimento Completo</h4>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  Mesas no salão + Delivery na rua com cálculo de frete + Retirada no balcão.
                </p>
              </div>
              <span className="text-[10px] font-bold text-purple-600 mt-3 uppercase tracking-wider">Salão & Delivery</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Precificação de Pizzas Fracionadas (Meio a Meio) */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <span>🍕</span> Regra de Cobrança de Pizzas (Meio a Meio)
          </CardTitle>
          <p className="text-xs text-stone-500">
            Defina como o sistema calcula o valor final da pizza quando o cliente escolhe sabores de preços diferentes.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Opção 1: Maior Valor (Padrão) */}
            <div
              onClick={() => handleInputChange("pizza_pricing_rule", "highest_price")}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                settings.pizza_pricing_rule !== "average"
                  ? "border-[#047857] bg-[#D1E9DF]/20 shadow-xs ring-2 ring-[#047857]/20"
                  : "border-stone-200 hover:border-stone-300 bg-white opacity-70"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-100/90 text-amber-800 flex items-center justify-center font-bold text-xl">
                    🥇
                  </div>
                  <input
                    type="radio"
                    name="pizza_pricing_rule"
                    checked={settings.pizza_pricing_rule !== "average"}
                    onChange={() => handleInputChange("pizza_pricing_rule", "highest_price")}
                    className="accent-[#047857] h-5 w-5 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <h4 className="font-bold text-sm text-stone-900 flex items-center gap-1.5">
                  Cobrar pelo Maior Valor (Padrão)
                </h4>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                  Cobra o valor da pizza inteira do sabor mais caro selecionado. Modelo mais tradicional no Brasil (cobre custos operacionais de montagem).
                </p>
                <div className="mt-3 p-2 bg-stone-50 rounded-lg text-[11px] text-stone-600 font-mono">
                  Ex: 1/2 R$ 40 + 1/2 R$ 60 = <strong className="text-stone-900 font-bold">R$ 60,00</strong>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-stone-200/60 flex items-center justify-between">
                <span className={`text-[11px] font-bold ${settings.pizza_pricing_rule !== "average" ? "text-emerald-700" : "text-stone-400"}`}>
                  {settings.pizza_pricing_rule !== "average" ? "✓ Regra Ativa" : "Selecionar"}
                </span>
              </div>
            </div>

            {/* Opção 2: Média Proporcional */}
            <div
              onClick={() => handleInputChange("pizza_pricing_rule", "average")}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                settings.pizza_pricing_rule === "average"
                  ? "border-[#047857] bg-[#D1E9DF]/20 shadow-xs ring-2 ring-[#047857]/20"
                  : "border-stone-200 hover:border-stone-300 bg-white opacity-70"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100/90 text-emerald-800 flex items-center justify-center font-bold text-xl">
                    ⚖️
                  </div>
                  <input
                    type="radio"
                    name="pizza_pricing_rule"
                    checked={settings.pizza_pricing_rule === "average"}
                    onChange={() => handleInputChange("pizza_pricing_rule", "average")}
                    className="accent-[#047857] h-5 w-5 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <h4 className="font-bold text-sm text-stone-900 flex items-center gap-1.5">
                  Cobrar pela Média Proporcional
                </h4>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                  Cobra exatamente 50% de cada sabor (ou 33% em 3 sabores). Modelo considerado mais transparente e justo pelo consumidor.
                </p>
                <div className="mt-3 p-2 bg-stone-50 rounded-lg text-[11px] text-stone-600 font-mono">
                  Ex: 1/2 R$ 40 + 1/2 R$ 60 = <strong className="text-stone-900 font-bold">R$ 50,00</strong>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-stone-200/60 flex items-center justify-between">
                <span className={`text-[11px] font-bold ${settings.pizza_pricing_rule === "average" ? "text-emerald-700" : "text-stone-400"}`}>
                  {settings.pizza_pricing_rule === "average" ? "✓ Regra Ativa" : "Selecionar"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Taxa de Serviço do Salão & Mesas (10% Opcional) */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <span>🛎️</span> Taxa de Serviço do Salão & Mesas
          </CardTitle>
          <p className="text-xs text-stone-500">
            Defina se o restaurante inclui a taxa de serviço opcional para atendimento nas comandas e pré-contas de mesa.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onClick={() => handleInputChange("table_service_fee_enabled", !settings.table_service_fee_enabled)}
            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              settings.table_service_fee_enabled
                ? "border-emerald-600 bg-emerald-50/40 shadow-xs"
                : "border-stone-200 hover:border-stone-300 bg-stone-50/60 opacity-80"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100/90 text-emerald-800 flex items-center justify-center font-bold text-xl shrink-0">
                🛎️
              </div>
              <div>
                <h4 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                  <span>Cobrar Taxa de Serviço nas Mesas</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    settings.table_service_fee_enabled 
                      ? "bg-emerald-100 text-emerald-800" 
                      : "bg-stone-200 text-stone-600"
                  }`}>
                    {settings.table_service_fee_enabled ? "Ativo" : "Desativado"}
                  </span>
                </h4>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  Quando ativado, a taxa é calculada automaticamente na comanda, no cupom impresso de pré-conta e no recebimento da mesa.
                  Quando desativado, o total da mesa é 100% livre de taxa de serviço.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                id="table_service_fee_enabled"
                checked={Boolean(settings.table_service_fee_enabled)}
                onChange={(e) => handleInputChange("table_service_fee_enabled", e.target.checked)}
                className="accent-emerald-600 h-5 w-5 rounded cursor-pointer"
              />
            </div>
          </div>

          {settings.table_service_fee_enabled && (
            <div className="p-4 bg-white rounded-2xl border border-emerald-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <Label htmlFor="table_service_fee_rate" className="text-xs font-bold text-stone-800 block">
                  Porcentagem da Taxa de Serviço (%)
                </Label>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Padrão no Brasil é 10%, mas você pode personalizar se necessário.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="table_service_fee_rate"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={settings.table_service_fee_rate ?? 10}
                  onChange={(e) => handleInputChange("table_service_fee_rate", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="w-24 h-9 text-center font-bold text-sm bg-stone-50 border-stone-300 rounded-xl"
                />
                <span className="text-sm font-black text-stone-700">%</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações de Contato e Localização */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-stone-900">
            Contato & Endereço da Loja
          </CardTitle>
          <p className="text-xs text-stone-500">
            Localização física da sua base e canais de atendimento direto.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="whatsapp" className="text-sm font-bold text-stone-800">
              WhatsApp da Loja <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="whatsapp"
              type="tel"
              value={settings.whatsapp}
              onChange={(e) => handleInputChange("whatsapp", formatPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              maxLength={15}
              className="mt-1 font-medium bg-white"
            />
            <p className="text-[11px] text-stone-500 mt-1">
              DDD e telefone para envio de pedidos e atendimento no WhatsApp.
            </p>
          </div>

          {/* Endereço com CEP */}
          <div className="pt-2 border-t border-stone-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* CEP */}
              <div className="sm:col-span-7">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cep" className="text-sm font-bold text-stone-800 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-rose-600" />
                    <span>CEP da Loja</span>
                  </Label>
                  {isFetchingCep && (
                    <span className="text-[11px] text-rose-600 font-semibold flex items-center gap-1 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Buscando CEP...
                    </span>
                  )}
                </div>
                <div className="relative mt-1">
                  <Input
                    id="cep"
                    type="text"
                    value={settings.cep || ""}
                    onChange={handleCepChange}
                    placeholder="00000-000"
                    maxLength={9}
                    className="font-medium pr-10 bg-white"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">
                    {isFetchingCep ? (
                      <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </div>
                </div>
                {cepError ? (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">{cepError}</p>
                ) : (
                  <p className="text-[11px] text-stone-500 mt-1">
                    Preenche rua, bairro, cidade e UF automaticamente.
                  </p>
                )}
              </div>

              {/* Número */}
              <div className="sm:col-span-5">
                <Label htmlFor="address_number" className="text-sm font-bold text-stone-800 flex items-center gap-1">
                  <span>Número da Casa / Loja</span>
                  <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="address_number"
                  type="text"
                  value={settings.address_number || ""}
                  onChange={(e) => handleAddressFieldChange("address_number", e.target.value)}
                  placeholder="Ex: 120 ou S/N"
                  className="mt-1 font-medium bg-white"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  Número do imóvel.
                </p>
              </div>
            </div>

            {/* Rua e Complemento */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-8">
                <Label htmlFor="address_street" className="text-xs font-semibold text-stone-700">
                  Rua / Avenida / Logradouro
                </Label>
                <Input
                  id="address_street"
                  type="text"
                  value={settings.address_street || ""}
                  onChange={(e) => handleAddressFieldChange("address_street", e.target.value)}
                  placeholder="Ex: Av. Principal ou Rua das Flores"
                  className="mt-1 text-sm bg-white"
                />
              </div>

              <div className="sm:col-span-4">
                <Label htmlFor="address_complement" className="text-xs font-semibold text-stone-700">
                  Complemento (Opcional)
                </Label>
                <Input
                  id="address_complement"
                  type="text"
                  value={settings.address_complement || ""}
                  onChange={(e) => handleAddressFieldChange("address_complement", e.target.value)}
                  placeholder="Ex: Loja 2, Fundos, Sala 3"
                  className="mt-1 text-sm bg-white"
                />
              </div>
            </div>

            {/* Bairro, Cidade e UF */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <Label htmlFor="address_neighborhood" className="text-xs font-semibold text-stone-700">
                  Bairro da Loja
                </Label>
                <Input
                  id="address_neighborhood"
                  type="text"
                  value={settings.address_neighborhood || ""}
                  onChange={(e) => handleAddressFieldChange("address_neighborhood", e.target.value)}
                  placeholder="Ex: Centro"
                  className="mt-1 text-sm bg-white"
                />
              </div>

              <div className="sm:col-span-5">
                <Label htmlFor="address_city" className="text-xs font-semibold text-stone-700">
                  Cidade
                </Label>
                <Input
                  id="address_city"
                  type="text"
                  value={settings.address_city || ""}
                  onChange={(e) => handleAddressFieldChange("address_city", e.target.value)}
                  placeholder="Ex: Belo Horizonte"
                  className="mt-1 text-sm bg-white font-medium"
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="address_state" className="text-xs font-semibold text-stone-700">
                  UF
                </Label>
                <Input
                  id="address_state"
                  type="text"
                  value={settings.address_state || ""}
                  onChange={(e) => handleAddressFieldChange("address_state", e.target.value.toUpperCase())}
                  placeholder="MG"
                  maxLength={2}
                  className="mt-1 text-sm bg-white uppercase text-center font-bold"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
