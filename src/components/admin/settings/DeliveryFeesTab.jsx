import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Search,
  Loader2,
  Bike,
  Plus,
  DollarSign,
  Gift,
  Download,
  CheckSquare,
  Square,
  Sparkles,
  Check,
  X,
  Edit2,
  Trash2,
  AlertCircle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatToBRL } from "@/utils/moneyMask";

export default function DeliveryFeesTab({
  settings,
  handleInputChange,
  // Bairros e Taxas
  newNeighborhood,
  setNewNeighborhood,
  handleAddNeighborhood,
  handleRemoveNeighborhood,
  handleToggleNeighborhood,
  // Edição inline
  editingNeighborhoodId,
  setEditingNeighborhoodId,
  editingNeighborhoodFee,
  setEditingNeighborhoodFee,
  handleSaveInlineFee,
  // Seleção e alteração em lote
  neighborhoodSearchTerm,
  setNeighborhoodSearchTerm,
  selectedNeighborhoodIds,
  handleToggleSelectNeighborhood,
  handleToggleSelectAllFiltered,
  bulkApplyFee,
  setBulkApplyFee,
  handleApplyBulkFee,
  // Sugestões e importação oficial
  cityNeighborhoodsList,
  isFetchingCityNeighborhoods,
  cityNeighborhoodsError,
  handleFetchOfficialNeighborhoods,
  showNeighborhoodSuggestions,
  setShowNeighborhoodSuggestions,
  isImportModalOpen,
  setIsImportModalOpen,
  importSearchTerm,
  setImportSearchTerm,
  selectedNeighborhoodToImport,
  handleToggleImportSelection,
  handleSelectAllImport,
  batchFee,
  setBatchFee,
  handleBatchImportNeighborhoods,
}) {
  const neighborhoods = settings.delivery_neighborhoods || [];

  const filteredNeighborhoods = neighborhoods.filter((n) =>
    (n.name || "").toLowerCase().includes(neighborhoodSearchTerm.toLowerCase().trim())
  );

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-stone-900">
            Regras de Entrega & Taxas de Delivery
          </CardTitle>
          <p className="text-xs text-stone-500">
            Escolha como seu delivery cobra taxas e atende os bairros da sua cidade.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {settings.accepts_delivery === false && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-amber-900">
                  O serviço de Delivery está desativado nas Configurações Gerais
                </h4>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Seus clientes atualmente só conseguem pedir para <strong>Retirada no Balcão</strong>. As taxas e bairros configurados abaixo só serão cobrados se você reativar o Delivery na aba <strong>Geral & Loja</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Seletor de Tipo de Taxa */}
          <div>
            <Label className="text-sm font-bold text-stone-800 block mb-2">
              Modelo de Cobrança de Entrega
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleInputChange("delivery_fee_type", "fixed")}
                className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  settings.delivery_fee_type === "fixed"
                    ? "border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20 shadow-xs"
                    : "border-stone-200 bg-white hover:border-stone-300"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    settings.delivery_fee_type === "fixed"
                      ? "bg-rose-600 text-white"
                      : "bg-stone-100 text-stone-600"
                  }`}
                >
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-stone-900">Taxa Fixa Única</div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    O mesmo valor para qualquer entrega na cidade.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleInputChange("delivery_fee_type", "neighborhood")}
                className={`p-4 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                  settings.delivery_fee_type === "neighborhood"
                    ? "border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20 shadow-xs"
                    : "border-stone-200 bg-white hover:border-stone-300"
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    settings.delivery_fee_type === "neighborhood"
                      ? "bg-rose-600 text-white"
                      : "bg-stone-100 text-stone-600"
                  }`}
                >
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-stone-900 flex items-center gap-1.5">
                    <span>Taxa por Bairro</span>
                    <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                      Recomendado
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    Defina o valor para cada bairro atendido com busca tolerante a erros.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Taxa Fixa */}
          {settings.delivery_fee_type === "fixed" && (
            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200/80">
              <Label htmlFor="delivery_fee" className="text-sm font-semibold text-stone-800">
                Valor da Taxa Fixa (R$)
              </Label>
              <CurrencyInput
                id="delivery_fee"
                value={settings.delivery_fee}
                onChange={(e) => handleInputChange("delivery_fee", e.target.value)}
                placeholder="R$ 0,00"
                className="mt-1.5 max-w-xs font-semibold bg-white"
              />
              <p className="text-[11px] text-stone-500 mt-1">
                Este valor será cobrado em todos os pedidos com entrega delivery.
              </p>
            </div>
          )}

          {/* Taxa Por Bairro */}
          {settings.delivery_fee_type === "neighborhood" && (
            <div className="space-y-5">
              {/* Banner Cidade Base */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-2xl shadow-sm border border-stone-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-600/30 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>
                        Cidade Base: {settings.address_city || "Não informada"} - {settings.address_state || "MG"}
                      </span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Ativa
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-300 mt-0.5">
                      {settings.address_city
                        ? `Entregas e bairros vinculados a ${settings.address_city}. Endereços de outras cidades serão bloqueados no checkout.`
                        : "Configure a Cidade da loja na aba 'Geral' para ativar a trava regional."}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => handleFetchOfficialNeighborhoods(true)}
                  disabled={isFetchingCityNeighborhoods || !settings.address_city}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-md flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isFetchingCityNeighborhoods ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Localizando bairros...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Carregar Bairros de {settings.address_city || "sua Cidade"}</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Dica de inteligência */}
              <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Validação Inteligente Ativada:</strong> O sistema tolera acentos, maiúsculas, abreviações (<em>Jd., Vl., Sto.</em>) e até <strong>2 letras trocadas</strong> pelo cliente.
                </span>
              </div>

              {/* Formulário para Cadastrar Bairro */}
              <div className="p-4 bg-stone-50/70 border border-stone-200 rounded-xl space-y-3">
                <div className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-rose-600" />
                  <span>Cadastrar Novo Bairro Atendido</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-7 relative">
                    <Label htmlFor="nh-name" className="text-xs font-semibold text-stone-700 flex items-center justify-between">
                      <span>Nome do Bairro</span>
                      {cityNeighborhoodsList.length > 0 && (
                        <span className="text-[10px] text-stone-400 font-normal">
                          {cityNeighborhoodsList.length} oficiais disponíveis
                        </span>
                      )}
                    </Label>
                    <Input
                      id="nh-name"
                      type="text"
                      value={newNeighborhood.name}
                      onChange={(e) => {
                        setNewNeighborhood((prev) => ({ ...prev, name: e.target.value }));
                        setShowNeighborhoodSuggestions(true);
                      }}
                      onFocus={() => {
                        if (cityNeighborhoodsList.length === 0 && settings.address_city) {
                          handleFetchOfficialNeighborhoods(false);
                        }
                        setShowNeighborhoodSuggestions(true);
                      }}
                      placeholder="Ex: Centro, Jardim América, Bela Vista"
                      className="mt-1 bg-white text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddNeighborhood();
                          setShowNeighborhoodSuggestions(false);
                        }
                      }}
                    />

                    {/* Sugestões Dropdown */}
                    {showNeighborhoodSuggestions && newNeighborhood.name.trim().length > 1 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-20 max-h-48 overflow-y-auto divide-y divide-stone-100">
                        {cityNeighborhoodsList
                          .filter((item) =>
                            item.toLowerCase().includes(newNeighborhood.name.toLowerCase().trim())
                          )
                          .slice(0, 10)
                          .map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => {
                                setNewNeighborhood((prev) => ({ ...prev, name: item }));
                                setShowNeighborhoodSuggestions(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 hover:text-rose-700 flex items-center justify-between transition-colors"
                            >
                              <span>{item}</span>
                              <span className="text-[10px] text-stone-400">Oficial</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <Label htmlFor="nh-fee" className="text-xs font-semibold text-stone-700">
                      Taxa de Entrega (R$)
                    </Label>
                    <CurrencyInput
                      id="nh-fee"
                      value={newNeighborhood.fee}
                      onChange={(e) =>
                        setNewNeighborhood((prev) => ({ ...prev, fee: e.target.value }))
                      }
                      placeholder="R$ 0,00"
                      className="mt-1 bg-white text-sm font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      onClick={() => {
                        handleAddNeighborhood();
                        setShowNeighborhoodSuggestions(false);
                      }}
                      disabled={!newNeighborhood.name.trim()}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-9 rounded-xl shadow-xs cursor-pointer"
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              </div>

              {/* Tabela e Ferramentas em Lote */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-800">
                      Bairros Cadastrados ({neighborhoods.length})
                    </span>
                    {selectedNeighborhoodIds.size > 0 && (
                      <span className="text-[11px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
                        {selectedNeighborhoodIds.size} selecionado(s)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <Input
                        type="text"
                        value={neighborhoodSearchTerm}
                        onChange={(e) => setNeighborhoodSearchTerm(e.target.value)}
                        placeholder="Filtrar bairro..."
                        className="h-8 pl-8 text-xs w-44 bg-white rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                {/* Barra de ação em lote */}
                {selectedNeighborhoodIds.size > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
                    <div className="text-xs font-bold text-amber-900">
                      Alterar taxa dos {selectedNeighborhoodIds.size} bairros selecionados:
                    </div>
                    <div className="flex items-center gap-2">
                      <CurrencyInput
                        value={bulkApplyFee}
                        onChange={(e) => setBulkApplyFee(e.target.value)}
                        placeholder="Novo valor R$"
                        className="h-8 w-28 text-xs bg-white font-semibold rounded-lg"
                      />
                      <Button
                        type="button"
                        onClick={handleApplyBulkFee}
                        disabled={!bulkApplyFee}
                        className="bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs font-bold px-3 rounded-lg"
                      >
                        Aplicar a Todos
                      </Button>
                    </div>
                  </div>
                )}

                {/* Tabela de Bairros */}
                <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <div className="max-h-80 overflow-y-auto divide-y divide-stone-100">
                    {filteredNeighborhoods.length === 0 ? (
                      <div className="py-8 text-center text-xs text-stone-400">
                        Nenhum bairro cadastrado ou encontrado com este filtro.
                      </div>
                    ) : (
                      <>
                        <div className="p-2.5 bg-stone-50 text-[11px] font-bold text-stone-500 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectAllFiltered(filteredNeighborhoods)}
                            className="flex items-center gap-1.5 hover:text-stone-800 cursor-pointer"
                          >
                            {selectedNeighborhoodIds.size === filteredNeighborhoods.length && filteredNeighborhoods.length > 0 ? (
                              <CheckSquare className="w-3.5 h-3.5 text-rose-600" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-stone-400" />
                            )}
                            <span>Selecionar Visíveis</span>
                          </button>
                          <span>Ações e Valores</span>
                        </div>

                        {filteredNeighborhoods.map((n) => {
                          const isSelected = selectedNeighborhoodIds.has(n.id);
                          const isEditing = editingNeighborhoodId === n.id;

                          return (
                            <div
                              key={n.id}
                              className={`p-3 flex items-center justify-between gap-3 transition-colors ${
                                isSelected ? "bg-rose-50/50" : "hover:bg-stone-50/70"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectNeighborhood(n.id)}
                                  className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                                />
                                <div>
                                  <span className={`text-xs font-bold block ${n.active !== false ? "text-stone-800" : "text-stone-400 line-through"}`}>
                                    {n.name}
                                  </span>
                                  <span className="text-[10px] text-stone-400">
                                    {n.active !== false ? "Ativo" : "Pausado temporariamente"}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <CurrencyInput
                                      value={editingNeighborhoodFee}
                                      onChange={(e) => setEditingNeighborhoodFee(e.target.value)}
                                      className="h-7 w-24 text-xs font-bold bg-white"
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveInlineFee(n.id)}
                                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                      title="Salvar"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingNeighborhoodId(null)}
                                      className="p-1 text-stone-400 hover:bg-stone-100 rounded"
                                      title="Cancelar"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNeighborhoodId(n.id);
                                        setEditingNeighborhoodFee(formatToBRL(n.fee || 0));
                                      }}
                                      className="text-xs font-bold text-stone-800 bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer"
                                      title="Clique para editar taxa"
                                    >
                                      <span>{formatToBRL(n.fee || 0)}</span>
                                      <Edit2 className="w-3 h-3 text-stone-400" />
                                    </button>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleToggleNeighborhood(n.id)}
                                      className={`h-7 px-2 text-[11px] font-bold rounded ${
                                        n.active !== false
                                          ? "text-emerald-700 hover:bg-emerald-50"
                                          : "text-amber-700 hover:bg-amber-50"
                                      }`}
                                    >
                                      {n.active !== false ? "Pausar" : "Ativar"}
                                    </Button>

                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRemoveNeighborhood(n.id)}
                                      className="h-7 w-7 p-0 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Política de Bairros Não Listados */}
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
                <Label className="text-xs font-bold text-stone-800 block">
                  Se o cliente digitar um bairro que NÃO está na lista acima:
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs ${
                      settings.delivery_unlisted_policy === "block"
                        ? "bg-rose-50 border-rose-400 font-bold text-rose-950"
                        : "bg-white border-stone-200 text-stone-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="unlisted_policy"
                      checked={settings.delivery_unlisted_policy === "block"}
                      onChange={() => handleInputChange("delivery_unlisted_policy", "block")}
                      className="accent-rose-600"
                    />
                    <span>Bloquear pedido e avisar que não entrega nesse bairro</span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs ${
                      settings.delivery_unlisted_policy === "fallback"
                        ? "bg-rose-50 border-rose-400 font-bold text-rose-950"
                        : "bg-white border-stone-200 text-stone-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="unlisted_policy"
                      checked={settings.delivery_unlisted_policy === "fallback"}
                      onChange={() => handleInputChange("delivery_unlisted_policy", "fallback")}
                      className="accent-rose-600"
                    />
                    <span>Permitir e cobrar taxa padrão de:</span>
                    {settings.delivery_unlisted_policy === "fallback" && (
                      <CurrencyInput
                        value={settings.delivery_fallback_fee}
                        onChange={(e) => handleInputChange("delivery_fallback_fee", e.target.value)}
                        className="h-7 w-20 text-xs font-bold bg-white"
                      />
                    )}
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Frete Grátis e Pedido Mínimo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-stone-100">
            <div>
              <Label htmlFor="free_delivery_threshold" className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-emerald-600" />
                <span>Frete Grátis a partir de (R$)</span>
              </Label>
              <CurrencyInput
                id="free_delivery_threshold"
                value={settings.free_delivery_threshold}
                onChange={(e) => handleInputChange("free_delivery_threshold", e.target.value)}
                placeholder="R$ 0,00 (Deixe zerado para desativar)"
                className="mt-1 font-semibold bg-white text-sm"
              />
              <p className="text-[11px] text-stone-400 mt-1">
                Zera a taxa automaticamente se o pedido atingir este valor.
              </p>
            </div>

            <div>
              <Label htmlFor="min_order_value" className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Bike className="w-3.5 h-3.5 text-stone-600" />
                <span>Valor Mínimo para Pedidos (R$)</span>
              </Label>
              <CurrencyInput
                id="min_order_value"
                value={settings.min_order_value}
                onChange={(e) => handleInputChange("min_order_value", e.target.value)}
                placeholder="R$ 0,00"
                className="mt-1 font-semibold bg-white text-sm"
              />
              <p className="text-[11px] text-stone-400 mt-1">
                Impede o cliente de finalizar pedidos com valor abaixo deste.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Importação Oficial de Bairros por Cidade */}
      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-5 sm:p-6 rounded-3xl bg-white text-stone-900 shadow-2xl border border-stone-200 z-[70]">
          <DialogHeader className="pb-3 border-b border-stone-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg sm:text-xl font-black text-stone-900 tracking-tight">
                  Bairros de {settings.address_city || "sua Cidade"} ({settings.address_state || "MG"})
                </DialogTitle>
                <p className="text-xs text-stone-500 mt-0.5">
                  Selecione os bairros que seu restaurante atende e defina uma taxa padrão para adicionar de uma vez.
                </p>
              </div>
            </div>
          </DialogHeader>

          {isFetchingCityNeighborhoods ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-rose-600 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-stone-800">Consultando base oficial de bairros...</p>
              <p className="text-xs text-stone-500">Isso pode levar alguns segundos na primeira consulta.</p>
            </div>
          ) : cityNeighborhoodsError ? (
            <div className="py-10 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="text-sm font-semibold text-stone-800">{cityNeighborhoodsError}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleFetchOfficialNeighborhoods(true)}
                className="rounded-xl text-xs"
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-3.5 bg-stone-50 rounded-2xl border border-stone-200">
                <div className="sm:col-span-8">
                  <Label className="text-xs font-bold text-stone-700">Filtrar Bairro</Label>
                  <div className="relative mt-1">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      value={importSearchTerm}
                      onChange={(e) => setImportSearchTerm(e.target.value)}
                      placeholder="Buscar por nome..."
                      className="pl-8 bg-white h-9 text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <Label className="text-xs font-bold text-stone-700">Taxa Padrão (R$)</Label>
                  <CurrencyInput
                    value={batchFee}
                    onChange={(e) => setBatchFee(e.target.value)}
                    placeholder="R$ 7,00"
                    className="mt-1 bg-white h-9 text-xs rounded-xl"
                  />
                </div>
              </div>

              {(() => {
                const filtered = cityNeighborhoodsList.filter((nh) =>
                  nh.toLowerCase().includes(importSearchTerm.toLowerCase().trim())
                );
                const existingNames = new Set(
                  neighborhoods.map((n) => (n.name || "").toLowerCase().trim())
                );

                return (
                  <>
                    <div className="flex items-center justify-between text-xs px-1">
                      <button
                        type="button"
                        onClick={() => handleSelectAllImport(filtered)}
                        className="font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {selectedNeighborhoodToImport.size === filtered.length && filtered.length > 0 ? (
                          <>
                            <CheckSquare className="w-4 h-4" /> Desmarcar todos
                          </>
                        ) : (
                          <>
                            <Square className="w-4 h-4" /> Selecionar todos os {filtered.length}
                          </>
                        )}
                      </button>
                      <span className="text-stone-500 font-medium">
                        {selectedNeighborhoodToImport.size} selecionado(s) de {filtered.length}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto border border-stone-200 rounded-2xl divide-y divide-stone-100 max-h-64 p-1 bg-white shadow-2xs">
                      {filtered.length === 0 ? (
                        <div className="py-8 text-center text-xs text-stone-500">
                          Nenhum bairro encontrado com o filtro "{importSearchTerm}".
                        </div>
                      ) : (
                        filtered.map((name) => {
                          const isAlreadyAdded = existingNames.has(name.toLowerCase().trim());
                          const isSelected = selectedNeighborhoodToImport.has(name);

                          return (
                            <label
                              key={name}
                              className={`p-2.5 px-3 flex items-center justify-between rounded-xl cursor-pointer transition-colors ${
                                isAlreadyAdded
                                  ? "opacity-40 bg-stone-50 cursor-not-allowed"
                                  : isSelected
                                  ? "bg-rose-50/70 text-rose-900 font-semibold"
                                  : "hover:bg-stone-50 text-stone-800"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  disabled={isAlreadyAdded}
                                  checked={isSelected}
                                  onChange={() => handleToggleImportSelection(name)}
                                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                                />
                                <span className="text-xs">{name}</span>
                              </div>
                              {isAlreadyAdded && (
                                <span className="text-[10px] bg-stone-200 text-stone-600 font-bold px-2 py-0.5 rounded-full">
                                  Já cadastrado
                                </span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsImportModalOpen(false)}
                        className="rounded-xl text-xs h-10 px-4"
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        onClick={handleBatchImportNeighborhoods}
                        disabled={selectedNeighborhoodToImport.size === 0}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-10 px-5 rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar {selectedNeighborhoodToImport.size} Bairro(s) à Loja</span>
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
