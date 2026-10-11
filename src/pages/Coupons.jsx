import React, { useState, useEffect } from "react";
import { Coupon } from "@/entities/Coupon";
import { Product } from "@/entities/Product";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { parseBRLToNumber, formatToBRL } from "@/utils/moneyMask";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, Tag, Percent, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function CouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: "",
    name: "",
    description: "",
    discount_type: "percentage",
    discount_value: "",
    apply_to: "order_total",
    applicable_products: [],
    min_order_value: "",
    usage_limit: "",
    start_date: "",
    end_date: "",
    active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [couponsData, productsData] = await Promise.all([
      Coupon.list("-created_date"),
      Product.list()
    ]);
    setCoupons(couponsData);
    setProducts(productsData);
    setIsLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const couponData = {
        ...couponForm,
        code: couponForm.code.toUpperCase(),
        discount_value: couponForm.discount_type === 'fixed_amount' 
          ? parseBRLToNumber(couponForm.discount_value) 
          : (parseFloat(couponForm.discount_value) || 0),
        min_order_value: parseBRLToNumber(couponForm.min_order_value),
        usage_limit: couponForm.usage_limit ? parseInt(couponForm.usage_limit) : null,
        start_date: couponForm.start_date ? new Date(couponForm.start_date + 'T00:00:00').toISOString() : null,
        end_date: couponForm.end_date ? new Date(couponForm.end_date + 'T23:59:59').toISOString() : null
      };

      if (editingCoupon) {
        await Coupon.update(editingCoupon.id, couponData);
      } else {
        await Coupon.create(couponData);
      }

      setShowModal(false);
      resetForm();
      loadData();
    } catch (_error) {
      alert("Erro ao salvar cupom");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (couponId) => {
    if (confirm("Tem certeza que deseja excluir este cupom?")) {
      await Coupon.delete(couponId);
      loadData();
    }
  };

  const resetForm = () => {
    setCouponForm({
      code: "",
      name: "",
      description: "",
      discount_type: "percentage",
      discount_value: "",
      apply_to: "order_total",
      applicable_products: [],
      min_order_value: "",
      usage_limit: "",
      start_date: "",
      end_date: "",
      active: true
    });
    setEditingCoupon(null);
  };

  const openEditModal = (coupon) => {
    setCouponForm({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description || "",
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_type === 'fixed_amount' 
        ? (coupon.discount_value ? formatToBRL(coupon.discount_value) : "")
        : (coupon.discount_value?.toString() || ""),
      apply_to: coupon.apply_to,
      applicable_products: coupon.applicable_products || [],
      min_order_value: coupon.min_order_value ? formatToBRL(coupon.min_order_value) : "",
      usage_limit: coupon.usage_limit ? coupon.usage_limit.toString() : "",
      start_date: coupon.start_date ? format(new Date(coupon.start_date), 'yyyy-MM-dd') : "",
      end_date: coupon.end_date ? format(new Date(coupon.end_date), 'yyyy-MM-dd') : "",
      active: coupon.active
    });
    setEditingCoupon(coupon);
    setShowModal(true);
  };

  const generateCouponCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setCouponForm(prev => ({ ...prev, code }));
  };

  const isExpired = (coupon) => {
    if (!coupon.end_date) return false;
    return new Date(coupon.end_date) < new Date();
  };



  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cupons de Desconto</h1>
            <p className="text-gray-600 mt-2">Gerencie cupons promocionais para seus clientes</p>
          </div>
          <Button 
            onClick={() => {
              resetForm(); // Reset form when opening for new coupon
              setShowModal(true);
            }}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Cupom
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {coupons.map((coupon) => (
              <motion.div
                key={coupon.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg font-bold text-gray-900">
                          {coupon.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge 
                            className={`${coupon.discount_type === 'percentage' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}
                          >
                            {coupon.discount_type === 'percentage' ? (
                              <Percent className="w-3 h-3 mr-1" />
                            ) : (
                              <DollarSign className="w-3 h-3 mr-1" />
                            )}
                            {coupon.discount_type === 'percentage' 
                              ? `${coupon.discount_value}%` 
                              : `R$ ${coupon.discount_value.toFixed(2)}`}
                          </Badge>
                          
                          <Badge 
                            variant={coupon.active ? "default" : "secondary"}
                            className={coupon.active ? "bg-green-100 text-green-800" : ""}
                          >
                            {coupon.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <Tag className="w-6 h-6 text-red-500" />
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="p-3 bg-gray-100 rounded-lg">
                        <p className="font-mono font-bold text-center text-lg text-gray-900">
                          {coupon.code}
                        </p>
                      </div>
                      
                      {coupon.description && (
                        <p className="text-sm text-gray-600">
                          {coupon.description}
                        </p>
                      )}
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {coupon.min_order_value > 0 && (
                          <div>
                            <p className="text-gray-500">Pedido mínimo</p>
                            <p className="font-semibold">R$ {coupon.min_order_value.toFixed(2)}</p>
                          </div>
                        )}
                        
                        {coupon.usage_limit && (
                          <div>
                            <p className="text-gray-500">Limite por usuário</p>
                            <p className="font-semibold">{coupon.usage_limit}x</p>
                          </div>
                        )}
                        
                        {coupon.end_date && (
                          <div>
                            <p className="text-gray-500">Válido até</p>
                            <p className="font-semibold">
                              {format(new Date(coupon.end_date), 'dd/MM/yyyy', { locale: ptBR })}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {isExpired(coupon) && (
                        <div className="mt-3">
                          <Badge variant="destructive" className="w-full justify-center">
                            Expirado
                          </Badge>
                        </div>
                      )}
                      
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(coupon)}
                          className="flex-1"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(coupon.id)}
                          className="flex-1 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {coupons.length === 0 && !isLoading && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🎟️</div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">
              Nenhum cupom encontrado
            </h3>
            <p className="text-gray-600">
              Crie cupons promocionais para atrair mais clientes.
            </p>
          </div>
        )}

        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCoupon ? "Editar Cupom" : "Novo Cupom"}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome do cupom *</Label>
                  <Input
                    id="name"
                    value={couponForm.name}
                    onChange={(e) => setCouponForm({...couponForm, name: e.target.value})}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="code">Código *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="code"
                      value={couponForm.code}
                      onChange={(e) => setCouponForm({...couponForm, code: e.target.value.toUpperCase()})}
                      required
                    />
                    <Button type="button" variant="outline" onClick={generateCouponCode}>
                      Gerar
                    </Button>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={couponForm.description}
                  onChange={(e) => setCouponForm({...couponForm, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="discount_type">Tipo de desconto *</Label>
                  <Select
                    value={couponForm.discount_type}
                    onValueChange={(value) => setCouponForm({...couponForm, discount_type: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                      <SelectItem value="fixed_amount">Valor fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="discount_value">
                    {couponForm.discount_type === 'percentage' ? 'Desconto (%) *' : 'Desconto (R$) *'}
                  </Label>
                  {couponForm.discount_type === 'fixed_amount' ? (
                    <CurrencyInput
                      id="discount_value"
                      value={couponForm.discount_value}
                      onChange={(e) => setCouponForm({...couponForm, discount_value: e.target.value})}
                      placeholder="R$ 10,00"
                      required
                    />
                  ) : (
                    <Input
                      id="discount_value"
                      type="number"
                      step="1"
                      min="1"
                      max="100"
                      value={couponForm.discount_value}
                      onChange={(e) => setCouponForm({...couponForm, discount_value: e.target.value})}
                      placeholder="Ex: 15"
                      required
                    />
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="apply_to">Aplicar desconto em *</Label>
                <Select
                  value={couponForm.apply_to}
                  onValueChange={(value) => setCouponForm({...couponForm, apply_to: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="order_total">Total do pedido</SelectItem>
                    <SelectItem value="specific_products">Produtos específicos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {couponForm.apply_to === "specific_products" && (
                <div>
                  <Label>Produtos aplicáveis</Label>
                  <div className="max-h-40 overflow-y-auto border rounded-lg p-3 space-y-2">
                    {products.map((product) => (
                      <div key={product.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`product-${product.id}`}
                          checked={couponForm.applicable_products.includes(product.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setCouponForm({
                                ...couponForm,
                                applicable_products: [...couponForm.applicable_products, product.id]
                              });
                            } else {
                              setCouponForm({
                                ...couponForm,
                                applicable_products: couponForm.applicable_products.filter(id => id !== product.id)
                              });
                            }
                          }}
                        />
                        <Label htmlFor={`product-${product.id}`} className="text-sm">
                          {product.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min_order">Pedido mínimo (R$)</Label>
                  <CurrencyInput
                    id="min_order"
                    value={couponForm.min_order_value}
                    onChange={(e) => setCouponForm({...couponForm, min_order_value: e.target.value})}
                    placeholder="R$ 0,00"
                  />
                </div>

                <div>
                  <Label htmlFor="usage_limit">Limite por usuário</Label>
                  <Input
                    id="usage_limit"
                    type="number"
                    value={couponForm.usage_limit}
                    onChange={(e) => setCouponForm({...couponForm, usage_limit: e.target.value})}
                    placeholder="Ilimitado"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start_date">Data de início</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={couponForm.start_date}
                    onChange={(e) => setCouponForm({...couponForm, start_date: e.target.value})}
                  />
                </div>

                <div>
                  <Label htmlFor="end_date">Data de fim</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={couponForm.end_date}
                    onChange={(e) => setCouponForm({...couponForm, end_date: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={couponForm.active}
                  onCheckedChange={(checked) => setCouponForm({...couponForm, active: checked})}
                  className="data-[state=checked]:bg-red-500"
                />
                <Label htmlFor="active">Cupom ativo</Label>
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
                  disabled={isSubmitting}
                  className="flex-1 bg-red-500 hover:bg-red-600"
                >
                  {isSubmitting ? "Salvando..." : "Salvar Cupom"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}