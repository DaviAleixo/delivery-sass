import React, { useState } from "react";
import { toast } from "sonner";
import { ComplementGroup, ComplementItem } from "@/entities";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { Plus, Trash2, Check, Layers, Loader2, Sparkles } from "lucide-react";

/**
 * QuickComplementModal
 * Permite criar um grupo de complementos e suas opções instantaneamente
 * sem precisar sair do cadastro/edição do produto.
 */
export default function QuickComplementModal({ open, onOpenChange, onSuccess, existingGroupsCount = 0 }) {
  const [isSaving, setIsSaving] = useState(false);
  const [groupData, setGroupData] = useState({
    name: "",
    description: "",
    is_size_selector: true, // Escolha Única por padrão (o caso mais comum para sabores, tamanhos e tipos)
    min_quantity: 1,
    max_quantity: 1,
    required: true,
  });

  const [itemsList, setItemsList] = useState([
    { id: "1", name: "", price: "" },
    { id: "2", name: "", price: "" },
  ]);

  const resetState = () => {
    setGroupData({
      name: "",
      description: "",
      is_size_selector: true,
      min_quantity: 1,
      max_quantity: 1,
      required: true,
    });
    setItemsList([
      { id: `opt_${Date.now()}_1`, name: "", price: "" },
      { id: `opt_${Date.now()}_2`, name: "", price: "" },
    ]);
  };

  const handleAddItem = () => {
    setItemsList((prev) => [
      ...prev,
      { id: `opt_${Date.now()}_${prev.length + 1}`, name: "", price: "" },
    ]);
  };

  const handleUpdateItem = (index, field, value) => {
    setItemsList((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveItem = (index) => {
    if (itemsList.length <= 1) {
      toast.info("O grupo precisa de pelo menos uma opção.");
      return;
    }
    setItemsList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedName = groupData.name.trim();
    if (!trimmedName) {
      toast.error("Informe o nome do grupo de complementos.");
      return;
    }

    const validItems = itemsList
      .map((item) => ({
        name: item.name.trim(),
        price: parseBRLToNumber(item.price) || 0,
      }))
      .filter((item) => item.name !== "");

    if (validItems.length === 0) {
      toast.error("Adicione pelo menos uma opção com nome para este grupo.");
      return;
    }

    setIsSaving(true);
    try {
      const isSize = Boolean(groupData.is_size_selector);
      const groupPayload = {
        name: trimmedName,
        description: groupData.description.trim(),
        is_size_selector: isSize,
        min_quantity: isSize ? 1 : Math.max(0, parseInt(groupData.min_quantity) || 0),
        max_quantity: isSize ? 1 : Math.max(1, parseInt(groupData.max_quantity) || 1),
        free_quantity: 0,
        required: isSize ? true : Boolean(parseInt(groupData.min_quantity) > 0 || groupData.required),
        active: true,
        is_pizza_crust: false,
        order_index: existingGroupsCount + 1,
      };

      // 1. Criar o grupo
      const createdGroup = await ComplementGroup.create(groupPayload);
      if (!createdGroup?.id) {
        throw new Error("Falha ao criar o grupo de complementos.");
      }

      // 2. Criar as opções/itens vinculados ao grupo recém-criado
      const createdItems = await Promise.all(
        validItems.map((item, idx) =>
          ComplementItem.create({
            group_id: createdGroup.id,
            name: item.name,
            description: "",
            price: item.price,
            max_quantity: 1,
            active: true,
            order_index: idx + 1,
          })
        )
      );

      toast.success(`Grupo "${createdGroup.name}" criado com sucesso!`);

      if (onSuccess) {
        await onSuccess(createdGroup, createdItems);
      }

      resetState();
      onOpenChange(false);
    } catch (err) {
      console.error("Erro ao criar complemento rápido:", err);
      toast.error("Erro ao salvar o grupo de complementos.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val && !isSaving) {
          resetState();
        }
        onOpenChange(val);
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-[#F7F9F8] rounded-2xl">
        <DialogHeader className="p-5 bg-white border-b border-stone-200">
          <DialogTitle className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#047857]" />
            Criar Grupo de Complementos
          </DialogTitle>
          <DialogDescription className="text-xs text-stone-500">
            Crie o grupo e suas opções agora mesmo. Ele será vinculado automaticamente a este produto.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Bloco 1: Identificação */}
            <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-2xs space-y-3">
              <div>
                <Label htmlFor="quick-grp-name" className="text-xs font-semibold text-stone-700">
                  Nome do Grupo *
                </Label>
                <Input
                  id="quick-grp-name"
                  value={groupData.name}
                  onChange={(e) => setGroupData({ ...groupData, name: e.target.value })}
                  placeholder="Ex: Sabor do Suco, Turbinar Hambúrguer, Ponto da Carne..."
                  className="h-9 text-xs mt-1 bg-stone-50/50 focus:bg-white border-stone-200"
                  required
                />
              </div>

              <div>
                <Label htmlFor="quick-grp-desc" className="text-xs font-semibold text-stone-700">
                  Anotação Interna (Opcional)
                </Label>
                <Input
                  id="quick-grp-desc"
                  value={groupData.description}
                  onChange={(e) => setGroupData({ ...groupData, description: e.target.value })}
                  placeholder="Ex: Opções de sucos para lanches — visível apenas para você"
                  className="h-9 text-xs mt-1 bg-stone-50/50 focus:bg-white border-stone-200"
                />
                <span className="text-[10px] text-stone-400 mt-0.5 block">
                  Ajuda você a identificar este grupo no painel administrativo.
                </span>
              </div>
            </div>

            {/* Bloco 2: Regra de Escolha do Cliente */}
            <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-2xs space-y-2">
              <Label className="text-xs font-semibold text-stone-700 block">
                Como o cliente escolhe? *
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Tipo 1: Escolha Única */}
                <button
                  type="button"
                  onClick={() =>
                    setGroupData((prev) => ({
                      ...prev,
                      is_size_selector: true,
                      min_quantity: 1,
                      max_quantity: 1,
                      required: true,
                    }))
                  }
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    groupData.is_size_selector
                      ? "border-[#047857] bg-emerald-50/30 ring-1 ring-[#047857] shadow-2xs"
                      : "border-stone-200 bg-white hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                      <span className="text-xs">🔘</span> Escolha Única
                    </span>
                    {groupData.is_size_selector && <Check className="w-3.5 h-3.5 text-[#047857]" />}
                  </div>
                  <p className="text-[11px] text-stone-500 leading-snug">
                    O cliente é obrigado a escolher exatamente 1 opção (ex: Sabor, Ponto da Carne, Coca Normal ou Zero).
                  </p>
                </button>

                {/* Tipo 2: Múltipla Escolha */}
                <button
                  type="button"
                  onClick={() =>
                    setGroupData((prev) => ({
                      ...prev,
                      is_size_selector: false,
                      min_quantity: 0,
                      max_quantity: 5,
                      required: false,
                    }))
                  }
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    !groupData.is_size_selector
                      ? "border-[#047857] bg-emerald-50/30 ring-1 ring-[#047857] shadow-2xs"
                      : "border-stone-200 bg-white hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                      <span className="text-xs">➕</span> Múltipla Escolha
                    </span>
                    {!groupData.is_size_selector && <Check className="w-3.5 h-3.5 text-[#047857]" />}
                  </div>
                  <p className="text-[11px] text-stone-500 leading-snug">
                    O cliente pode escolher vários itens adicionais ou nenhum (ex: Bacon extra, Queijo, Molho especial).
                  </p>
                </button>
              </div>

              {!groupData.is_size_selector && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <Label className="text-[11px] font-semibold text-stone-600">Qtd. Mínima</Label>
                    <Input
                      type="number"
                      min={0}
                      value={groupData.min_quantity}
                      onChange={(e) => setGroupData({ ...groupData, min_quantity: e.target.value })}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-stone-600">Qtd. Máxima</Label>
                    <Input
                      type="number"
                      min={1}
                      value={groupData.max_quantity}
                      onChange={(e) => setGroupData({ ...groupData, max_quantity: e.target.value })}
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bloco 3: Opções / Itens do Grupo */}
            <div className="bg-white p-4 rounded-xl border border-stone-200/90 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold text-stone-700 block">
                    Opções deste Grupo ({itemsList.length}) *
                  </Label>
                  <p className="text-[10px] text-stone-400">
                    Defina o nome de cada opção e o preço (deixe R$ 0,00 se for grátis ou já inclusa).
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddItem}
                  className="h-7 text-xs border-stone-200 bg-white hover:bg-stone-50 text-stone-700 cursor-pointer"
                >
                  <Plus className="w-3 h-3 mr-1" /> Adicionar Opção
                </Button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {itemsList.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-200/80 text-xs"
                  >
                    <div className="flex-1 min-w-0">
                      <Input
                        value={item.name}
                        onChange={(e) => handleUpdateItem(idx, "name", e.target.value)}
                        placeholder={`Ex: Opção ${idx + 1} (Uva, Laranja, Bacon...)`}
                        className="h-8 text-xs bg-white border-stone-200"
                        required
                      />
                    </div>

                    <div className="w-28 shrink-0">
                      <CurrencyInput
                        value={item.price}
                        onChange={(e) => handleUpdateItem(idx, "price", e.target.value)}
                        placeholder="R$ 0,00"
                        className="h-8 text-xs bg-white border-stone-200 font-mono"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveItem(idx)}
                      className="h-8 w-8 text-stone-400 hover:text-rose-600 cursor-pointer shrink-0"
                      title="Remover opção"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Rodapé com Ações */}
          <div className="p-4 bg-white border-t border-stone-200 flex items-center justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="h-9 px-4 text-xs border-stone-200 text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="h-9 px-4 text-xs font-bold bg-[#047857] hover:bg-[#065f46] text-white cursor-pointer shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Salvar e Vincular ao Produto
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
