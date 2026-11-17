import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Store,
  MapPin,
  Search,
  Loader2,
  Phone,
  Instagram,
  Upload,
} from "lucide-react";
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
      {/* SEÇÃO 1: IDENTIDADE DA LOJA & CONTATO */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs">
        <div className="px-5 py-4 bg-stone-50/70 border-b border-stone-200/80 rounded-t-2xl">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <Store className="w-4 h-4 text-stone-700" />
            <span>Identidade do Estabelecimento & Canais de Contato</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Dados principais exibidos no cabeçalho do seu cardápio online e no atendimento aos clientes.
          </p>
        </div>

        <div className="p-5 space-y-5">
          {/* Nome e Logotipo */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            <div className="md:col-span-8 space-y-4">
              <div>
                <Label htmlFor="restaurant_name" className="text-xs font-bold text-stone-800">
                  Nome do Restaurante / Loja <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="restaurant_name"
                  value={settings.restaurant_name}
                  onChange={(e) => handleInputChange("restaurant_name", e.target.value)}
                  placeholder="Ex: PedeMuleke Hamburgueria & Chopp"
                  className="mt-1 font-semibold text-xs bg-white rounded-lg h-9 border-stone-300"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  Nome oficial que os clientes verão ao abrir o cardápio e no rastreamento de pedidos.
                </p>
              </div>

              {/* Telefones / Redes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <Label htmlFor="whatsapp" className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-stone-600" />
                    <span>WhatsApp da Loja</span> <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="whatsapp"
                    type="tel"
                    value={settings.whatsapp}
                    onChange={(e) => handleInputChange("whatsapp", formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    maxLength={15}
                    className="mt-1 font-mono text-xs bg-white rounded-lg h-9 border-stone-300"
                  />
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    Número principal para contato no cardápio.
                  </p>
                </div>

                <div>
                  <Label htmlFor="instagram" className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <Instagram className="w-3.5 h-3.5 text-stone-600" />
                    <span>Instagram Oficial (Opcional)</span>
                  </Label>
                  <Input
                    id="instagram"
                    type="text"
                    value={settings.instagram || ""}
                    onChange={(e) => handleInputChange("instagram", e.target.value)}
                    placeholder="@seurestaurante"
                    className="mt-1 text-xs bg-white rounded-lg h-9 border-stone-300"
                  />
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    Perfil público para divulgar nas redes.
                  </p>
                </div>
              </div>
            </div>

            {/* Logotipo da Marca */}
            <div className="md:col-span-4 bg-stone-50/70 p-4 rounded-xl border border-stone-200/90 flex flex-col items-center justify-center text-center">
              <Label className="text-xs font-bold text-stone-800 block mb-2">
                Logotipo da Marca
              </Label>
              {settings.restaurant_logo ? (
                <div className="relative group mb-3">
                  <img
                    src={settings.restaurant_logo}
                    alt="Logo da Loja"
                    className="w-20 h-20 object-cover rounded-xl border border-stone-200 shadow-2xs bg-white"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-stone-200/80 border border-stone-300 flex items-center justify-center text-stone-400 mb-3">
                  <Store className="w-8 h-8 stroke-1" />
                </div>
              )}

              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 font-semibold text-xs rounded-lg border border-stone-300 shadow-2xs transition-colors">
                <Upload className="w-3.5 h-3.5 text-stone-500" />
                <span>{settings.restaurant_logo ? "Alterar Logotipo" : "Enviar Imagem"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={isUploadingLogo}
                  className="hidden"
                />
              </label>

              {isUploadingLogo && (
                <p className="text-[11px] text-emerald-700 font-semibold mt-2 animate-pulse flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Processando logo...
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: LOCALIZAÇÃO & ENDEREÇO DA BASE */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs">
        <div className="px-5 py-4 bg-stone-50/70 border-b border-stone-200/80 rounded-t-2xl">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-stone-700" />
            <span>Endereço Físico & Localização da Loja</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Endereço utilizado para cálculo de rota dos entregadores e ponto de retirada para clientes.
          </p>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            {/* Linha 1: CEP (4 cols) + Rua / Logradouro (8 cols) */}
            <div className="sm:col-span-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="cep" className="text-xs font-bold text-stone-800">
                  CEP da Loja
                </Label>
                {isFetchingCep && (
                  <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1 animate-pulse">
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
                  className="font-mono text-xs pr-10 bg-white rounded-lg h-9 border-stone-300 shadow-2xs"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">
                  {isFetchingCep ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </div>
              </div>
              {cepError ? (
                <p className="text-[11px] text-rose-600 font-medium mt-1">{cepError}</p>
              ) : (
                <p className="text-[10px] text-stone-500 mt-0.5">
                  Preenche rua, bairro e cidade automaticamente.
                </p>
              )}
            </div>

            {/* Rua / Logradouro */}
            <div className="sm:col-span-8">
              <Label htmlFor="address_street" className="text-xs font-bold text-stone-800">
                Rua / Logradouro <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="address_street"
                type="text"
                value={settings.address_street || ""}
                onChange={(e) => handleAddressFieldChange("address_street", e.target.value)}
                placeholder="Ex: Alameda Dois de Novembro ou Rua Principal"
                className="mt-1 text-xs bg-white rounded-lg h-9 border-stone-300 shadow-2xs"
              />
              <p className="text-[10px] text-stone-500 mt-0.5">
                Nome da via pública do seu estabelecimento.
              </p>
            </div>

            {/* Linha 2: Número (3 cols) + Complemento (4 cols) + Bairro (5 cols) */}
            <div className="sm:col-span-3">
              <Label htmlFor="address_number" className="text-xs font-bold text-stone-800">
                Número <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="address_number"
                type="text"
                value={settings.address_number || ""}
                onChange={(e) => handleAddressFieldChange("address_number", e.target.value)}
                placeholder="Ex: 44 ou S/N"
                className="mt-1 font-mono text-xs bg-white rounded-lg h-9 border-stone-300 shadow-2xs"
              />
              <p className="text-[10px] text-stone-500 mt-0.5">
                Número do imóvel.
              </p>
            </div>

            {/* Complemento */}
            <div className="sm:col-span-4">
              <Label htmlFor="address_complement" className="text-xs font-bold text-stone-800">
                Complemento (Opcional)
              </Label>
              <Input
                id="address_complement"
                type="text"
                value={settings.address_complement || ""}
                onChange={(e) => handleAddressFieldChange("address_complement", e.target.value)}
                placeholder="Ex: Loja 2, Fundos, Galpão A"
                className="mt-1 text-xs bg-white rounded-lg h-9 border-stone-300 shadow-2xs"
              />
              <p className="text-[10px] text-stone-500 mt-0.5">
                Informação adicional (sala, bloco, etc).
              </p>
            </div>

            {/* Bairro */}
            <div className="sm:col-span-5">
              <Label htmlFor="address_neighborhood" className="text-xs font-bold text-stone-800">
                Bairro <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="address_neighborhood"
                type="text"
                value={settings.address_neighborhood || ""}
                onChange={(e) => handleAddressFieldChange("address_neighborhood", e.target.value)}
                placeholder="Ex: Queluz, Centro"
                className="mt-1 text-xs bg-white rounded-lg h-9 border-stone-300 shadow-2xs"
              />
              <p className="text-[10px] text-stone-500 mt-0.5">
                Bairro onde a loja está situada.
              </p>
            </div>

            {/* Linha 3: Cidade (9 cols) + UF (3 cols) */}
            <div className="sm:col-span-9">
              <Label htmlFor="address_city" className="text-xs font-bold text-stone-800">
                Cidade <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="address_city"
                type="text"
                value={settings.address_city || ""}
                onChange={(e) => handleAddressFieldChange("address_city", e.target.value)}
                placeholder="Ex: Conselheiro Lafaiete"
                className="mt-1 text-xs bg-white font-medium rounded-lg h-9 border-stone-300 shadow-2xs"
              />
              <p className="text-[10px] text-stone-500 mt-0.5">
                Município sede do negócio.
              </p>
            </div>

            <div className="sm:col-span-3">
              <Label htmlFor="address_state" className="text-xs font-bold text-stone-800">
                UF (Estado) <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="address_state"
                type="text"
                value={settings.address_state || ""}
                onChange={(e) => handleAddressFieldChange("address_state", e.target.value.toUpperCase())}
                placeholder="MG"
                maxLength={2}
                className="mt-1 text-xs bg-white uppercase text-center font-bold rounded-lg h-9 border-stone-300 shadow-2xs"
              />
              <p className="text-[10px] text-stone-500 mt-0.5">
                Sigla UF (Ex: MG, SP, RJ).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
