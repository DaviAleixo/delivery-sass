import React, { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ComplementGroup, ComplementItem, ProductComplementGroup, Product, Category } from "@/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber } from "@/utils/moneyMask";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { appConfirm } from "@/components/ui/ConfirmDialogHost";
import ComplementCardGrid from "@/components/admin/ComplementCardGrid";
import ComplementListTable from "@/components/admin/ComplementListTable";
import {
  Plus,
  Layers,
  Trash2,
  Link2,
  Search,
  LayoutGrid,
  List,
  HelpCircle,
  Pizza,
  CheckCircle2,
  PauseCircle,
  ShieldCheck,
  Gift,
  Ruler,
  Sparkles,
  Check,
} from "lucide-react";

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
    free_quantity: 0,
    is_size_selector: false,
    required: false,
    active: true,
    is_pizza_crust: false,
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

  // Filtros, KPIs e Modo de Visualização
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRule, setFilterRule] = useState("all");
  const [showPizzaTip, setShowPizzaTip] = useState(false);
  const [duplicatingGroupId, setDuplicatingGroupId] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem("pedemuleke_complements_view_mode") || "list";
    } catch {
      return "list";
    }
  });

  const handleChangeViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("pedemuleke_complements_view_mode", mode);
    } catch {
      // ignore storage errors
    }
  };

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
      free_quantity: 0,
      is_size_selector: false,
      required: false,
      active: true,
      is_pizza_crust: false,
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
      free_quantity: group.free_quantity || 0,
      is_size_selector: Boolean(group.is_size_selector),
      required: Boolean(group.required || group.min_quantity > 0),
      active: group.active !== false,
      is_pizza_crust: Boolean(group.is_pizza_crust),
    });
    setShowGroupModal(true);
  };

  const handleSaveGroup = async (e) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;

    setIsSaving(true);
    try {
      const isSize = Boolean(groupForm.is_size_selector);
      const payload = {
        name: groupForm.name.trim(),
        description: groupForm.description.trim(),
        min_quantity: isSize ? 1 : Math.max(0, parseInt(groupForm.min_quantity) || 0),
        max_quantity: isSize ? 1 : Math.max(1, parseInt(groupForm.max_quantity) || 1),
        free_quantity: isSize ? 0 : Math.max(0, parseInt(groupForm.free_quantity) || 0),
        is_size_selector: isSize,
        required: isSize ? true : Boolean(groupForm.required || parseInt(groupForm.min_quantity) > 0),
        active: groupForm.active,
        is_pizza_crust: isSize ? false : Boolean(groupForm.is_pizza_crust),
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
      toast.success(editingGroup ? "Grupo atualizado!" : "Grupo criado com sucesso!");
      await loadAllData();
    } catch (err) {
      toast.error("Erro ao salvar grupo.");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDuplicateGroup = async (group) => {
    setDuplicatingGroupId(group.id);
    try {
      const newGroup = await ComplementGroup.create({
        name: `${group.name} (Cópia)`,
        description: group.description || "",
        min_quantity: group.min_quantity ?? 0,
        max_quantity: group.max_quantity ?? 1,
        free_quantity: group.free_quantity ?? 0,
        is_size_selector: Boolean(group.is_size_selector),
        required: Boolean(group.required),
        active: Boolean(group.active),
        is_pizza_crust: Boolean(group.is_pizza_crust),
        order_index: (groups.length || 0) + 1,
      });

      const grpItems = items.filter((i) => i.group_id === group.id);
      if (newGroup?.id && grpItems.length > 0) {
        await Promise.all(
          grpItems.map((item, idx) =>
            ComplementItem.create({
              group_id: newGroup.id,
              name: item.name,
              description: item.description || "",
              price: Number(item.price || 0),
              max_quantity: item.max_quantity ?? 1,
              active: Boolean(item.active),
              order_index: item.order_index ?? idx + 1,
            })
          )
        );
      }

      toast.success(`Grupo "${group.name}" duplicado com sucesso!`);
      await loadAllData();
    } catch (err) {
      toast.error("Erro ao duplicar grupo.");
      console.error(err);
    } finally {
      setDuplicatingGroupId(null);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    const ok = await appConfirm({
      title: "Excluir grupo de complementos?",
      description: "Todas as opções e vínculos serão removidos.",
      confirmText: "Excluir Grupo",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await ComplementGroup.delete(groupId);
      toast.success("Grupo excluído.");
      await loadAllData();
    } catch (err) {
      toast.error("Erro ao excluir grupo.");
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
      toast.error("Erro ao adicionar item.");
      console.error(err);
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await ComplementItem.delete(itemId);
      await loadAllData();
    } catch (err) {
      toast.error("Erro ao excluir item.");
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
      toast.success("Vínculos salvos com sucesso!");
      await loadAllData();
    } catch (err) {
      toast.error("Erro ao salvar vínculos.");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const groupItemsMap = (groupId) => items.filter(i => i.group_id === groupId);
  const groupLinkedProductsCount = (groupId) => productGroups.filter(pg => pg.group_id === groupId).length;

  const stats = useMemo(() => {
    const total = groups.length;
    const required = groups.filter((g) => g.required || (g.min_quantity ?? 0) > 0).length;
    const optional = total - required;
    const inactive = groups.filter((g) => !g.active).length;
    return { total, required, optional, inactive };
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return groups.filter((group) => {
      const isReq = group.required || (group.min_quantity ?? 0) > 0;
      if (filterRule === "required" && !isReq) return false;
      if (filterRule === "optional" && isReq) return false;
      if (filterRule === "inactive" && group.active) return false;

      if (!term) return true;
      const inName = (group.name || "").toLowerCase().includes(term);
      const inDesc = (group.description || "").toLowerCase().includes(term);
      const inItems = items.some(
        (i) => i.group_id === group.id && (i.name || "").toLowerCase().includes(term)
      );
      return inName || inDesc || inItems;
    });
  }, [groups, items, searchTerm, filterRule]);

  return (
    <div className="p-6 sm:p-8 bg-[#F7F9F8] min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
              Grupos de Adicionais & Complementos
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Crie grupos reutilizáveis (Bordas Recheadas, Extras, Ponto da Carne) e vincule aos produtos com 1 clique.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPizzaTip((v) => !v)}
              className={`rounded-xl border-stone-200 text-xs font-semibold cursor-pointer ${
                showPizzaTip ? "bg-emerald-50 text-[#047857] border-emerald-200" : "bg-white text-stone-600 hover:text-stone-900"
              }`}
            >
              <HelpCircle className="w-4 h-4 mr-1.5" />
              Dica: Bordas de Pizza
            </Button>
            <Button
              onClick={handleOpenCreateGroup}
              className="bg-[#047857] hover:bg-[#065f46] text-white shadow-sm font-bold rounded-xl cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-2" /> Novo Grupo
            </Button>
          </div>
        </div>

        {/* Dica colapsável de Bordas para Pizzas (1 linha, sem emoji) */}
        {showPizzaTip && (
          <div className="px-4 py-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between gap-3 text-xs text-emerald-900">
            <div className="flex items-center gap-2.5">
              <Pizza className="w-4 h-4 text-[#047857] shrink-0" />
              <p className="leading-relaxed">
                <strong>Bordas para Pizzas:</strong> crie um grupo com a opção <em>&quot;Borda Recheada / Pizza Inteira&quot;</em> ativada (ou &quot;Borda&quot; no nome, Mín: 0, Máx: 1) e vincule às pizzas — o montador aplica automaticamente ao disco inteiro.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPizzaTip(false)}
              className="text-emerald-700 hover:text-emerald-950 font-semibold shrink-0 cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}

        {/* KPIs Compactos e Clicáveis */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              key: "all",
              label: "Total de Grupos",
              value: stats.total,
              icon: Layers,
              iconColor: "text-stone-500",
              activeRing: "border-[#047857] ring-1 ring-[#047857]/20 bg-emerald-50/30",
              valueColor: "text-gray-900",
            },
            {
              key: "required",
              label: "Obrigatórios",
              value: stats.required,
              icon: ShieldCheck,
              iconColor: "text-amber-600",
              activeRing: "border-amber-500 ring-1 ring-amber-500/20 bg-amber-50/30",
              valueColor: "text-amber-700",
            },
            {
              key: "optional",
              label: "Opcionais",
              value: stats.optional,
              icon: CheckCircle2,
              iconColor: "text-emerald-600",
              activeRing: "border-[#047857] ring-1 ring-[#047857]/20 bg-emerald-50/30",
              valueColor: "text-[#047857]",
            },
            {
              key: "inactive",
              label: "Pausados",
              value: stats.inactive,
              icon: PauseCircle,
              iconColor: "text-stone-400",
              activeRing: "border-stone-500 ring-1 ring-stone-500/20 bg-stone-100/60",
              valueColor: "text-stone-600",
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            const isSelected = filterRule === kpi.key;
            return (
              <button
                key={kpi.key}
                type="button"
                onClick={() => setFilterRule(isSelected && kpi.key !== "all" ? "all" : kpi.key)}
                className={`text-left px-4 py-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? kpi.activeRing
                    : "bg-white border-stone-200 hover:border-stone-300 shadow-2xs"
                }`}
              >
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    {kpi.label}
                  </p>
                  <p className={`text-2xl font-extrabold mt-0.5 tabular-nums ${kpi.valueColor}`}>
                    {kpi.value}
                  </p>
                </div>
                <Icon className={`w-5 h-5 ${kpi.iconColor} shrink-0`} />
              </button>
            );
          })}
        </div>

        {/* Barra de Busca, Filtro e Toggle Lista | Cards */}
        <div className="bg-white p-3 rounded-xl border border-stone-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar grupo ou opção (ex: Catupiry, Bacon, Borda)..."
              className="pl-9 bg-stone-50/60 border-stone-200 focus:bg-white rounded-lg"
            />
          </div>

          <Select value={filterRule} onValueChange={setFilterRule}>
            <SelectTrigger className="w-full sm:w-44 bg-stone-50/60 border-stone-200 rounded-lg">
              <SelectValue placeholder="Filtrar regra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              <SelectItem value="required">Obrigatórios</SelectItem>
              <SelectItem value="optional">Opcionais</SelectItem>
              <SelectItem value="inactive">Pausados</SelectItem>
            </SelectContent>
          </Select>

          <div className="inline-flex items-center p-1 rounded-lg bg-stone-100 border border-stone-200 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => handleChangeViewMode("list")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => handleChangeViewMode("cards")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                viewMode === "cards"
                  ? "bg-white text-gray-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Cards
            </button>
          </div>
        </div>

        {/* Lista / Cards de Grupos */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="animate-pulse bg-white h-20 border border-stone-200 rounded-xl shadow-2xs" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="border-dashed border-2 border-stone-200 p-12 text-center rounded-2xl bg-white shadow-2xs">
            <Layers className="w-12 h-12 text-stone-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-800">Nenhum grupo cadastrado</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mt-1 mb-4">
              Crie seu primeiro grupo de complementos para organizar adicionais e opções obrigatórias ou opcionais.
            </p>
            <Button onClick={handleOpenCreateGroup} className="bg-[#047857] hover:bg-[#065f46] text-white font-bold rounded-xl cursor-pointer">
              <Plus className="w-4 h-4 mr-2" /> Criar Grupo Agora
            </Button>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="border border-stone-200 p-10 text-center rounded-2xl bg-white shadow-2xs">
            <Search className="w-9 h-9 text-stone-400 mx-auto mb-2" />
            <h3 className="text-base font-bold text-gray-800">Nenhum grupo encontrado</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Tente outro termo de busca ou limpe o filtro selecionado.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setFilterRule("all");
              }}
              className="rounded-lg cursor-pointer"
            >
              Limpar filtros
            </Button>
          </div>
        ) : viewMode === "list" ? (
          <ComplementListTable
            groups={filteredGroups}
            getGroupItems={groupItemsMap}
            getLinkedCount={groupLinkedProductsCount}
            duplicatingGroupId={duplicatingGroupId}
            onToggleGroupActive={handleToggleGroupActive}
            onToggleItemActive={handleToggleItemActive}
            onOpenItems={handleOpenItemsModal}
            onOpenLinks={handleOpenLinkModal}
            onDuplicate={handleDuplicateGroup}
            onEdit={handleOpenEditGroup}
            onDelete={handleDeleteGroup}
          />
        ) : (
          <ComplementCardGrid
            groups={filteredGroups}
            getGroupItems={groupItemsMap}
            getLinkedCount={groupLinkedProductsCount}
            duplicatingGroupId={duplicatingGroupId}
            onToggleGroupActive={handleToggleGroupActive}
            onToggleItemActive={handleToggleItemActive}
            onOpenItems={handleOpenItemsModal}
            onOpenLinks={handleOpenLinkModal}
            onDuplicate={handleDuplicateGroup}
            onEdit={handleOpenEditGroup}
            onDelete={handleDeleteGroup}
          />
        )}

      {/* Modal: Criar / Editar Grupo */}
      <Dialog open={showGroupModal} onOpenChange={setShowGroupModal}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh] rounded-2xl">
          <DialogHeader className="px-6 py-4 border-b border-stone-200 bg-white shrink-0">
            <DialogTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#047857]" />
              {editingGroup ? "Editar Grupo de Complementos" : "Novo Grupo de Complementos"}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Configure o nome, regras de seleção e se o grupo se aplica à pizza inteira.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveGroup} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto bg-[#F7F9F8] px-6 py-5 space-y-4">
              {/* Identificação */}
              <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-3">
                <div>
                  <Label htmlFor="grp-name" className="text-xs font-bold uppercase text-gray-600">
                    Nome do Grupo *
                  </Label>
                  <Input
                    id="grp-name"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                    placeholder="Ex: Tamanho da Cerveja, Turbinar Açai, Ponto da Carne"
                    required
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="grp-desc" className="text-xs font-bold uppercase text-gray-600">
                    Anotação Interna / Descrição (Visível apenas para o lojista)
                  </Label>
                  <Input
                    id="grp-desc"
                    value={groupForm.description}
                    onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                    placeholder="Ex: Grupo de tamanhos para cervejas - uso interno"
                    className="mt-1.5"
                  />
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Uso interno da sua loja (não é exibido para o cliente no cardápio)
                  </span>
                </div>
              </div>

              {/* Seletor Executivo de Tipo de Grupo */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-gray-600 block">
                  Tipo de Complemento *
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Tipo 1: Adicionais & Ingredientes */}
                  <button
                    type="button"
                    onClick={() => {
                      setGroupForm((prev) => ({
                        ...prev,
                        is_size_selector: false,
                        is_pizza_crust: false,
                        min_quantity: prev.is_size_selector ? 0 : prev.min_quantity,
                        max_quantity: prev.is_size_selector ? 5 : Math.max(1, prev.max_quantity),
                        required: prev.is_size_selector ? false : prev.required,
                      }));
                    }}
                    className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                      !groupForm.is_size_selector && !groupForm.is_pizza_crust
                        ? "border-[#047857] bg-emerald-50/80 shadow-sm ring-2 ring-[#047857]/30"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-black">
                          ➕
                        </span>
                        <span className="text-sm font-bold text-gray-900">Adicionais</span>
                      </div>
                      {!groupForm.is_size_selector && !groupForm.is_pizza_crust && (
                        <Check className="w-4 h-4 text-[#047857]" />
                      )}
                    </div>
                    <span className="text-[11px] text-gray-500 leading-tight">
                      Extras, acompanhamentos, molhos e cortesias grátis.
                    </span>
                  </button>

                  {/* Tipo 2: Tamanhos & Medidas */}
                  <button
                    type="button"
                    onClick={() => {
                      setGroupForm((prev) => ({
                        ...prev,
                        is_size_selector: true,
                        is_pizza_crust: false,
                        min_quantity: 1,
                        max_quantity: 1,
                        free_quantity: 0,
                        required: true,
                      }));
                    }}
                    className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                      groupForm.is_size_selector
                        ? "border-blue-600 bg-blue-50/80 shadow-sm ring-2 ring-blue-600/30"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-md bg-blue-100 text-blue-800 text-xs font-black">
                          📏
                        </span>
                        <span className="text-sm font-bold text-gray-900">Tamanhos</span>
                      </div>
                      {groupForm.is_size_selector && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <span className="text-[11px] text-gray-500 leading-tight">
                      Define o preço base do produto (300ml, 500ml, Lata, 600ml).
                    </span>
                  </button>

                  {/* Tipo 3: Pizza Inteira */}
                  <button
                    type="button"
                    onClick={() => {
                      setGroupForm((prev) => ({
                        ...prev,
                        is_size_selector: false,
                        is_pizza_crust: true,
                        free_quantity: 0,
                      }));
                    }}
                    className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all ${
                      groupForm.is_pizza_crust
                        ? "border-amber-600 bg-amber-50/80 shadow-sm ring-2 ring-amber-600/30"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-md bg-amber-100 text-amber-800 text-xs font-black">
                          🍕
                        </span>
                        <span className="text-sm font-bold text-gray-900">Pizza Inteira</span>
                      </div>
                      {groupForm.is_pizza_crust && (
                        <Check className="w-4 h-4 text-amber-600" />
                      )}
                    </div>
                    <span className="text-[11px] text-gray-500 leading-tight">
                      Bordas recheadas e tipos de massa para o disco todo.
                    </span>
                  </button>
                </div>
              </div>

              {/* RENDERIZAÇÃO CONDICIONAL POR TIPO DE GRUPO */}

              {/* CASO 1: SE FOR SELETOR DE TAMANHO */}
              {groupForm.is_size_selector ? (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm font-bold">
                      <Ruler className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-blue-950">
                          Preço Principal por Tamanho
                        </h4>
                        <span className="text-[10px] uppercase font-extrabold bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">
                          1 Obrigatório
                        </span>
                      </div>
                      <p className="text-xs text-blue-900/80 leading-relaxed">
                        Neste modo, o cliente é <strong>obrigado a escolher exatamente 1 tamanho</strong> (ex: Lata R$ 6,00, Latão R$ 7,00 ou 300ml, 500ml).
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/80 rounded-lg p-3 border border-blue-100 text-xs text-blue-900 space-y-1.5">
                    <p className="font-semibold flex items-center gap-1.5 text-blue-950">
                      <span>💡</span> Como funciona o valor de venda:
                    </p>
                    <p className="text-gray-600 leading-relaxed">
                      O valor cadastrado em cada item deste grupo substitui o preço inicial do produto. Por exemplo: se o produto tiver valor R$ 0,00 e o cliente escolher <em>"Latão (R$ 7,00)"</em>, o preço final do item será R$ 7,00.
                    </p>
                    <p className="text-blue-700 font-medium pt-0.5 text-[11px]">
                      ✓ Regras de Mínimo (1), Máximo (1) e Escolha Obrigatória são travadas automaticamente.
                    </p>
                  </div>
                </div>
              ) : (
                /* CASO 2: SE FOR ADICIONAIS OU PIZZA INTEIRA */
                <div className="space-y-4">
                  {/* Bloco de Quantidades (Mínimo / Máximo / Obrigatório) */}
                  <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="grp-min" className="text-xs font-bold uppercase text-gray-700">
                          Mínimo de Escolhas
                        </Label>
                        <Input
                          id="grp-min"
                          type="number"
                          min="0"
                          max="20"
                          value={groupForm.min_quantity}
                          onChange={(e) => {
                            const min = Math.max(0, parseInt(e.target.value) || 0);
                            setGroupForm({
                              ...groupForm,
                              min_quantity: min,
                              required: min > 0,
                              max_quantity: Math.max(min, groupForm.max_quantity),
                            });
                          }}
                          className="mt-1.5"
                        />
                        <span className="text-[11px] text-gray-500 mt-1 block">
                          0 = Opcional, 1+ = Obriga o cliente a escolher
                        </span>
                      </div>

                      <div>
                        <Label htmlFor="grp-max" className="text-xs font-bold uppercase text-gray-700">
                          Máximo de Escolhas
                        </Label>
                        <Input
                          id="grp-max"
                          type="number"
                          min="1"
                          max="50"
                          value={groupForm.max_quantity}
                          onChange={(e) =>
                            setGroupForm({
                              ...groupForm,
                              max_quantity: Math.max(1, parseInt(e.target.value) || 1),
                            })
                          }
                          className="mt-1.5"
                        />
                        <span className="text-[11px] text-gray-500 mt-1 block">
                          Limite máximo que o cliente pode selecionar
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                      <div className="pr-3">
                        <p className="font-semibold text-sm text-gray-800">Escolha Obrigatória</p>
                        <p className="text-xs text-gray-500">
                          O cliente só pode adicionar ao carrinho se escolher ao menos 1 item deste grupo
                        </p>
                      </div>
                      <Switch
                        checked={groupForm.required || groupForm.min_quantity > 0}
                        onCheckedChange={(checked) =>
                          setGroupForm({
                            ...groupForm,
                            required: checked,
                            min_quantity: checked ? Math.max(1, groupForm.min_quantity) : 0,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Bloco de Cortesias Grátis (Franquia de Adicionais) */}
                  {!groupForm.is_pizza_crust && (
                    <div
                      className={`p-4 rounded-xl border transition-all ${
                        groupForm.free_quantity > 0
                          ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-400"
                          : "bg-white border-stone-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 pr-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                            <Gift className="w-4 h-4 text-emerald-700" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-gray-900">
                              Oferecer Cortesias Grátis?
                            </p>
                            <p className="text-xs text-gray-500">
                              Ideal para açaí com frutas inclusas, hambúrguer com molho grátis, etc.
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={groupForm.free_quantity > 0}
                          onCheckedChange={(checked) =>
                            setGroupForm((prev) => ({
                              ...prev,
                              free_quantity: checked ? Math.max(1, prev.free_quantity || 1) : 0,
                            }))
                          }
                        />
                      </div>

                      {groupForm.free_quantity > 0 && (
                        <div className="pt-3 border-t border-emerald-200/80 space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="w-36">
                              <Label htmlFor="grp-free" className="text-xs font-bold uppercase text-emerald-900">
                                Quantidade Grátis
                              </Label>
                              <Input
                                id="grp-free"
                                type="number"
                                min="1"
                                max={groupForm.max_quantity}
                                value={groupForm.free_quantity}
                                onChange={(e) =>
                                  setGroupForm({
                                    ...groupForm,
                                    free_quantity: Math.max(0, parseInt(e.target.value) || 0),
                                  })
                                }
                                className="mt-1 bg-white border-emerald-300 font-bold text-emerald-900"
                              />
                            </div>
                            <div className="flex-1 text-xs text-emerald-800 pt-5">
                              O cliente escolhe até <strong>{groupForm.free_quantity} {groupForm.free_quantity === 1 ? "item gratuito" : "itens gratuitos"}</strong>. Itens excedentes serão cobrados pelo valor cadastrado.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Banner Explicativo de Pizza Inteira */}
                  {groupForm.is_pizza_crust && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
                      <Pizza className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 space-y-0.5">
                        <p className="font-bold text-amber-950">Aplica-se ao disco todo da pizza</p>
                        <p className="text-amber-800">
                          Este grupo (ex: Borda Recheada, Tipo de Massa) é cobrado e aplicado na pizza como um todo, não sendo fracionado por sabores ou metades.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-stone-200 bg-white shrink-0 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowGroupModal(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-[#047857] hover:bg-[#065f46] text-white font-semibold rounded-xl cursor-pointer"
              >
                {isSaving ? "Salvando..." : editingGroup ? "Salvar Alterações" : "Criar Grupo"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Gerenciar Opções do Grupo */}
      <Dialog open={showItemsModal} onOpenChange={setShowItemsModal}>
        <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh] rounded-2xl">
          <DialogHeader className="px-6 py-4 border-b border-stone-200 bg-white shrink-0">
            <DialogTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#047857]" />
              Opções de <span className="text-[#047857]">{activeGroupForItems?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              {activeGroupForItems
                ? `${groupItemsMap(activeGroupForItems.id).length} opção(ões) cadastrada(s) neste grupo.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {activeGroupForItems && (
            <div className="flex-1 overflow-y-auto bg-[#F7F9F8] px-6 py-5 space-y-5">
              {/* Formulário de adicionar opção */}
              <form onSubmit={handleAddItem} className="bg-white p-4 rounded-xl border border-stone-200 space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[#047857]" /> Adicionar Nova Opção
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Label htmlFor="opt-name" className="text-xs font-semibold text-gray-600">
                      Nome da Opção *
                    </Label>
                    <Input
                      id="opt-name"
                      placeholder="Ex: Bacon Extra, Ao Ponto"
                      value={itemForm.name}
                      onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                      required
                      className="mt-1 bg-white focus:border-[#047857]"
                    />
                  </div>
                  <div>
                    <Label htmlFor="opt-price" className="text-xs font-semibold text-gray-600">
                      Preço Adicional (R$)
                    </Label>
                    <CurrencyInput
                      id="opt-price"
                      placeholder="R$ 0,00"
                      value={itemForm.price}
                      onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                      className="mt-1 bg-white focus:border-[#047857]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <Label htmlFor="opt-desc" className="text-xs font-semibold text-gray-600">
                      Descrição (Opcional)
                    </Label>
                    <Input
                      id="opt-desc"
                      placeholder="Ex: 4 fatias crocantes"
                      value={itemForm.description}
                      onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                      className="mt-1 bg-white focus:border-[#047857]"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#047857] hover:bg-[#065f46] text-white font-semibold rounded-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </form>

              {/* Lista de Opções Existentes */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-xs uppercase tracking-wider text-gray-600">
                  Opções Cadastradas ({groupItemsMap(activeGroupForItems.id).length})
                </h4>
                {groupItemsMap(activeGroupForItems.id).length === 0 ? (
                  <p className="text-sm text-gray-500 italic p-6 text-center border border-dashed border-stone-200 rounded-xl bg-white">
                    Nenhuma opção adicionada ainda neste grupo.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groupItemsMap(activeGroupForItems.id).map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          item.active
                            ? "bg-white border-stone-200"
                            : "bg-stone-100/80 border-dashed border-stone-300 opacity-70"
                        }`}
                      >
                        <div className="min-w-0 pr-3">
                          <p className={`font-semibold text-sm truncate ${item.active ? "text-gray-900" : "text-gray-500 line-through"}`}>
                            {item.name}
                          </p>
                          {item.description && <p className="text-xs text-gray-500 truncate">{item.description}</p>}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-bold text-sm text-[#047857] tabular-nums">
                            {item.price > 0 ? `+ R$ ${Number(item.price).toFixed(2).replace(".", ",")}` : "Grátis"}
                          </span>
                          <Switch
                            checked={item.active}
                            onCheckedChange={(c) => handleToggleItemActive(item, c)}
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

          <div className="px-6 py-3.5 border-t border-stone-200 bg-white shrink-0 flex justify-end">
            <Button
              type="button"
              onClick={() => setShowItemsModal(false)}
              className="bg-[#047857] hover:bg-[#065f46] text-white font-semibold rounded-xl cursor-pointer"
            >
              Concluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Vincular Produtos em Massa */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh] rounded-2xl">
          <DialogHeader className="px-6 py-4 border-b border-stone-200 bg-white shrink-0">
            <DialogTitle className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-[#047857]" />
              Vincular Grupo: <span className="text-[#047857]">{activeGroupForLink?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Selecione os produtos do cardápio que devem exibir este grupo para os clientes.
            </DialogDescription>
          </DialogHeader>

          {activeGroupForLink && (
            <>
              <div className="flex-1 overflow-y-auto bg-[#F7F9F8] px-6 py-5 space-y-4">
                {/* Filtro por Categoria */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <Button
                    variant={filterCategory === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterCategory("all")}
                    className={
                      filterCategory === "all"
                        ? "bg-[#047857] hover:bg-[#065f46] text-white rounded-full text-xs font-bold cursor-pointer"
                        : "bg-white rounded-full text-xs hover:border-[#047857] hover:text-[#047857] cursor-pointer"
                    }
                  >
                    Todas ({products.length})
                  </Button>
                  {categories.map((cat) => {
                    const catProds = products.filter((p) => p.category === cat.id);
                    return (
                      <Button
                        key={cat.id}
                        variant={filterCategory === cat.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFilterCategory(cat.id)}
                        className={
                          filterCategory === cat.id
                            ? "bg-[#047857] hover:bg-[#065f46] text-white rounded-full text-xs font-bold cursor-pointer"
                            : "bg-white rounded-full text-xs hover:border-[#047857] hover:text-[#047857] cursor-pointer"
                        }
                      >
                        {cat.name} ({catProds.length})
                      </Button>
                    );
                  })}
                </div>

                {/* Ação de Selecionar Todos da Categoria */}
                <div className="flex justify-between items-center bg-white px-3.5 py-2.5 rounded-xl border border-stone-200">
                  <span className="text-xs font-bold text-gray-700">
                    {selectedProductIds.length} produto(s) selecionado(s)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAllCategory(filterCategory)}
                    className="text-xs font-semibold text-[#047857] hover:bg-emerald-50 cursor-pointer"
                  >
                    Marcar / Desmarcar Todos Desta Categoria
                  </Button>
                </div>

                {/* Grid de Produtos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {products
                    .filter((p) => filterCategory === "all" || p.category === filterCategory)
                    .map((product) => {
                      const isSelected = selectedProductIds.includes(product.id);
                      return (
                        <label
                          key={product.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? "bg-emerald-50/60 border-[#047857] shadow-2xs"
                              : "bg-white border-stone-200 hover:border-stone-300"
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleProductSelection(product.id)}
                            className="data-[state=checked]:bg-[#047857] data-[state=checked]:border-[#047857]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm text-gray-900 truncate">{product.name}</p>
                            <p className="text-xs text-gray-500 tabular-nums">
                              R$ {Number(product.price || 0).toFixed(2).replace(".", ",")}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Rodapé Fixo */}
              <div className="px-6 py-3.5 border-t border-stone-200 bg-white shrink-0 flex justify-between items-center gap-2">
                <span className="text-xs font-medium text-stone-500">
                  {selectedProductIds.length} selecionado(s)
                </span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowLinkModal(false)} className="rounded-xl">
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveLinks}
                    disabled={isSaving}
                    className="bg-[#047857] hover:bg-[#065f46] text-white font-semibold rounded-xl cursor-pointer"
                  >
                    {isSaving ? "Salvando..." : "Salvar Vínculos"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
