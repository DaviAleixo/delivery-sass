import React, { useState, useEffect } from "react";
import { Product } from "@/entities/Product";
import { ProductAdditional } from "@/entities/ProductAdditional";
import { Category } from "@/entities/Category";
import { ProductionSector } from "@/entities/ProductionSector";
import { ComplementGroup } from "@/entities/ComplementGroup";
import { ComplementItem } from "@/entities/ComplementItem";
import { ProductComplementGroup } from "@/entities/ProductComplementGroup";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber, formatToBRL } from "@/utils/moneyMask";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { appConfirm } from "@/components/ui/ConfirmDialogHost";
import { Switch } from "@/components/ui/switch";
import { validateSchema, productSchema } from "@/schemas";
import { 
  Plus, 
  Trash2, 
  Search, 
  Layers, 
  ExternalLink, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Package, 
  X,
  LayoutGrid,
  List
} from "lucide-react";
import ProductCardGrid from "@/components/admin/ProductCardGrid";
import ProductListTable from "@/components/admin/ProductListTable";
import {
  buildDefaultPizzaPrices,
  getCategoryMatrixSizes,
  hasCategorySizeMatrix,
  isPizzaCategory,
  isVariationGridCategory,
  parsePizzaPrices,
  findMatchingCategory,
} from "@/utils/pizzaPricing";
import { Link, useParams, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { useTenant } from "@/lib/TenantContext";

// New AdditionalsManager component
function AdditionalsManager({ productId, initialAdditionals = [] }) {
  const [additionals, setAdditionals] = useState(initialAdditionals);
  const [newAdditional, setNewAdditional] = useState({ name: '', price: '' });

  const handleAdd = async () => {
    if (!newAdditional.name || !newAdditional.price) return;
    try {
      const created = await ProductAdditional.create({
        ...newAdditional,
        price: parseBRLToNumber(newAdditional.price),
        product_id: productId,
      });
      setAdditionals([...additionals, created]);
      setNewAdditional({ name: '', price: '' });
    } catch (error) {
      alert("Erro ao adicionar adicional.");
      console.error("Error adding additional:", error);
    }
  };

  const handleDelete = async (additionalId) => {
    try {
      await ProductAdditional.delete(additionalId);
      setAdditionals(additionals.filter(a => a.id !== additionalId));
    } catch (error) {
      alert("Erro ao excluir adicional.");
      console.error("Error deleting additional:", error);
    }
  };

  useEffect(() => {
    setAdditionals(initialAdditionals);
  }, [initialAdditionals]);

  return (
    <div className="space-y-4 pt-4 mt-4 border-t">
      <h4 className="font-semibold">Adicionais</h4>
      <div className="space-y-2">
        {additionals.length === 0 && <p className="text-sm text-gray-500">Nenhum adicional adicionado.</p>}
        {additionals.map(ad => (
          <div key={ad.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
            <span>{ad.name} - R$ {ad.price.toFixed(2).replace('.', ',')}</span>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(ad.id)}>
              <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label htmlFor="additional-name">Nome do Adicional</Label>
          <Input 
            id="additional-name"
            value={newAdditional.name}
            onChange={e => setNewAdditional({...newAdditional, name: e.target.value})}
            placeholder="Ex: Queijo Extra, Gelo e Limão..."
          />
        </div>
        <div className="w-32">
          <Label htmlFor="additional-price">Preço (R$)</Label>
          <CurrencyInput 
            id="additional-price"
            value={newAdditional.price}
            onChange={e => setNewAdditional({...newAdditional, price: e.target.value})}
            placeholder="R$ 2,50"
          />
        </div>
        <Button type="button" onClick={handleAdd}>Adicionar</Button>
      </div>
    </div>
  );
}


export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem("pedemuleke_products_view_mode") === "cards"
        ? "cards"
        : "list";
    } catch {
      return "list";
    }
  });
  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("pedemuleke_products_view_mode", mode);
    } catch {
      // ignore storage errors
    }
  };
  const [allAdditionals, setAllAdditionals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [productionSectors, setProductionSectors] = useState([]);
  const [complementGroups, setComplementGroups] = useState([]);
  const [complementItems, setComplementItems] = useState([]);
  const [productComplementGroups, setProductComplementGroups] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "visible" | "hidden"
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingVisibilityId, setUpdatingVisibilityId] = useState(null);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    sector_id: null,
    image_url: "",
    available: true
  });

  const { slug } = useParams();
  const location = useLocation();
  const { tenant } = useTenant();

  useEffect(() => {
    setProducts([]);
    setAllAdditionals([]);
    setCategories([]);
    setComplementGroups([]);
    setComplementItems([]);
    setProductComplementGroups([]);
    loadProducts();
  }, [slug, location.pathname, tenant?.id, tenant?.salon_mode, tenant?.plan]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const [productsData, additionalsData, categoriesData, groupsData, pcgData, sectorsData, itemsData] = await Promise.all([
        Product.list("-created_date"),
        ProductAdditional.list(),
        Category.list("order_index"),
        ComplementGroup.list("order_index"),
        ProductComplementGroup.list("-created_date"),
        ProductionSector.list("order_index").catch(() => []),
        ComplementItem.list("order_index").catch(() => []),
      ]);
      setProducts(productsData || []);
      setAllAdditionals(additionalsData || []);
      setCategories(categoriesData || []);
      setComplementGroups(groupsData || []);
      setComplementItems(itemsData || []);
      setProductComplementGroups(pcgData || []);
      setProductionSectors(Array.isArray(sectorsData) ? sectorsData : []);
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleVisibility = async (product, e) => {
    if (e) {
      e.stopPropagation();
    }
    const newStatus = !(product.available !== false);
    setUpdatingVisibilityId(product.id);

    // Atualização otimista local
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, available: newStatus } : p));

    try {
      await Product.update(product.id, { available: newStatus });
      if (newStatus) {
        toast.success(`"${product.name}" agora está visível no cardápio!`);
      } else {
        toast.info(`"${product.name}" foi ocultado do cardápio.`);
      }
    } catch (error) {
      console.error("Erro ao alterar visibilidade:", error);
      toast.error("Erro ao atualizar visibilidade do produto");
      // Reverter em caso de erro
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, available: !newStatus } : p));
    } finally {
      setUpdatingVisibilityId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const selectedCatObj = findMatchingCategory({ category: productForm.category, category_id: productForm.category }, categories);
      const isPizzaCat = isPizzaCategory(selectedCatObj);
      const usesSizeMatrix = hasCategorySizeMatrix(selectedCatObj);

      const cleanPizzaPrices = {};
      if (productForm.pizza_prices && typeof productForm.pizza_prices === "object") {
        Object.entries(productForm.pizza_prices).forEach(([sizeId, val]) => {
          if (val !== undefined && val !== null && val !== "") {
            const parsed = typeof val === "number" ? val : parseBRLToNumber(String(val));
            if (!isNaN(parsed) && parsed > 0) {
              cleanPizzaPrices[sizeId] = parsed;
            }
          }
        });
      }

      let finalPrice = 0;
      const hasPriceDefiningGroupSelected = selectedGroupIds.some((gid) => {
        const grp = complementGroups.find((g) => g.id === gid);
        if (!grp?.is_size_selector) return false;
        const itemsForGrp = complementItems.filter((i) => i.group_id === gid);
        return itemsForGrp.some((i) => Number(i.price) > 0);
      });

      if (usesSizeMatrix) {
        const sizePricesList = Object.values(cleanPizzaPrices);
        if (sizePricesList.length === 0) {
          toast.error(
            isPizzaCat
              ? "Por favor, preencha o preço de pelo menos um tamanho da pizza."
              : "Por favor, preencha o valor em pelo menos uma variação da grade."
          );
          setIsSubmitting(false);
          return;
        }
        // Preço base de referência para o catálogo (menor preço entre as variações ativas)
        finalPrice = Math.min(...sizePricesList);
      } else if (hasPriceDefiningGroupSelected) {
        // Se tiver grupo de escolha única com valores cadastrados (ex: Lata R$ 6 / Garrafa R$ 12), o preço base é dispensado
        const enteredPrice = parseBRLToNumber(productForm.price);
        const selectedSizeGroup = complementGroups.find((g) => {
          if (!selectedGroupIds.includes(g.id) || !g.is_size_selector) return false;
          return complementItems.some((i) => i.group_id === g.id && Number(i.price) > 0);
        });
        const sizeItems = selectedSizeGroup ? complementItems.filter((i) => i.group_id === selectedSizeGroup.id && Number(i.price) > 0) : [];
        const minSizePrice = sizeItems.length > 0 ? Math.min(...sizeItems.map((i) => Number(i.price))) : 0;

        finalPrice = (!isNaN(enteredPrice) && enteredPrice > 0) ? enteredPrice : minSizePrice;
      } else {
        finalPrice = parseBRLToNumber(productForm.price);
        if (isNaN(finalPrice) || finalPrice <= 0) {
          toast.error("Por favor, informe um preço válido para o produto.");
          setIsSubmitting(false);
          return;
        }
      }

      const productData = {
        ...productForm,
        sector_id: productForm.sector_id || null,
        price: finalPrice,
        available: Boolean(productForm.available),
        pizza_prices: cleanPizzaPrices,
      };

      const zodValidation = validateSchema(productSchema, productData);
      if (!zodValidation.success) {
        toast.error(zodValidation.errorList[0] || "Dados do produto inválidos");
        setIsSubmitting(false);
        return;
      }

      let savedProduct;
      if (editingProduct) {
        savedProduct = await Product.update(editingProduct.id, productData);
        toast.success("Produto atualizado com sucesso!");
      } else {
        savedProduct = await Product.create(productData);
        toast.success("Produto cadastrado com sucesso!");
      }

      const prodId = savedProduct?.id || editingProduct?.id;
      if (prodId) {
        // Sincronizar vínculos de complementos
        const currentLinks = productComplementGroups.filter(pcg => pcg.product_id === prodId);
        const currentGroupIds = currentLinks.map(pcg => pcg.group_id);

        // Remover desmarcados
        for (const link of currentLinks) {
          if (!selectedGroupIds.includes(link.group_id)) {
            await ProductComplementGroup.delete(link.id);
          }
        }

        // Adicionar novos
        for (const gid of selectedGroupIds) {
          if (!currentGroupIds.includes(gid)) {
            await ProductComplementGroup.create({
              product_id: prodId,
              group_id: gid,
              order_index: 0
            });
          }
        }
      }

      setShowModal(false);
      resetForm();
      await loadProducts();
    } catch (error) {
      toast.error("Erro ao salvar produto");
      console.error("Error saving product:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (productId) => {
    const ok = await appConfirm({
      title: "Excluir produto?",
      description: "Tem certeza que deseja excluir este produto?",
      confirmText: "Excluir Produto",
      variant: "danger",
    });
    if (ok) {
      try {
        await Product.delete(productId);
        toast.success("Produto excluído com sucesso!");
        await loadProducts();
      } catch (error) {
        toast.error("Erro ao excluir produto.");
        console.error("Error deleting product:", error);
      }
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const activeTenant = slug || localStorage.getItem("current_tenant_id") || "global";
        const { file_url } = await UploadFile({ file, maxDimension: 800, tenantId: activeTenant });
        setProductForm(prev => ({ ...prev, image_url: file_url }));
        toast.success("Imagem enviada com sucesso!");
      } catch (error) {
        toast.error("Erro ao fazer upload da imagem");
        console.error("Error uploading image:", error);
      }
    }
  };

  const resetForm = () => {
    setProductForm({
      name: "",
      description: "",
      price: "",
      category: "",
      sector_id: null,
      image_url: "",
      available: true,
      pizza_prices: {},
    });
    setSelectedGroupIds([]);
    setEditingProduct(null);
  };

  const openEditModal = (product) => {
    setProductForm({
      name: product.name,
      description: product.description || "",
      price: product.price !== undefined && product.price !== null ? formatToBRL(product.price) : "",
      category: product.category || "",
      sector_id: product.sector_id || null,
      image_url: product.image_url || "",
      available: product.available !== false,
      pizza_prices: parsePizzaPrices(product.pizza_prices),
    });
    const linked = productComplementGroups.filter(pcg => pcg.product_id === product.id).map(pcg => pcg.group_id);
    setSelectedGroupIds(linked);
    setEditingProduct(product);
    setShowModal(true);
  };

  const visibleCount = products.filter(p => p.available !== false).length;
  const hiddenCount = products.filter(p => p.available === false).length;

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = filterCategory === "all" || product.category === filterCategory;
    const matchesStatus = 
      filterStatus === "all" ? true :
      filterStatus === "visible" ? (product.available !== false) :
      filterStatus === "hidden" ? (product.available === false) : true;

    return matchesSearch && matchesCategory && matchesStatus;
  });
  
  const getCategoryNameById = (categoryId) => {
    return categories.find(c => c.id === categoryId)?.name || 'Sem Categoria';
  };

  const getCategorySizesById = (categoryId) => {
    const cat = categories.find(c => c.id === categoryId || c.name === categoryId);
    return Array.isArray(cat?.pizza_sizes) ? cat.pizza_sizes : [];
  };

  return (
    <div className="p-4 sm:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Superior */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Produtos & Cardápio
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Gerencie os itens do cardápio, valores, complementos e oculte produtos indisponíveis
            </p>
          </div>
          <Button 
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="bg-[#047857] hover:bg-[#065f46] text-white font-bold shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Produto
          </Button>
        </div>

        {/* Métricas Compactas / Atalhos de Filtro de Visibilidade */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
              filterStatus === "all" 
                ? "bg-white border-[#047857] ring-2 ring-[#047857]/15 shadow-xs" 
                : "bg-white border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Package className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-xs font-semibold text-gray-600 truncate">Total</span>
            </div>
            <span className="text-base sm:text-lg font-black font-mono tabular-nums text-gray-900">
              {products.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("visible")}
            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
              filterStatus === "visible" 
                ? "bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/15 shadow-xs" 
                : "bg-white border-gray-200 hover:border-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold text-emerald-700 truncate">Visíveis</span>
            </div>
            <span className="text-base sm:text-lg font-black font-mono tabular-nums text-emerald-700">
              {visibleCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("hidden")}
            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
              filterStatus === "hidden" 
                ? "bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/15 shadow-xs" 
                : "bg-white border-gray-200 hover:border-amber-200"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <EyeOff className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-semibold text-amber-700 truncate">Ocultos</span>
            </div>
            <span className="text-base sm:text-lg font-black font-mono tabular-nums text-amber-700">
              {hiddenCount}
            </span>
          </button>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col md:flex-row gap-3 bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Buscar por nome ou ingrediente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-gray-50/60 border-gray-200 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3">
            {/* Filtro por Categoria */}
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full sm:w-48 bg-gray-50/60 border-gray-200">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtro por Flag de Visibilidade / Ocultos */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-48 bg-gray-50/60 border-gray-200">
                <SelectValue placeholder="Visibilidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="visible">Apenas Visíveis ({visibleCount})</SelectItem>
                <SelectItem value="hidden">Apenas Ocultos ({hiddenCount})</SelectItem>
              </SelectContent>
            </Select>

            {/* Alternador de Visualização (Lista / Cards) */}
            <div
              className="inline-flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200 shrink-0"
              role="group"
              aria-label="Modo de visualização"
            >
              <button
                type="button"
                onClick={() => handleViewModeChange("list")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "list"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-500 hover:text-stone-800"
                }`}
                title="Visualizar em lista"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lista</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange("cards")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-white text-stone-900 shadow-2xs"
                    : "text-stone-500 hover:text-stone-800"
                }`}
                title="Visualizar em cards"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>
          </div>
        </div>

        {/* Lista ou Grid de Produtos */}
        {filteredProducts.length > 0 && (
          viewMode === "list" ? (
            <ProductListTable
              products={filteredProducts}
              getCategoryNameById={getCategoryNameById}
              getCategorySizesById={getCategorySizesById}
              updatingVisibilityId={updatingVisibilityId}
              onToggleVisibility={handleToggleVisibility}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          ) : (
            <ProductCardGrid
              products={filteredProducts}
              getCategoryNameById={getCategoryNameById}
              getCategorySizesById={getCategorySizesById}
              updatingVisibilityId={updatingVisibilityId}
              onToggleVisibility={handleToggleVisibility}
              onEdit={openEditModal}
              onDelete={handleDelete}
            />
          )
        )}

        {/* Estado Vazio */}
        {filteredProducts.length === 0 && !isLoading && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
              <Package className="w-7 h-7 text-stone-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              Nenhum produto encontrado
            </h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">
              {searchTerm || filterCategory !== "all" || filterStatus !== "all"
                ? "Nenhum item corresponde aos filtros selecionados. Tente ajustar a busca ou o status de visibilidade." 
                : "Seu cardápio ainda não tem nenhum produto cadastrado."}
            </p>
            {(searchTerm || filterCategory !== "all" || filterStatus !== "all") && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setFilterCategory("all");
                  setFilterStatus("all");
                }}
                className="text-xs"
              >
                Limpar Filtros
              </Button>
            )}
          </div>
        )}

        {/* Modal de Criação / Edição de Produto */}
        <Dialog open={showModal} onOpenChange={(open) => {
          if (!open) {
            resetForm();
          }
          setShowModal(open);
        }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 flex flex-col overflow-hidden bg-[#F7F9F8] border-stone-200">
            <DialogHeader className="px-6 py-4 bg-white border-b border-stone-200 text-left shrink-0">
              <DialogTitle className="text-lg font-bold text-stone-900">
                {editingProduct ? "Editar Produto" : "Novo Produto"}
              </DialogTitle>
              <p className="text-xs text-stone-500 mt-0.5">
                Configure informações, preços, foto e visibilidade no cardápio
              </p>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {/* Bloco 1: Dados Principais */}
                <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-3.5 shadow-2xs">
                  <div>
                    <Label htmlFor="name" className="text-xs font-semibold text-stone-700">
                      Nome do produto *
                    </Label>
                    <Input
                      id="name"
                      value={productForm.name}
                      onChange={(e) => setProductForm({...productForm, name: e.target.value})}
                      placeholder="Ex: Heineken 600ml, X-Salada, Coca-Cola 2L..."
                      className="mt-1 bg-stone-50/50 border-stone-200 focus:bg-white"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description" className="text-xs font-semibold text-stone-700">
                      Descrição
                    </Label>
                    <Textarea
                      id="description"
                      value={productForm.description}
                      onChange={(e) => setProductForm({...productForm, description: e.target.value})}
                      placeholder="Descreva detalhes, ingredientes ou características do produto..."
                      rows={2}
                      className="mt-1 bg-stone-50/50 border-stone-200 focus:bg-white resize-none"
                    />
                  </div>

                  {/* Preço e Categoria */}
                  {(() => {
                    const selectedCatObj = findMatchingCategory({ category: productForm.category, category_id: productForm.category }, categories);
                    const usesMatrix = hasCategorySizeMatrix(selectedCatObj);

                    const formatCategoryOptionLabel = (cat) => {
                      if (isPizzaCategory(cat)) return `${cat.name} (Pizza)`;
                      if (isVariationGridCategory(cat)) return `${cat.name} (Vários Tamanhos)`;
                      return cat.name;
                    };

                    const handleCategoryChange = (value) => {
                      const cat = findMatchingCategory({ category: value, category_id: value }, categories);
                      const catUsesMatrix = hasCategorySizeMatrix(cat);
                      const hasExisting = productForm.pizza_prices && Object.keys(productForm.pizza_prices).length > 0;
                      if (catUsesMatrix && !editingProduct && !hasExisting) {
                        const defaults = buildDefaultPizzaPrices(cat.pizza_sizes || []);
                        setProductForm({
                          ...productForm,
                          category: value,
                          pizza_prices: defaults,
                        });
                      } else {
                        setProductForm({ ...productForm, category: value });
                      }
                    };

                    if (usesMatrix) {
                      return (
                        <div>
                          <Label htmlFor="category" className="text-xs font-semibold text-stone-700">
                            Categoria *
                          </Label>
                          <Select
                            value={productForm.category}
                            onValueChange={handleCategoryChange}
                          >
                            <SelectTrigger id="category" className="w-full mt-1 bg-stone-50/50 border-stone-200">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map(cat => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {formatCategoryOptionLabel(cat)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    }

                    const hasPriceDefiningGroupSelected = selectedGroupIds.some((gid) => {
                      const grp = complementGroups.find((g) => g.id === gid);
                      if (!grp?.is_size_selector) return false;
                      const itemsForGrp = complementItems.filter((i) => i.group_id === gid);
                      return itemsForGrp.some((i) => Number(i.price) > 0);
                    });

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <Label htmlFor="price" className="text-xs font-semibold text-stone-700">
                            Preço (R$) {hasPriceDefiningGroupSelected ? (
                              <span className="text-blue-700 font-normal text-[11px]">(Opcional · Definido nas opções)</span>
                            ) : (
                              <span className="text-red-500">*</span>
                            )}
                          </Label>
                          <CurrencyInput
                            id="price"
                            value={productForm.price}
                            onChange={(e) => setProductForm({...productForm, price: e.target.value})}
                            placeholder={hasPriceDefiningGroupSelected ? "R$ 0,00" : "R$ 32,90"}
                            className={`mt-1 border-stone-200 font-mono ${
                              hasPriceDefiningGroupSelected ? "bg-blue-50/40 border-blue-200 focus:bg-white" : "bg-stone-50/50 focus:bg-white"
                            }`}
                            required={!hasPriceDefiningGroupSelected}
                          />
                          {hasPriceDefiningGroupSelected && (
                            <span className="text-[10px] text-blue-700/80 mt-1 block">
                              ✓ Preço dispensado: o valor de venda será definido pela opção que o cliente escolher.
                            </span>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="category" className="text-xs font-semibold text-stone-700">
                            Categoria *
                          </Label>
                          <Select
                            value={productForm.category}
                            onValueChange={handleCategoryChange}
                          >
                            <SelectTrigger id="category" className="mt-1 bg-stone-50/50 border-stone-200">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map(cat => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {formatCategoryOptionLabel(cat)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Setor de Produção */}
                  {productionSectors.length > 0 && (() => {
                    const selectedCatObj = findMatchingCategory({ category: productForm.category, category_id: productForm.category }, categories);
                    const inheritedSector = selectedCatObj?.sector_id
                      ? productionSectors.find(s => String(s.id) === String(selectedCatObj.sector_id))
                      : null;
                    return (
                      <div>
                        <Label htmlFor="product-sector" className="text-xs font-semibold text-stone-700">
                          Setor de Preparo / Impressão (Opcional)
                        </Label>
                        <Select
                          value={productForm.sector_id || "__inherit__"}
                          onValueChange={(value) =>
                            setProductForm({ ...productForm, sector_id: value === "__inherit__" ? null : value })
                          }
                        >
                          <SelectTrigger id="product-sector" className="mt-1 bg-stone-50/50 border-stone-200">
                            <SelectValue placeholder="Herdar da categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__inherit__">
                              {inheritedSector
                                ? `Herdar da categoria (${inheritedSector.name})`
                                : "Herdar da categoria (sem setor específico)"}
                            </SelectItem>
                            {productionSectors.map((sec) => (
                              <SelectItem key={sec.id} value={String(sec.id)}>
                                {sec.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })()}
                </div>

                {/* Bloco 2: Grade de Preços por Tamanho / Embalagem da Categoria */}
                {(() => {
                  const selectedCatObj = findMatchingCategory({ category: productForm.category, category_id: productForm.category }, categories);
                  if (!hasCategorySizeMatrix(selectedCatObj)) return null;

                  const isPizza = isPizzaCategory(selectedCatObj);
                  const sizes = getCategoryMatrixSizes(selectedCatObj);

                  const defaultPricesMap = buildDefaultPizzaPrices(sizes);
                  const hasCategoryDefaults = Object.keys(defaultPricesMap).length > 0;

                  const activeSizesCount = sizes.filter((s) => {
                    const rawVal = productForm.pizza_prices?.[s.id];
                    if (rawVal === undefined || rawVal === null || rawVal === "") return false;
                    const parsed = typeof rawVal === "number" ? rawVal : parseBRLToNumber(String(rawVal));
                    return Number.isFinite(parsed) && parsed > 0;
                  }).length;

                  return (
                    <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3.5 shadow-2xs">
                      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-stone-100">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-bold text-stone-900">
                              {isPizza ? "Preços por Tamanho da Pizza" : `Tamanhos & Preços — ${selectedCatObj?.name || "Categoria"}`}
                            </p>
                            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                              {activeSizesCount} de {sizes.length} tamanhos com preço
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            {isPizza
                              ? "Defina o valor deste sabor para cada tamanho disponível."
                              : "Digite o preço apenas nos tamanhos que este produto tiver à venda. Os tamanhos deixados em branco (---) não aparecerão para o cliente."}
                          </p>
                        </div>
                        {hasCategoryDefaults && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setProductForm((prev) => ({
                                ...prev,
                                pizza_prices: { ...defaultPricesMap },
                              }))
                            }
                            className="h-7 px-2.5 text-[11px] bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100 shrink-0 cursor-pointer"
                          >
                            Usar padrão
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {sizes.map((size) => {
                          const rawVal = productForm.pizza_prices?.[size.id];
                          const numVal =
                            rawVal !== undefined && rawVal !== null && rawVal !== ""
                              ? typeof rawVal === "number"
                                ? rawVal
                                : parseBRLToNumber(String(rawVal))
                              : 0;
                          const isFilled = Number.isFinite(numVal) && numVal > 0;

                          return (
                            <div
                              key={size.id}
                              className={`p-2.5 rounded-xl border transition-all ${
                                isFilled
                                  ? "bg-emerald-50/40 border-emerald-300"
                                  : "bg-stone-50/60 border-stone-200"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <Label className="text-[11px] font-bold text-stone-800 truncate">
                                  {size.name}
                                </Label>
                                <span
                                  className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                                    isFilled
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-stone-200/70 text-stone-500"
                                  }`}
                                >
                                  {isFilled ? "Ativo" : "---"}
                                </span>
                              </div>
                              <CurrencyInput
                                value={
                                  rawVal !== undefined
                                    ? typeof rawVal === "number"
                                      ? rawVal > 0
                                        ? formatToBRL(rawVal)
                                        : ""
                                      : rawVal
                                    : ""
                                }
                                onChange={(e) => {
                                  setProductForm((prev) => ({
                                    ...prev,
                                    pizza_prices: {
                                      ...(prev.pizza_prices || {}),
                                      [size.id]: e.target.value,
                                    },
                                  }));
                                }}
                                placeholder="--- (Não vende)"
                                className="h-8 text-xs bg-white border-stone-200 focus:border-[#047857] font-mono"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Bloco 3: Imagem & Visibilidade */}
                <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-3.5 shadow-2xs">
                  <div>
                    <Label htmlFor="image" className="text-xs font-semibold text-stone-700">
                      Imagem do produto
                    </Label>
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="mt-1 cursor-pointer bg-stone-50/50 border-stone-200 text-xs"
                    />
                    {productForm.image_url && (
                      <div className="mt-2.5 flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200">
                        <div className="flex items-center gap-3">
                          <div className="relative group w-14 h-14 rounded-lg overflow-hidden border border-stone-200 bg-white flex-shrink-0 shadow-2xs">
                            <img
                              src={productForm.image_url}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Imagem carregada
                            </span>
                            <p className="text-[11px] text-stone-500 mt-0.5">Pronta para exibição no cardápio</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setProductForm(prev => ({ ...prev, image_url: "" }));
                            const fileInput = document.getElementById("image");
                            if (fileInput) fileInput.value = "";
                            toast.info("Foto removida.");
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:text-white hover:bg-rose-600 border border-rose-200 hover:border-rose-600 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Remover
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Flag de Visibilidade */}
                  <div className={`p-3 rounded-xl border transition-all ${
                    productForm.available 
                      ? "bg-emerald-50/60 border-emerald-200" 
                      : "bg-amber-50/80 border-amber-200"
                  }`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          {productForm.available ? (
                            <Eye className="w-4 h-4 text-emerald-700" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-amber-700" />
                          )}
                          <Label htmlFor="form-available" className="font-semibold text-xs text-stone-900 cursor-pointer">
                            {productForm.available ? "Produto visível no cardápio" : "Produto oculto (indisponível)"}
                          </Label>
                        </div>
                        <p className="text-[11px] text-stone-600">
                          {productForm.available 
                            ? "Aparece normalmente para os clientes comprarem."
                            : "Oculto no cardápio online até ser reativado."}
                        </p>
                      </div>

                      <Switch
                        id="form-available"
                        checked={productForm.available}
                        onCheckedChange={(checked) => setProductForm({...productForm, available: checked})}
                        className="data-[state=checked]:bg-emerald-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Bloco 4: Grupos de Complementos */}
                <div className="bg-white border border-stone-200/90 rounded-xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-[#047857]" /> Adicionais & Complementos
                      </h4>
                      <p className="text-[11px] text-stone-500">Selecione os grupos vinculados a este produto</p>
                    </div>
                    <Link 
                      to={createPageUrl("Complements")} 
                      className="text-[11px] text-[#047857] hover:underline font-semibold flex items-center gap-1"
                    >
                      Gerenciar <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  {complementGroups.length === 0 ? (
                    <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs text-stone-600">
                      Nenhum grupo cadastrado. <Link to={createPageUrl("Complements")} className="underline font-semibold text-[#047857]">Criar grupos</Link>.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                      {complementGroups.map(grp => {
                        const isSelected = selectedGroupIds.includes(grp.id);
                        const grpItems = complementItems.filter(i => i.group_id === grp.id);
                        const itemsPreview = grpItems.map(i => i.name).join(", ");

                        return (
                          <label 
                            key={grp.id} 
                            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected ? 'bg-emerald-50/70 border-[#047857] shadow-2xs ring-1 ring-[#047857]/30' : 'bg-stone-50/60 border-stone-200 hover:border-stone-300'
                            }`}
                          >
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedGroupIds([...selectedGroupIds, grp.id]);
                                } else {
                                  setSelectedGroupIds(selectedGroupIds.filter(id => id !== grp.id));
                                }
                              }}
                              className="mt-1 data-[state=checked]:bg-[#047857] data-[state=checked]:border-[#047857]"
                            />
                            <div className="min-w-0 flex-1 text-xs space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-stone-900 block truncate">{grp.name}</span>
                                {grp.is_size_selector ? (
                                  <span className="text-[9px] font-extrabold uppercase bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                                    🔘 Escolha Única
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                                    ➕ Múltipla Escolha
                                  </span>
                                )}
                              </div>

                              {grp.description && grp.description.trim() !== "" ? (
                                <p className="text-[11px] text-emerald-900 font-medium bg-emerald-100/70 px-2 py-0.5 rounded border border-emerald-300/60 line-clamp-2">
                                  <span className="font-bold text-emerald-950">Anotação:</span> {grp.description}
                                </p>
                              ) : (
                                <p className="text-[10px] text-stone-400 italic">
                                  (Sem anotação interna cadastrada)
                                </p>
                              )}

                              {itemsPreview ? (
                                <p className="text-[10px] text-stone-600 line-clamp-2">
                                  <span className="font-semibold text-stone-700">Opções ({grpItems.length}):</span> {itemsPreview}
                                </p>
                              ) : (
                                <p className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 inline-block font-medium">
                                  ⚠️ Nenhuma opção cadastrada
                                </p>
                              )}

                              <div className="text-stone-500 text-[10px] pt-0.5 border-t border-stone-200/60 flex items-center justify-between">
                                <span>{grp.is_size_selector ? 'Tamanho Principal' : grp.required || grp.min_quantity > 0 ? 'Obrigatório' : 'Opcional'} · Máx: {grp.max_quantity}</span>
                                {Number(grp.free_quantity) > 0 && (
                                  <span className="font-bold text-emerald-700">{grp.free_quantity} grátis</span>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {editingProduct && allAdditionals.some(a => a.product_id === editingProduct.id) && (
                  <AdditionalsManager 
                    productId={editingProduct.id}
                    initialAdditionals={allAdditionals.filter(a => a.product_id === editingProduct.id)}
                  />
                )}
              </div>

              {/* Rodapé Fixo */}
              <div className="px-6 py-3.5 bg-white border-t border-stone-200 flex items-center justify-end gap-2.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {setShowModal(false); resetForm();}}
                  className="h-9 px-4 text-xs border-stone-300 text-stone-700 cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-9 px-5 text-xs bg-[#047857] hover:bg-[#065f46] text-white font-bold cursor-pointer"
                >
                  {isSubmitting ? "Salvando..." : "Salvar Produto"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}