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
