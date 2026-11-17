import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Category } from "@/entities/Category";
import { ProductionSector } from "@/entities/ProductionSector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber, formatToBRL } from "@/utils/moneyMask";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, ChevronUp, ChevronDown, Flame, Pizza, UtensilsCrossed } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { appConfirm } from "@/components/ui/ConfirmDialogHost";

const DEFAULT_PIZZA_SIZES = [
  { id: "broto", name: "Broto (4 fatias)", slices: 4, max_flavors: 1 },
  { id: "media", name: "Média (6 fatias)", slices: 6, max_flavors: 2 },
  { id: "grande", name: "Grande (8 fatias)", slices: 8, max_flavors: 2 },
  { id: "familia", name: "Família (12 fatias)", slices: 12, max_flavors: 3 },
];

export default function CategoriesPage() {
  const { slug } = useParams();
  const location = useLocation();
  const [categories, setCategories] = useState([]);
  const [productionSectors, setProductionSectors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    order_index: 0,
    type: "standard",
    pizza_sizes: [],
    sector_id: null,
  });

  useEffect(() => {
    setCategories([]);
    loadData();
  }, [slug, location.pathname]);

  const loadData = async () => {
    setIsLoading(true);
    const [categoriesData, sectorsData] = await Promise.all([
      Category.list("order_index"),
      ProductionSector.list("order_index").catch(() => []),
    ]);
    const sorted = Array.isArray(categoriesData)
      ? [...categoriesData].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0))
      : [];
    setCategories(sorted);
    setProductionSectors(Array.isArray(sectorsData) ? sectorsData : []);
    setIsLoading(false);
  };

  const handleMove = async (index, direction) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const newCategories = [...categories];
    const currentItem = newCategories[index];
    const targetItem = newCategories[targetIndex];

    // Inverte os itens de posição
    newCategories[index] = targetItem;
    newCategories[targetIndex] = currentItem;

    // Normaliza os números de ordem sequencialmente (1, 2, 3...)
    const updatedCategories = newCategories.map((cat, idx) => ({
      ...cat,
      order_index: idx + 1,
    }));

    // Feedback visual imediato
    setCategories(updatedCategories);

    try {
      await Promise.all([
        Category.update(currentItem.id, { order_index: targetIndex + 1 }),
        Category.update(targetItem.id, { order_index: index + 1 }),
      ]);
      toast.success(`"${currentItem.name}" movida para a ${targetIndex + 1}ª posição!`);
    } catch (err) {
      console.error("Erro ao reordenar categoria:", err);
      toast.error("Erro ao salvar nova ordem das categorias.");
      loadData();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const nextOrder = editingCategory 
        ? (Number(categoryForm.order_index) || 0)
        : (categories.length > 0 ? Math.max(...categories.map(c => Number(c.order_index) || 0)) + 1 : 1);

      const rawSizes = categoryForm.pizza_sizes?.length
        ? categoryForm.pizza_sizes
        : DEFAULT_PIZZA_SIZES;
      const sanitizedSizes = rawSizes.map((s) => {
        const parsedDefault =
          typeof s.default_price === "number"
            ? s.default_price
            : s.default_price
              ? parseBRLToNumber(String(s.default_price))
              : 0;
        return {
          ...s,
          default_price: Number.isFinite(parsedDefault) && parsedDefault > 0 ? parsedDefault : 0,
        };
      });

      const payload = {
        ...categoryForm,
        is_combo: false,
        sector_id: categoryForm.sector_id || null,
        order_index: nextOrder,
        type: categoryForm.type || "standard",
        pizza_sizes: categoryForm.type === "pizza" ? sanitizedSizes : [],
      };

      if (editingCategory) {
        await Category.update(editingCategory.id, payload);
        toast.success("Categoria atualizada com sucesso!");
      } else {
        await Category.create(payload);
        toast.success("Categoria criada com sucesso!");
      }

      setShowModal(false);
      resetForm();
      loadData();
    } catch (_error) {
      toast.error("Erro ao salvar categoria");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (categoryId) => {
    const ok = await appConfirm({
      title: "Excluir categoria?",
      description: "Tem certeza que deseja excluir esta categoria?",
      confirmText: "Excluir",
      variant: "danger",
    });
    if (ok) {
      try {
        await Category.delete(categoryId);
        toast.success("Categoria excluída com sucesso!");
        loadData();
      } catch (err) {
        toast.error("Erro ao excluir categoria.");
      }
    }
  };

  const resetForm = () => {
    const nextOrder = categories.length > 0 
      ? Math.max(...categories.map(c => Number(c.order_index) || 0)) + 1 
      : 1;

    setCategoryForm({
      name: "",
      order_index: nextOrder,
      type: "standard",
      pizza_sizes: [],
      sector_id: null,
    });
    setEditingCategory(null);
  };

  const openEditModal = (category) => {
    const isPizza = category.type === "pizza";
    setCategoryForm({
      name: category.name,
      order_index: category.order_index || 0,
      type: category.type || "standard",
      pizza_sizes: Array.isArray(category.pizza_sizes) && category.pizza_sizes.length > 0
        ? category.pizza_sizes
        : (isPizza ? DEFAULT_PIZZA_SIZES : []),
      sector_id: category.sector_id || null,
    });
    setEditingCategory(category);
    setShowModal(true);
  };

  const handleAddPizzaSize = () => {
    const newId = `size_${Date.now()}`;
    const newSize = {
      id: newId,
      name: "Novo Tamanho",
      slices: 8,
      max_flavors: 2,
    };
    setCategoryForm(prev => ({
      ...prev,
      pizza_sizes: [...(prev.pizza_sizes || []), newSize],
    }));
  };

  const handleUpdatePizzaSize = (idx, field, value) => {
    setCategoryForm(prev => {
      const nextSizes = [...(prev.pizza_sizes || [])];
      nextSizes[idx] = { ...nextSizes[idx], [field]: value };
      return { ...prev, pizza_sizes: nextSizes };
    });
  };

  const handleRemovePizzaSize = (idx) => {
    setCategoryForm(prev => ({
      ...prev,
      pizza_sizes: (prev.pizza_sizes || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="p-4 sm:p-8 bg-[#F7F9F8] min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Topo / Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
              Categorias do Cardápio
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 mt-1">
              Organize a ordem em que as categorias e produtos aparecem para os clientes.
            </p>
          </div>
          <Button 
            onClick={() => { resetForm(); setShowModal(true); }}
            className="bg-[#047857] hover:bg-[#065f46] text-white font-bold shadow-xs cursor-pointer h-10 px-4"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Categoria
          </Button>
        </div>

        {/* Lista de Categorias em Tabela / List View com Efeito Zebrado */}
        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
          {/* Cabeçalho das Colunas (Desktop) */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-4 px-6 py-3.5 bg-stone-100/80 border-b border-stone-200 text-xs font-bold text-stone-600 uppercase tracking-wider items-center">
            <div className="col-span-2 flex items-center gap-1.5">
              <span>Posição</span>
            </div>
            <div className="col-span-5">
              <span>Nome da Categoria</span>
            </div>
            <div className="col-span-3">
              <span>Tipo / Configuração</span>
            </div>
            <div className="col-span-2 text-right">
              <span>Ações</span>
            </div>
          </div>

          {/* Linhas com efeito zebrado (1 linha branca, 1 linha cinza/cor) */}
          <div className="divide-y divide-stone-100">
            <AnimatePresence initial={false}>
              {categories.map((category, index) => {
                const isEven = index % 2 === 0;
                const isFirst = index === 0;
                const isLast = index === categories.length - 1;

                return (
                  <motion.div
                    key={category.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className={`grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 items-center transition-colors ${
                      isEven ? "bg-white" : "bg-[#F8FAF9]"
                    } hover:bg-emerald-50/40`}
                  >
                    {/* Coluna 1: Posição e Botões de Subir / Descer */}
                    <div className="sm:col-span-2 flex items-center justify-between sm:justify-start gap-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMove(index, "up")}
                          disabled={isFirst}
                          title={isFirst ? "Primeira posição" : "Subir uma posição"}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                            isFirst
                              ? "text-stone-300 cursor-not-allowed bg-stone-100/50"
                              : "text-stone-700 bg-white hover:bg-[#047857] hover:text-white border border-stone-200 shadow-2xs active:scale-90 cursor-pointer"
                          }`}
                        >
                          <ChevronUp className="w-4 h-4 stroke-[2.5]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(index, "down")}
                          disabled={isLast}
                          title={isLast ? "Última posição" : "Descer uma posição"}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                            isLast
                              ? "text-stone-300 cursor-not-allowed bg-stone-100/50"
                              : "text-stone-700 bg-white hover:bg-[#047857] hover:text-white border border-stone-200 shadow-2xs active:scale-90 cursor-pointer"
                          }`}
                        >
                          <ChevronDown className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 pl-1">
                        <span className="font-mono text-xs font-black text-stone-800 bg-stone-200/80 px-2.5 py-1 rounded-md">
                          #{index + 1}
                        </span>
                        <span className="text-[11px] font-semibold text-stone-400 hidden xl:inline">
                          (ordem: {category.order_index})
                        </span>
                      </div>
                    </div>

                    {/* Coluna 2: Nome e Badges */}
                    <div className="sm:col-span-5 flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-stone-900 text-sm sm:text-base tracking-tight">
                        {category.name}
                      </span>

                      {category.type === "pizza" && (
                        <span className="inline-flex items-center gap-1 bg-amber-500 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs">
                          <Pizza className="w-3 h-3" />
                          Pizzas & Fracionados
                        </span>
                      )}

                      {category.sector_id && (() => {
                        const matchedSector = productionSectors.find((s) => String(s.id) === String(category.sector_id));
                        return matchedSector ? (
                          <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 border border-sky-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
                            <Flame className="w-3 h-3 text-sky-700" /> {matchedSector.name}
                          </span>
                        ) : null;
                      })()}
                    </div>

                    {/* Coluna 3: Tipo / Configuração */}
                    <div className="sm:col-span-3 text-xs">
                      {category.type === "pizza" ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-amber-900 bg-amber-100/70 border border-amber-200/80 px-2.5 py-1 rounded-lg">
                          <Pizza className="w-3.5 h-3.5 text-amber-700" />
                          {(category.pizza_sizes?.length || 4)} tamanhos cadastrados
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-stone-600 bg-stone-100/90 border border-stone-200/70 px-2.5 py-1 rounded-lg">
                          <UtensilsCrossed className="w-3.5 h-3.5 text-stone-500" />
                          Padrão (convencional)
                        </span>
                      )}
                    </div>

                    {/* Coluna 4: Ações */}
                    <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(category)}
                        className="h-8 px-2.5 text-xs border-stone-200 text-stone-700 hover:text-[#047857] hover:border-[#047857] hover:bg-[#D1E9DF]/20 cursor-pointer"
                        title="Editar categoria"
                      >
                        <Edit className="w-3.5 h-3.5 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(category.id)}
                        className="h-8 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                        title="Excluir categoria"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {categories.length === 0 && !isLoading && (
          <div className="text-center py-16 bg-white rounded-2xl border border-stone-200">
            <div className="text-4xl mb-3">📂</div>
            <h3 className="text-lg font-bold text-stone-900 mb-1">
              Nenhuma categoria encontrada
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto mb-4">
              Crie categorias para organizar seus produtos e pizzas no cardápio online.
            </p>
            <Button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="bg-[#047857] hover:bg-[#065f46] text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar Categoria
            </Button>
          </div>
        )}
        
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] p-0 flex flex-col overflow-hidden bg-[#F7F9F8] border-stone-200">
            <DialogHeader className="px-6 py-4 bg-white border-b border-stone-200 text-left shrink-0">
              <DialogTitle className="text-stone-900 font-bold text-lg">
                {editingCategory ? "Editar Categoria" : "Nova Categoria"}
              </DialogTitle>
              <p className="text-xs text-stone-500 mt-0.5">
                Configure o tipo, ordem no cardápio e setor de preparo
              </p>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-4 shadow-2xs">
                  <div>
                    <Label htmlFor="name" className="text-xs font-semibold text-stone-700">
                      Nome da categoria *
                    </Label>
                    <Input
                      id="name"
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm({...categoryForm, name: e.target.value})}
                      required
                      placeholder="Ex: Pizzas Tradicionais, Lanches, Bebidas..."
                      className="bg-stone-50/50 border-stone-200 focus:bg-white focus:border-[#047857] mt-1"
                    />
                  </div>

                  {/* Seletor do Tipo de Categoria: Padrão vs Pizza */}
                  <div>
                    <Label className="text-xs font-semibold text-stone-700 block mb-2">
                      Tipo de categoria
                    </Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCategoryForm({ ...categoryForm, type: "standard" })}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          categoryForm.type !== "pizza"
                            ? "border-[#047857] bg-[#D1E9DF]/25 ring-2 ring-[#047857]/15"
                            : "border-stone-200 hover:border-stone-300 bg-white"
                        }`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center mb-2">
                          <UtensilsCrossed className="w-3.5 h-3.5 text-[#047857]" />
                        </div>
                        <p className="font-bold text-xs text-stone-900 leading-tight">Produtos Padrão</p>
                        <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                          Lanches, bebidas, porções, sobremesas, açaí
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCategoryForm({ 
                          ...categoryForm, 
                          type: "pizza",
                          pizza_sizes: categoryForm.pizza_sizes?.length ? categoryForm.pizza_sizes : DEFAULT_PIZZA_SIZES
                        })}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          categoryForm.type === "pizza"
                            ? "border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/15"
                            : "border-stone-200 hover:border-stone-300 bg-white"
                        }`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200/70 flex items-center justify-center mb-2">
                          <Pizza className="w-3.5 h-3.5 text-amber-600" />
                        </div>
                        <p className="font-bold text-xs text-stone-900 leading-tight">Pizzas & Fracionados</p>
                        <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                          Permite metades (1/2 e 1/2), tamanhos e bordas
                        </p>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Seção Condicional: Tamanhos da Pizza */}
                {categoryForm.type === "pizza" && (
                  <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                      <div>
                        <h4 className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                          <Pizza className="w-3.5 h-3.5 text-amber-600" />
                          Tamanhos Disponíveis
                        </h4>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                          Discos, limite de sabores e preço padrão opcional
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAddPizzaSize}
                        className="h-7 text-xs border-stone-200 text-stone-700 hover:bg-stone-50 cursor-pointer font-semibold"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Adicionar
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {(categoryForm.pizza_sizes || []).map((size, idx) => (
                        <div 
                          key={size.id || idx}
                          className="flex items-center gap-2 bg-stone-50/70 p-2.5 rounded-xl border border-stone-200 text-xs"
                        >
                          <div className="flex-1 min-w-0">
                            <Label className="text-[10px] text-stone-500 font-semibold uppercase">Nome do Tamanho</Label>
                            <Input
                              value={size.name}
                              onChange={(e) => handleUpdatePizzaSize(idx, "name", e.target.value)}
                              placeholder="Ex: Grande (8 fatias)"
                              className="h-7 text-xs mt-0.5 bg-white"
                            />
                          </div>

                          <div className="w-16">
                            <Label className="text-[10px] text-stone-500 font-semibold uppercase">Fatias</Label>
                            <Input
                              type="number"
                              value={size.slices}
                              onChange={(e) => handleUpdatePizzaSize(idx, "slices", parseInt(e.target.value) || 1)}
                              className="h-7 text-xs mt-0.5 bg-white"
                              min={1}
                            />
                          </div>

                          <div className="w-20">
                            <Label className="text-[10px] text-stone-500 font-semibold uppercase">Sabores</Label>
                            <Input
                              type="number"
                              value={size.max_flavors}
                              onChange={(e) => handleUpdatePizzaSize(idx, "max_flavors", parseInt(e.target.value) || 1)}
                              className="h-7 text-xs mt-0.5 bg-white"
                              min={1}
                              max={4}
                            />
                          </div>

                          <div className="w-24">
                            <Label className="text-[10px] text-stone-500 font-semibold uppercase">Padrão</Label>
                            <CurrencyInput
                              value={
                                typeof size.default_price === "number"
                                  ? (size.default_price > 0 ? formatToBRL(size.default_price) : "")
                                  : (size.default_price || "")
                              }
                              onChange={(e) => handleUpdatePizzaSize(idx, "default_price", e.target.value)}
                              placeholder="Opcional"
                              className="h-7 text-xs mt-0.5 bg-white font-mono"
                            />
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemovePizzaSize(idx)}
                            className="h-7 w-7 text-stone-400 hover:text-rose-600 mt-3 cursor-pointer shrink-0"
                            title="Remover tamanho"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Bloco 3: Ordem & Setor */}
                <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-3.5 shadow-2xs">
                  <div>
                    <Label htmlFor="order" className="text-xs font-semibold text-stone-700">
                      Ordem de exibição
                    </Label>
                    <Input
                      id="order"
                      type="number"
                      value={categoryForm.order_index}
                      onChange={(e) => setCategoryForm({...categoryForm, order_index: parseInt(e.target.value) || 0})}
                      className="bg-stone-50/50 border-stone-200 focus:bg-white focus:border-[#047857] mt-1 font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-stone-700">
                      Setor de Preparo (Impressão & KDS)
                    </Label>
                    <Select
                      value={categoryForm.sector_id || "__none__"}
                      onValueChange={(value) =>
                        setCategoryForm({ ...categoryForm, sector_id: value === "__none__" ? null : value })
                      }
                    >
                      <SelectTrigger className="bg-stone-50/50 border-stone-200 focus:border-[#047857] mt-1">
                        <SelectValue placeholder="Padrão / Nenhum setor específico" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum setor específico</SelectItem>
                        {productionSectors.map((sec) => (
                          <SelectItem key={sec.id} value={String(sec.id)}>
                            {sec.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-stone-500 mt-1">
                      Todos os produtos desta categoria irão automaticamente para este setor (a menos que você altere no produto).
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-3.5 bg-white border-t border-stone-200 flex items-center justify-end gap-2.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {setShowModal(false); resetForm();}}
                  className="h-9 px-4 text-xs border-stone-300 text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-9 px-5 text-xs bg-[#047857] hover:bg-[#065f46] text-white font-bold cursor-pointer"
                >
                  {isSubmitting ? "Salvando..." : "Salvar Categoria"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}