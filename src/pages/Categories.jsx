import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Category } from "@/entities/Category";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function CategoriesPage() {
  const { slug } = useParams();
  const location = useLocation();
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    order_index: 0,
    is_combo: false,
  });

  useEffect(() => {
    setCategories([]);
    loadData();
  }, [slug, location.pathname]);

  const loadData = async () => {
    setIsLoading(true);
    const categoriesData = await Category.list("order_index");
    setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    setIsLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Se esta categoria for marcada como combo, desativa is_combo de todas as outras (permitido apenas 1)
      if (categoryForm.is_combo) {
        const otherCombos = categories.filter(
          (c) => c.is_combo && (!editingCategory || c.id !== editingCategory.id)
        );
        for (const other of otherCombos) {
          await Category.update(other.id, { is_combo: false });
        }
      }

      if (editingCategory) {
        await Category.update(editingCategory.id, categoryForm);
      } else {
        await Category.create(categoryForm);
      }

      setShowModal(false);
      resetForm();
      loadData();
    } catch (_error) {
      alert("Erro ao salvar categoria");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (categoryId) => {
    if (confirm("Tem certeza que deseja excluir esta categoria?")) {
      await Category.delete(categoryId);
      loadData();
    }
  };

  const resetForm = () => {
    setCategoryForm({
      name: "",
      order_index: 0,
      is_combo: false,
    });
    setEditingCategory(null);
  };

  const openEditModal = (category) => {
    setCategoryForm({
      name: category.name,
      order_index: category.order_index || 0,
      is_combo: !!category.is_combo,
    });
    setEditingCategory(category);
    setShowModal(true);
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Categorias</h1>
            <p className="text-gray-600 mt-2">Gerencie as categorias de produtos do seu cardápio</p>
          </div>
          <Button 
            onClick={() => { setShowModal(true); resetForm(); }}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Categoria
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {categories.map((category) => (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <Card className={`overflow-hidden hover:shadow-lg transition-shadow border-2 ${category.is_combo ? 'border-red-500 bg-red-50/20' : 'hover:border-red-200'}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg text-gray-900">{category.name}</CardTitle>
                      {category.is_combo && (
                        <span className="inline-flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-xs">
                          <Sparkles className="w-3 h-3" />
                          Combos
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex items-center justify-between mb-4 text-sm text-gray-500">
                      <span>Ordem: <span className="font-medium text-gray-700">{category.order_index}</span></span>
                      {category.is_combo ? (
                        <span className="text-xs font-bold text-red-600">Banner Promocional Ativo</span>
                      ) : (
                        <span>Padrão</span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(category)}
                        className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(category.id)}
                        className="flex-1 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {categories.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📂</div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              Nenhuma categoria encontrada
            </h3>
            <p className="text-gray-600">
              Crie sua primeira categoria para organizar o cardápio.
            </p>
          </div>
        )}
        
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-800">
                {editingCategory ? "Editar Categoria" : "Nova Categoria"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Nome da categoria *</Label>
                  <Input
                    id="name"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({...categoryForm, name: e.target.value})}
                    required
                    placeholder="Ex: Combos Especiais"
                    className="border-red-200 focus:border-red-600 mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="order">Ordem de exibição</Label>
                  <Input
                    id="order"
                    type="number"
                    value={categoryForm.order_index}
                    onChange={(e) => setCategoryForm({...categoryForm, order_index: parseInt(e.target.value) || 0})}
                    className="border-red-200 focus:border-red-600 mt-1"
                  />
                </div>

                {/* Flag de Categoria de Combos */}
                <div className="flex items-center justify-between p-3 bg-red-50/50 rounded-xl border border-red-100">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_combo" className="text-sm font-bold text-gray-900 cursor-pointer">
                      Categoria de Combos (Banner Promocional)
                    </Label>
                    <p className="text-xs text-gray-500">
                      Ativa o card promocional no cardápio direcionando direto para esta categoria.
                    </p>
                  </div>
                  <Switch
                    id="is_combo"
                    checked={categoryForm.is_combo}
                    onCheckedChange={(checked) => setCategoryForm({ ...categoryForm, is_combo: checked })}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {setShowModal(false); resetForm();}}
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  {isSubmitting ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}