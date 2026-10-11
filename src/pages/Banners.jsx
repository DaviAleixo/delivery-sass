
import React, { useState, useEffect } from "react";
import { BannerImage } from "@/entities/BannerImage";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, GripVertical, Image, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function BannersPage() {
  const [banners, setBanners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [bannerForm, setBannerForm] = useState({
    title: "",
    image_url: "",
    order_index: 0,
    active: true
  });

  useEffect(() => {
    loadBanners();
  }, []);

  const loadBanners = async () => {
    setIsLoading(true);
    const bannersData = await BannerImage.list("order_index");
    setBanners(bannersData);
    setIsLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingBanner) {
        await BannerImage.update(editingBanner.id, bannerForm);
      } else {
        await BannerImage.create(bannerForm);
      }

      setShowModal(false);
      resetForm();
      loadBanners();
    } catch (_error) {
      alert("Erro ao salvar banner");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (bannerId) => {
    if (confirm("Tem certeza que deseja excluir este banner?")) {
      await BannerImage.delete(bannerId);
      loadBanners();
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsUploading(true);
      try {
        const { file_url } = await UploadFile({ file, maxDimension: 1200 });
        setBannerForm(prev => ({ ...prev, image_url: file_url }));
      } catch (_error) {
        alert("Erro ao fazer upload da imagem");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const resetForm = () => {
    setBannerForm({
      title: "",
      image_url: "",
      order_index: 0,
      active: true
    });
    setEditingBanner(null);
  };

  const openEditModal = (banner) => {
    setBannerForm({
      title: banner.title || "",
      image_url: banner.image_url,
      order_index: banner.order_index || 0,
      active: banner.active
    });
    setEditingBanner(banner);
    setShowModal(true);
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Banners</h1>
            <p className="text-gray-600 mt-2">Gerencie as imagens de destaque do cardápio</p>
          </div>
          <Button 
            onClick={() => setShowModal(true)}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Banner
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {banners.map((banner) => (
              <motion.div
                key={banner.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="aspect-[3/1] overflow-hidden bg-stone-900 relative">
                    {banner.image_url ? (
                      <img
                        src={banner.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-6xl text-gray-300">
                        <Image className="w-16 h-16" />
                      </div>
                    )}
                    
                    <div className="absolute top-2 right-2 flex gap-1">
                      <div className="w-6 h-6 bg-gray-800/70 rounded-full flex items-center justify-center">
                        <GripVertical className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  </div>
                  
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-500">
                        Ordem: {banner.order_index}
                      </span>
                      <Switch 
                        checked={banner.active}
                        onCheckedChange={async (checked) => {
                          await BannerImage.update(banner.id, { ...banner, active: checked });
                          loadBanners();
                        }}
                        className="data-[state=checked]:bg-red-500"
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditModal(banner)}
                        className="flex-1"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(banner.id)}
                        className="flex-1 text-red-600 hover:text-red-700"
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

        {banners.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🖼️</div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              Nenhum banner encontrado
            </h3>
            <p className="text-gray-600">
              Adicione banners para destacar promoções e produtos especiais.
            </p>
          </div>
        )}

        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingBanner ? "Editar Banner" : "Novo Banner"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="image">Imagem do banner *</Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="cursor-pointer mt-1"
                  required={!editingBanner && !bannerForm.image_url}
                />
                {bannerForm.image_url && (
                  <div className="mt-3 relative group rounded-xl overflow-hidden border border-stone-200 bg-stone-950 aspect-[3/1] flex items-center justify-center shadow-xs">
                    <img
                      src={bannerForm.image_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBannerForm(prev => ({ ...prev, image_url: "" }));
                        const fileInput = document.getElementById("image");
                        if (fileInput) fileInput.value = "";
                      }}
                      className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-7 h-7 flex items-center justify-center shadow-lg transition-transform hover:scale-110 cursor-pointer"
                      title="Remover foto do banner (X)"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                    </button>
                    <div className="absolute bottom-2 left-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBannerForm(prev => ({ ...prev, image_url: "" }));
                          const fileInput = document.getElementById("image");
                          if (fileInput) fileInput.value = "";
                        }}
                        className="text-[11px] font-bold bg-black/75 hover:bg-red-600 text-white px-2.5 py-1 rounded-lg backdrop-blur-md transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Remover foto
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1 text-amber-950">
                    📐 Tamanho Recomendado para o Banner:
                  </p>
                  <p className="font-medium text-amber-900">
                    • <strong>1200 x 400 px</strong> (Proporção Panorâmica 3:1) ou <strong>1920 x 640 px</strong>.
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    💡 <strong>Dica de design:</strong> Mantenha o logo e os textos principais centralizados no meio da imagem (área de segurança), garantindo que nada seja cortado no celular ou no computador.
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="order">Ordem de exibição</Label>
                <Input
                  id="order"
                  type="number"
                  value={bannerForm.order_index}
                  onChange={(e) => setBannerForm({...bannerForm, order_index: parseInt(e.target.value) || 0})}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={bannerForm.active}
                  onCheckedChange={(checked) => setBannerForm({...bannerForm, active: checked})}
                  className="data-[state=checked]:bg-red-500"
                />
                <Label htmlFor="active">Banner ativo</Label>
              </div>

              <div className="flex gap-3">
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
                  disabled={isSubmitting || isUploading}
                  className="flex-1 bg-red-500 hover:bg-red-600"
                >
                  {isSubmitting ? "Salvando..." : (isUploading ? "Enviando foto..." : "Salvar")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
