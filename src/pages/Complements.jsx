import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { ComplementGroup, ComplementItem, ProductComplementGroup, Product, Category } from "@/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Plus, 
  Layers, 
  Edit3, 
  Trash2, 
  ListPlus, 
  Link2, 
  AlertCircle 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ComplementsPage() {
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [productGroups, setProductGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modais
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    min_quantity: 0,
    max_quantity: 1,
    required: false,
    active: true,
  });

  const [showItemsModal, setShowItemsModal] = useState(false);
  const [activeGroupForItems, setActiveGroupForItems] = useState(null);
  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    price: "",
    max_quantity: 1,
    active: true,
  });

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [activeGroupForLink, setActiveGroupForLink] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [filterCategory, setFilterCategory] = useState("all");
  const [isSaving, setIsSaving] = useState(false);

  const { slug } = useParams();
  const location = useLocation();

  useEffect(() => {
    setGroups([]);
    setItems([]);
    setProductGroups([]);
    setProducts([]);
    setCategories([]);
    loadAllData();
  }, [slug, location.pathname]);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [groupsData, itemsData, pgData, prodsData, catsData] = await Promise.all([
        ComplementGroup.list("order_index", 100),
        ComplementItem.list("order_index", 300),
        ProductComplementGroup.list("-created_date", 500),
        Product.list("name", 200),
        Category.list("order_index", 50),
      ]);
      setGroups(groupsData || []);
      setItems(itemsData || []);
      setProductGroups(pgData || []);
      setProducts(prodsData || []);
      setCategories(catsData || []);
    } catch (err) {
      console.error("Erro ao carregar complementos:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Gestão de Grupo ---
  const handleOpenCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm({
      name: "",
      description: "",
      min_quantity: 0,
      max_quantity: 1,
      required: false,
      active: true,
    });
    setShowGroupModal(true);
  };

  const handleOpenEditGroup = (group) => {
    setEditingGroup(group);
    setGroupForm({
      name: group.name,
      description: group.description || "",
      min_quantity: group.min_quantity || 0,
      max_quantity: group.max_quantity || 1,
      required: Boolean(group.required || group.min_quantity > 0),
      active: group.active !== false,
    });
    setShowGroupModal(true);
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;

    setIsSaving(true);
    try {
      const payload = {
        name: groupForm.name.trim(),
        description: groupForm.description.trim(),
        min_quantity: parseInt(groupForm.min_quantity) || 0,
        max_quantity: Math.max(1, parseInt(groupForm.max_quantity) || 1),
        required: Boolean(groupForm.required || parseInt(groupForm.min_quantity) > 0),
        active: groupForm.active,
      };

      if (editingGroup) {
        await ComplementGroup.update(editingGroup.id, payload);
      } else {
        await ComplementGroup.create({
          ...payload,
          order_index: groups.length + 1,
        });
      }
      setShowGroupModal(false);
      await loadAllData();
    } catch (err) {
      alert("Erro ao salvar grupo.");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm("Tem certeza que deseja excluir este grupo? Todas as opções e vínculos serão removidos.")) return;
    try {
      await ComplementGroup.delete(groupId);
      await loadAllData();
    } catch (err) {
      alert("Erro ao excluir grupo.");
      console.error(err);
    }
  };

  const handleToggleGroupActive = async (group, checked) => {
    try {
      await ComplementGroup.update(group.id, { active: checked });
      setGroups(groups.map(g => g.id === group.id ? { ...g, active: checked } : g));
    } catch (err) {
      console.error(err);
    }
  };

  // --- Gestão de Itens dentro do Grupo ---
  const handleOpenItemsModal = (group) => {
    setActiveGroupForItems(group);
    setItemForm({
      name: "",
      description: "",
      price: "",
      max_quantity: 1,
      active: true,
    });
    setShowItemsModal(true);
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!itemForm.name.trim()) return;

    try {
      const priceNum = parseBRLToNumber(itemForm.price);
      await ComplementItem.create({
        group_id: activeGroupForItems.id,
        name: itemForm.name.trim(),
        description: itemForm.description.trim(),
        price: priceNum,
        max_quantity: parseInt(itemForm.max_quantity) || 1,
        active: true,
        order_index: (items.filter(i => i.group_id === activeGroupForItems.id).length || 0) + 1,
      });

      setItemForm({
        name: "",
        description: "",
        price: "",
        max_quantity: 1,
        active: true,
      });
      await loadAllData();
    } catch (err) {
      alert("Erro ao adicionar item.");
      console.error(err);
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await ComplementItem.delete(itemId);
      await loadAllData();
    } catch (err) {
      alert("Erro ao excluir item.");
      console.error(err);
    }
  };

  const handleToggleItemActive = async (item, checked) => {
    try {
      await ComplementItem.update(item.id, { active: checked });
      setItems(items.map(i => i.id === item.id ? { ...i, active: checked } : i));
    } catch (err) {
      console.error(err);
    }
  };

  // --- Vínculo em Massa aos Produtos ---
  const handleOpenLinkModal = (group) => {
    setActiveGroupForLink(group);
    const linked = productGroups.filter(pg => pg.group_id === group.id).map(pg => pg.product_id);
    setSelectedProductIds(linked);
    setShowLinkModal(true);
  };

  const handleToggleProductSelection = (productId) => {
    if (selectedProductIds.includes(productId)) {
      setSelectedProductIds(selectedProductIds.filter(id => id !== productId));
    } else {
      setSelectedProductIds([...selectedProductIds, productId]);
    }
  };

  const handleSelectAllCategory = (catId) => {
    const prodsInCat = products.filter(p => catId === "all" || p.category === catId).map(p => p.id);
    const allSelected = prodsInCat.every(id => selectedProductIds.includes(id));

    if (allSelected) {
      setSelectedProductIds(selectedProductIds.filter(id => !prodsInCat.includes(id)));
    } else {
      setSelectedProductIds(Array.from(new Set([...selectedProductIds, ...prodsInCat])));
    }
  };

  const handleSaveLinks = async () => {
    if (!activeGroupForLink) return;
    setIsSaving(true);
    try {
      const currentLinks = productGroups.filter(pg => pg.group_id === activeGroupForLink.id);
      const currentProductIds = currentLinks.map(pg => pg.product_id);

      // Itens a remover
      const toRemove = currentLinks.filter(pg => !selectedProductIds.includes(pg.product_id));
      for (const link of toRemove) {
        await ProductComplementGroup.delete(link.id);
      }

      // Itens a adicionar
      const toAdd = selectedProductIds.filter(pid => !currentProductIds.includes(pid));
      for (const pid of toAdd) {
        await ProductComplementGroup.create({
          product_id: pid,
          group_id: activeGroupForLink.id,
          order_index: activeGroupForLink.order_index || 0,
        });
      }

      setShowLinkModal(false);
      await loadAllData();
    } catch (err) {
      alert("Erro ao salvar vínculos.");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const groupItemsMap = (groupId) => items.filter(i => i.group_id === groupId);
  const groupLinkedProductsCount = (groupId) => productGroups.filter(pg => pg.group_id === groupId).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Grupos de Adicionais & Complementos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Crie grupos reutilizáveis (Ponto da Carne, Turbine seu Burger, Molhos) e vincule a múltiplos produtos com 1 clique.
          </p>
        </div>
        <Button onClick={handleOpenCreateGroup} className="bg-red-600 hover:bg-red-700 text-white shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Novo Grupo
        </Button>
      </div>

      {/* Lista de Grupos */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map(n => (
            <Card key={n} className="animate-pulse bg-gray-50 h-48 border rounded-2xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center rounded-2xl">
          <Layers className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-800">Nenhum grupo cadastrado</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1 mb-4">
            Crie seu primeiro grupo de complementos para organizar adicionais e opções obrigatórias ou opcionais.
          </p>
          <Button onClick={handleOpenCreateGroup} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-2" /> Criar Grupo Agora
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          <AnimatePresence>
            {groups.map(group => {
              const grpItems = groupItemsMap(group.id);
              const linkedCount = groupLinkedProductsCount(group.id);
              const isRequired = group.required || group.min_quantity > 0;

              return (
                <motion.div
                  key={group.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="h-full flex flex-col"
                >
                  <Card className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md flex flex-col justify-between h-full ${group.active ? 'bg-white' : 'bg-gray-50/80 opacity-75'}`}>
                    {/* Cabeçalho do Card com Altura Uniforme */}
                    <div className="p-5 border-b bg-gradient-to-r from-stone-50 to-white flex items-start justify-between gap-3 min-h-[96px] shrink-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <h3 className="font-bold text-gray-900 text-base sm:text-lg truncate max-w-[180px]" title={group.name}>
                            {group.name}
                          </h3>
                          {isRequired ? (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold shrink-0">
                              Obrigatório (Mín: {group.min_quantity})
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-stone-600 bg-stone-100 text-[10px] font-semibold shrink-0">
                              Opcional (Máx: {group.max_quantity})
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate h-4" title={group.description}>
                          {group.description || "Nenhuma descrição"}
                        </p>
                      </div>

                      <Switch 
                        checked={group.active} 
                        onCheckedChange={(c) => handleToggleGroupActive(group, c)}
                        title={group.active ? "Grupo Ativo" : "Grupo Inativo"}
                        className="shrink-0 mt-0.5"
                      />
                    </div>

                    {/* Corpo do Card com Altura Padronizada */}
                    <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      {/* Resumo de Itens com Caixa de Altura Fixa */}
                      <div className="flex-1 flex flex-col">
                        <div className="flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 shrink-0">
                          <span>Opções ({grpItems.length})</span>
                          <button 
                            onClick={() => handleOpenItemsModal(group)}
                            className="text-red-600 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                          >
                            <ListPlus className="w-3.5 h-3.5" /> Gerenciar Opções
                          </button>
                        </div>

                        {grpItems.length === 0 ? (
                          <div className="h-[120px] flex flex-col items-center justify-center p-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 text-center">
                            <AlertCircle className="w-5 h-5 text-amber-500 mb-1" />
                            <p className="text-xs text-amber-800 font-medium">Nenhuma opção cadastrada</p>
                            <button
                              onClick={() => handleOpenItemsModal(group)}
                              className="text-[11px] text-red-600 font-bold hover:underline mt-1"
                            >
                              + Adicionar opções
                            </button>
                          </div>
                        ) : (
                          <div className="h-[120px] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
                            {grpItems.slice(0, 4).map(item => (
                              <div key={item.id} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-gray-50 border border-gray-100">
                                <span className={`font-medium truncate ${item.active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                                  {item.name}
                                </span>
                                <span className="font-bold text-emerald-600 flex-shrink-0 ml-2">
                                  {item.price > 0 ? `+ R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : 'Grátis'}
                                </span>
                              </div>
                            ))}
                            {grpItems.length > 4 && (
                              <p className="text-[11px] text-gray-400 text-center pt-0.5">
                                + {grpItems.length - 4} outras opções...
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Vínculo de Produtos e Ações sempre alinhados na base */}
                      <div className="pt-3 border-t border-stone-100 flex items-center justify-between shrink-0 mt-auto">
                        <button
                          onClick={() => handleOpenLinkModal(group)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>{linkedCount} {linkedCount === 1 ? 'produto vinculado' : 'produtos vinculados'}</span>
                        </button>

                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-600 hover:text-gray-900 rounded-full"
                            onClick={() => handleOpenEditGroup(group)}
                            title="Editar Grupo"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full"
                            onClick={() => handleDeleteGroup(group.id)}
                            title="Excluir Grupo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Modal: Criar / Editar Grupo */}
      <Dialog open={showGroupModal} onOpenChange={setShowGroupModal}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingGroup ? "Editar Grupo de Complementos" : "Novo Grupo de Complementos"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveGroup} className="space-y-4 pt-2">
            <div>
              <Label htmlFor="grp-name" className="text-xs font-bold uppercase text-gray-600">Nome do Grupo *</Label>
              <Input
                id="grp-name"
                value={groupForm.name}
                onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                placeholder="Ex: Ponto da Carne, Turbine seu Burger, Molhos"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="grp-desc" className="text-xs font-bold uppercase text-gray-600">Descrição / Instrução (Opcional)</Label>
              <Input
                id="grp-desc"
                value={groupForm.description}
                onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
                placeholder="Ex: Escolha até 3 adicionais"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
              <div>
                <Label htmlFor="grp-min" className="text-xs font-bold uppercase text-gray-700">Mínimo de Escolhas</Label>
                <Input
                  id="grp-min"
                  type="number"
                  min="0"
                  max="20"
                  value={groupForm.min_quantity}
                  onChange={e => {
                    const min = parseInt(e.target.value) || 0;
                    setGroupForm({ 
                      ...groupForm, 
                      min_quantity: min, 
                      required: min > 0,
                      max_quantity: Math.max(min, groupForm.max_quantity)
                    });
                  }}
                  className="mt-1 bg-white"
                />
                <span className="text-[11px] text-gray-500">0 = Opcional, 1+ = Obrigatório</span>
              </div>

              <div>
                <Label htmlFor="grp-max" className="text-xs font-bold uppercase text-gray-700">Máximo de Escolhas</Label>
                <Input
                  id="grp-max"
                  type="number"
                  min="1"
                  max="50"
                  value={groupForm.max_quantity}
                  onChange={e => setGroupForm({ ...groupForm, max_quantity: parseInt(e.target.value) || 1 })}
                  className="mt-1 bg-white"
                />
                <span className="text-[11px] text-gray-500">Limite total no grupo</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border bg-gray-50">
              <div>
                <p className="font-semibold text-sm text-gray-800">Escolha Obrigatória</p>
                <p className="text-xs text-gray-500">O cliente precisa escolher ao menos 1 opção para adicionar ao carrinho</p>
              </div>
              <Switch 
                checked={groupForm.required}
                onCheckedChange={checked => setGroupForm({ 
                  ...groupForm, 
                  required: checked, 
                  min_quantity: checked ? Math.max(1, groupForm.min_quantity) : 0 
                })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setShowGroupModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-red-600 hover:bg-red-700 text-white font-semibold">
                {isSaving ? "Salvando..." : (editingGroup ? "Salvar Alterações" : "Criar Grupo")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Gerenciar Opções do Grupo */}
      <Dialog open={showItemsModal} onOpenChange={setShowItemsModal}>
        <DialogContent className="sm:max-w-xl max-h-[88vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 text-red-600" />
              Opções do Grupo: <span className="text-red-600">{activeGroupForItems?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {activeGroupForItems && (
            <div className="space-y-6 pt-2">
              {/* Formulário de adicionar opção */}
              <form onSubmit={handleAddItem} className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                <h4 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-red-600" /> Adicionar Nova Opção
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Label htmlFor="opt-name" className="text-xs font-semibold text-gray-600">Nome da Opção *</Label>
                    <Input
                      id="opt-name"
                      placeholder="Ex: Bacon Extra, Ao Ponto"
                      value={itemForm.name}
                      onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                      required
                      className="mt-1 bg-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="opt-price" className="text-xs font-semibold text-gray-600">Preço Adicional (R$)</Label>
                    <CurrencyInput
                      id="opt-price"
                      placeholder="R$ 0,00"
                      value={itemForm.price}
                      onChange={e => setItemForm({ ...itemForm, price: e.target.value })}
                      className="mt-1 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <Label htmlFor="opt-desc" className="text-xs font-semibold text-gray-600">Descrição (Opcional)</Label>
                    <Input
                      id="opt-desc"
                      placeholder="Ex: 4 fatias crocantes"
                      value={itemForm.description}
                      onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                      className="mt-1 bg-white"
                    />
                  </div>
                  <Button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold">
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </form>

              {/* Lista de Opções Existentes */}
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-gray-700">Opções Cadastradas</h4>
                {groupItemsMap(activeGroupForItems.id).length === 0 ? (
                  <p className="text-sm text-gray-500 italic p-4 text-center border rounded-xl bg-gray-50">
                    Nenhuma opção adicionada ainda neste grupo.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groupItemsMap(activeGroupForItems.id).map(item => (
                      <div 
                        key={item.id} 
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${item.active ? 'bg-white border-gray-200' : 'bg-gray-100 border-dashed border-gray-300 opacity-60'}`}
                      >
                        <div>
                          <p className={`font-semibold text-sm ${item.active ? 'text-gray-900' : 'text-gray-500 line-through'}`}>
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="text-xs text-gray-500">{item.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm text-emerald-600">
                            {item.price > 0 ? `+ R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : 'Grátis (R$ 0,00)'}
                          </span>
                          <Switch 
                            checked={item.active} 
                            onCheckedChange={c => handleToggleItemActive(item, c)}
                            title={item.active ? "Opção Disponível" : "Opção Pausada / Esgotada"}
                          />
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full"
                            onClick={() => handleDeleteItem(item.id)}
                            title="Excluir Opção"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Vincular Produtos em Massa */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Link2 className="w-5 h-5 text-indigo-600" />
              Vincular Grupo aos Produtos: <span className="text-red-600">{activeGroupForLink?.name}</span>
            </DialogTitle>
          </DialogHeader>

          {activeGroupForLink && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-gray-500">
                Marque os produtos que devem exibir o grupo <strong>{activeGroupForLink.name}</strong> para os clientes.
              </p>

              {/* Filtro por Categoria */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                <Button
                  variant={filterCategory === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterCategory("all")}
                  className={filterCategory === "all" ? "bg-red-600 text-white rounded-full text-xs" : "rounded-full text-xs"}
                >
                  Todas ({products.length})
                </Button>
                {categories.map(cat => {
                  const catProds = products.filter(p => p.category === cat.id);
                  return (
                    <Button
                      key={cat.id}
                      variant={filterCategory === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterCategory(cat.id)}
                      className={filterCategory === cat.id ? "bg-red-600 text-white rounded-full text-xs" : "rounded-full text-xs"}
                    >
                      {cat.name} ({catProds.length})
                    </Button>
                  );
                })}
              </div>

              {/* Ação de Selecionar Todos da Categoria */}
              <div className="flex justify-between items-center bg-stone-50 p-2.5 rounded-xl border">
                <span className="text-xs font-bold text-gray-700">
                  {selectedProductIds.length} produto(s) selecionado(s)
                </span>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleSelectAllCategory(filterCategory)}
                  className="text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Marcar / Desmarcar Todos Desta Categoria
                </Button>
              </div>

              {/* Grid de Produtos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto p-1">
                {products
                  .filter(p => filterCategory === "all" || p.category === filterCategory)
                  .map(product => {
                    const isSelected = selectedProductIds.includes(product.id);
                    return (
                      <label
                        key={product.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-red-50/60 border-red-400 shadow-sm' : 'bg-white hover:border-gray-300'}`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleProductSelection(product.id)}
                          className="data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-gray-900 truncate">{product.name}</p>
                          <p className="text-xs text-gray-500">R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}</p>
                        </div>
                      </label>
                    );
                  })}
              </div>

              {/* Rodapé */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setShowLinkModal(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="button" 
                  onClick={handleSaveLinks} 
                  disabled={isSaving}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                >
                  {isSaving ? "Salvando..." : "Salvar Vínculos"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
