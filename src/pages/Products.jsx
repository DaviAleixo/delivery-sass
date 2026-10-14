import React, { useState, useEffect } from "react";
import { Product } from "@/entities/Product";
import { ProductAdditional } from "@/entities/ProductAdditional";
import { Category } from "@/entities/Category";
import { ComplementGroup } from "@/entities/ComplementGroup";
import { ProductComplementGroup } from "@/entities/ProductComplementGroup";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber, formatToBRL } from "@/utils/moneyMask";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { validateSchema, productSchema } from "@/schemas";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Layers, 
  ExternalLink, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Package, 
  X
} from "lucide-react";
import { Link, useParams, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";
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
            placeholder="Ex: Bacon"
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
  const [allAdditionals, setAllAdditionals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [complementGroups, setComplementGroups] = useState([]);
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
    image_url: "",
    available: true
  });

  const { slug } = useParams();
  const location = useLocation();
  const { tenant } = useTenant();
  const salonMode = tenant?.salon_mode || (tenant?.plan === 'showcase' ? 'showcase' : (tenant?.plan === 'table' ? 'table_only' : 'full'));
  const isVisualOnly = salonMode === 'showcase';

  useEffect(() => {
    setProducts([]);
    setAllAdditionals([]);
    setCategories([]);
    setComplementGroups([]);
    setProductComplementGroups([]);
    loadProducts();
  }, [slug, location.pathname, tenant?.id, tenant?.salon_mode, tenant?.plan]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const [productsData, additionalsData, categoriesData, groupsData, pcgData] = await Promise.all([
        Product.list("-created_date"),
        ProductAdditional.list(),
        Category.list("order_index"),
        ComplementGroup.list("order_index"),
        ProductComplementGroup.list("-created_date")
      ]);
      setProducts(productsData || []);
      setAllAdditionals(additionalsData || []);
      setCategories(categoriesData || []);
      setComplementGroups(groupsData || []);
      setProductComplementGroups(pcgData || []);
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
      const productData = {
        ...productForm,
        price: parseBRLToNumber(productForm.price),
        available: Boolean(productForm.available)
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
    if (confirm("Tem certeza que deseja excluir este produto?")) {
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
        const { file_url } = await UploadFile({ file });
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
      image_url: "",
      available: true
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
      image_url: product.image_url || "",
      available: product.available !== false
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

  return (
    <div className="p-4 sm:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Superior */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              📦 Produtos & Cardápio
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
            className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-md shadow-red-950/10"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Produto
          </Button>
        </div>

        {/* Métricas Rápidas / Atalhos de Filtro de Visibilidade */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setFilterStatus("all")}
            className={`p-3 sm:p-4 rounded-xl border text-left transition-all ${
              filterStatus === "all" 
                ? "bg-white border-red-500 ring-2 ring-red-500/20 shadow-sm" 
                : "bg-white border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</span>
              <Package className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-gray-900 mt-1">{products.length}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Todos os itens</p>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("visible")}
            className={`p-3 sm:p-4 rounded-xl border text-left transition-all ${
              filterStatus === "visible" 
                ? "bg-emerald-50/60 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm" 
                : "bg-white border-gray-200 hover:border-emerald-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Visíveis</span>
              <Eye className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">{visibleCount}</p>
            <p className="text-[11px] text-emerald-600 mt-0.5">Exibidos no cardápio</p>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus("hidden")}
            className={`p-3 sm:p-4 rounded-xl border text-left transition-all ${
              filterStatus === "hidden" 
                ? "bg-amber-50/60 border-amber-500 ring-2 ring-amber-500/20 shadow-sm" 
                : "bg-white border-gray-200 hover:border-amber-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Ocultos</span>
              <EyeOff className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1">{hiddenCount}</p>
            <p className="text-[11px] text-amber-600 mt-0.5">Invisíveis aos clientes</p>
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
                <SelectItem value="visible">👁️ Apenas Visíveis ({visibleCount})</SelectItem>
                <SelectItem value="hidden">🚫 Apenas Ocultos ({hiddenCount})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Grid de Cards de Produtos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          <AnimatePresence>
            {filteredProducts.map((product) => {
              const isVisible = product.available !== false;
              const isUpdatingThis = updatingVisibilityId === product.id;

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className={`overflow-hidden transition-all duration-200 flex flex-col justify-between h-full border ${
                    isVisible 
                      ? "bg-white border-gray-200 hover:shadow-md hover:border-gray-300" 
                      : "bg-stone-50/90 border-amber-300/80 shadow-xs"
                  }`}>
                    {/* Imagem do Produto com Badge de Visibilidade Flutuante */}
                    <div className="relative aspect-video sm:aspect-4/3 overflow-hidden bg-gray-100">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className={`w-full h-full object-cover transition-all ${
                            isVisible ? "" : "grayscale-40 opacity-75"
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl bg-stone-100 text-gray-400">
                          🍽️
                        </div>
                      )}

                      {/* Badge de Status / Flag */}
                      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
                        <Badge 
                          variant="outline"
                          className={`shadow-sm text-xs font-bold px-2.5 py-1 backdrop-blur-md flex items-center gap-1.5 ${
                            isVisible 
                              ? "bg-emerald-500/90 text-white border-emerald-400" 
                              : "bg-amber-500/95 text-white border-amber-400"
                          }`}
                        >
                          {isVisible ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              Visível
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              Oculto
                            </>
                          )}
                        </Badge>
                      </div>

                      {/* Categoria pill */}
                      <div className="absolute bottom-2 left-2 z-10">
                        <span className="bg-black/70 backdrop-blur-md text-white text-[11px] font-semibold px-2 py-0.5 rounded-md">
                          {getCategoryNameById(product.category)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Conteúdo do Card */}
                    <CardContent className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={`font-bold text-base line-clamp-1 ${
                            isVisible ? "text-gray-900" : "text-stone-700"
                          }`}>
                            {product.name}
                          </h3>
                        </div>
                        
                        {product.description ? (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                            {product.description}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400 italic mt-1">Sem descrição cadastrada</p>
                        )}
                      </div>

                      <div className="space-y-3 pt-2 border-t border-gray-100">
                        {/* Preço e Ações Principais */}
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-extrabold text-red-600">
                            R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}
                          </span>

                          <div className="flex gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditModal(product)}
                              className="h-8 px-2.5 text-xs text-gray-700 hover:bg-gray-100 border-gray-300"
                              title="Editar produto"
                            >
                              <Edit className="w-3.5 h-3.5 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(product.id)}
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Excluir produto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Switch Rápido de Ocultar / Exibir (Flag) */}
                        <div className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                          isVisible 
                            ? "bg-emerald-50/50 border-emerald-200/80" 
                            : "bg-amber-50/70 border-amber-200"
                        }`}>
                          <div className="flex items-center gap-2">
                            {isVisible ? (
                              <Eye className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-amber-600" />
                            )}
                            <Label 
                              htmlFor={`switch-vis-${product.id}`}
                              className="text-xs font-semibold cursor-pointer select-none"
                            >
                              {isVisible ? "Visível no cardápio" : "Oculto no cardápio"}
                            </Label>
                          </div>

                          <Switch
                            id={`switch-vis-${product.id}`}
                            checked={isVisible}
                            disabled={isUpdatingThis}
                            onCheckedChange={() => handleToggleVisibility(product)}
                            className="data-[state=checked]:bg-emerald-600"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Estado Vazio */}
        {filteredProducts.length === 0 && !isLoading && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center text-3xl mx-auto mb-3">
              📦
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
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {editingProduct ? "Editar Produto" : "Novo Produto"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div>
                <Label htmlFor="name">Nome do produto *</Label>
                <Input
                  id="name"
                  value={productForm.name}
                  onChange={(e) => setProductForm({...productForm, name: e.target.value})}
                  placeholder="Ex: Vrum Bacon Especial"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={productForm.description}
                  onChange={(e) => setProductForm({...productForm, description: e.target.value})}
                  placeholder="Descreva os ingredientes, pão, molho..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Preço (R$) *</Label>
                  <CurrencyInput
                    id="price"
                    value={productForm.price}
                    onChange={(e) => setProductForm({...productForm, price: e.target.value})}
                    placeholder="R$ 32,90"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="category">Categoria *</Label>
                  <Select
                    value={productForm.category}
                    onValueChange={(value) => setProductForm({...productForm, category: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                         <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="image">Imagem do produto</Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="cursor-pointer"
                />
                {productForm.image_url && (
                  <div className="mt-2.5 flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200">
                    <div className="flex items-center gap-3">
                      <div className="relative group w-16 h-16 rounded-lg overflow-hidden border border-stone-200 bg-white flex-shrink-0 shadow-xs">
                        <img
                          src={productForm.image_url}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setProductForm(prev => ({ ...prev, image_url: "" }));
                            const fileInput = document.getElementById("image");
                            if (fileInput) fileInput.value = "";
                            toast.info("Foto removida.");
                          }}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md transition-transform hover:scale-110"
                          title="Remover foto (X)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div>
                        <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Imagem carregada
                        </span>
                        <p className="text-[11px] text-stone-500 mt-0.5">Clique no X para excluir a foto</p>
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
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 transition-colors flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Remover
                    </button>
                  </div>
                )}
              </div>

              {/* Seção Destacada de Flag de Visibilidade / Ocultar Produto */}
              <div className={`p-4 rounded-xl border transition-all ${
                productForm.available 
                  ? "bg-emerald-50/60 border-emerald-200" 
                  : "bg-amber-50/80 border-amber-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      {productForm.available ? (
                        <Eye className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-amber-700" />
                      )}
                      <Label htmlFor="form-available" className="font-bold text-sm text-gray-900 cursor-pointer">
                        {productForm.available ? "Produto Visível no Cardápio" : "Produto Oculto (Indisponível)"}
                      </Label>
                    </div>
                    <p className="text-xs text-gray-600">
                      {productForm.available 
                        ? "O produto aparecerá normalmente no cardápio online para todos os clientes comprarem."
                        : "O produto ficará oculto no cardápio online dos clientes até que seja reativado."}
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

              {/* Grupos de Complementos e Adicionais Globais */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-red-600" /> Grupos de Adicionais & Complementos
                    </h4>
                    <p className="text-xs text-gray-500">Selecione quais grupos de opções este produto possui</p>
                  </div>
                  <Link 
                    to={createPageUrl("Complements")} 
                    className="text-xs text-red-600 hover:underline font-semibold flex items-center gap-1"
                  >
                    Gerenciar Grupos <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {complementGroups.length === 0 ? (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                    Nenhum grupo global cadastrado. <Link to={createPageUrl("Complements")} className="underline font-bold">Criar grupos de complementos</Link>.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2 bg-stone-50 rounded-xl border border-stone-200">
                    {complementGroups.map(grp => {
                      const isSelected = selectedGroupIds.includes(grp.id);
                      return (
                        <label 
                          key={grp.id} 
                          className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                            isSelected ? 'bg-red-50/70 border-red-300 shadow-xs' : 'bg-white border-gray-200 hover:border-gray-300'
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
                            className="mt-0.5 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                          />
                          <div className="min-w-0 flex-1 text-xs">
                            <span className="font-semibold text-gray-800 block truncate">{grp.name}</span>
                            <span className="text-gray-500 text-[11px]">
                              {grp.required || grp.min_quantity > 0 ? 'Obrigatório' : 'Opcional'} • Máx: {grp.max_quantity}
                            </span>
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

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {setShowModal(false); resetForm();}}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
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