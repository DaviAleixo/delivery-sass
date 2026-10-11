import React, { useState, useEffect } from "react";
import { Product } from "@/entities/Product";
import { Category } from "@/entities/Category";
import { Order } from "@/entities/Order";
import PDVProductGrid from "../components/pdv/PDVProductGrid";
import PDVCart from "../components/pdv/PDVCart";
import PDVPaymentModal from "../components/pdv/PDVPaymentModal";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateSchema, orderSchema } from "@/schemas";
import { toast } from "sonner";

// Som ao adicionar item
const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {}
};

export default function PDVPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  useEffect(() => {
    loadData();
    const unsubProduct = Product.subscribe(() => loadData());
    const unsubCategory = Category.subscribe(() => loadData());
    return () => {
      if (typeof unsubProduct === "function") unsubProduct();
      if (typeof unsubCategory === "function") unsubCategory();
    };
  }, []);

  const loadData = async () => {
    try {
      const [prods, cats] = await Promise.all([
        Product.list("-created_date"),
        Category.list("order_index"),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
    } catch (_error) {
      console.error("Erro ao carregar dados no PDV:", _error);
    } finally {
      setIsLoading(false);
    }
  };

  const addToCart = (product) => {
    playBeep();
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === productId ? { ...item, qty: item.qty + delta } : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const removeItem = (productId) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
  };

  const total = cart.reduce((sum, item) => sum + (Number(item.price) || 0) * item.qty, 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const handleFinalize = async (paymentMethod) => {
    const orderData = {
      customer_name: customerName.trim() || "Balcão",
      customer_phone: customerPhone.trim() || "-",
      customer_email: customerEmail.trim() || "",
      total_amount: total,
      status: "confirmado",
      payment_method: paymentMethod,
      order_type: "pickup",
      table_number: "Balcão",
      items: cart.map((item) => ({
        product_id: item.id,
        product_name: item.name,
        product_price: Number(item.price) || 0,
        quantity: item.qty,
        subtotal: (Number(item.price) || 0) * item.qty,
        additionals: [],
      })),
    };

    const zodValidation = validateSchema(orderSchema, {
      ...orderData,
      customer_phone: orderData.customer_phone === "-" ? "00000000" : orderData.customer_phone,
      order_type: "balcao",
      items: orderData.items.map(it => ({
        ...it,
        name: it.product_name,
        price: it.product_price,
      }))
    });

    if (!zodValidation.success) {
      console.warn("Aviso de validação Zod (PDV):", zodValidation.errorList);
    }

    const created = await Order.create(orderData);
    toast.success("Pedido finalizado com sucesso!");
    setLastOrder(created);
    clearCart();
    setShowPayment(false);
    setIsMobileCartOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Carregando PDV...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col lg:flex-row h-full min-h-0 min-w-0 bg-gray-100 overflow-hidden w-full">
      {/* Grade de Produtos */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 min-w-0">
        <PDVProductGrid
          products={products}
          categories={categories}
          onAddToCart={addToCart}
          cartCount={totalItemsCount}
          onOpenMobileCart={() => setIsMobileCartOpen(true)}
        />
      </div>

      {/* Barra Flutuante de Resumo em Telas Pequenas */}
      {cart.length > 0 && !isMobileCartOpen && (
        <div className="lg:hidden absolute bottom-3 left-3 right-3 z-20 bg-gray-900 text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between border border-gray-800 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center font-black text-sm text-white">
              {totalItemsCount}
            </div>
            <div>
              <p className="text-xs text-gray-400">Total do Pedido</p>
              <p className="text-lg font-black text-white leading-tight">
                R$ {total.toFixed(2).replace(".", ",")}
              </p>
            </div>
          </div>
          <Button
            onClick={() => setIsMobileCartOpen(true)}
            className="bg-red-600 hover:bg-red-700 text-white font-bold h-10 px-4 rounded-xl gap-1.5 shadow-md cursor-pointer"
          >
            <span>Ver Carrinho</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Drawer / Overlay para Telas Pequenas */}
      {isMobileCartOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs flex justify-end"
          onClick={() => setIsMobileCartOpen(false)}
        >
          <div 
            className="w-full max-w-md h-full bg-white shadow-2xl animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <PDVCart
              cart={cart}
              customerName={customerName}
              onCustomerNameChange={setCustomerName}
              customerPhone={customerPhone}
              onCustomerPhoneChange={setCustomerPhone}
              customerEmail={customerEmail}
              onCustomerEmailChange={setCustomerEmail}
              onUpdateQty={updateQty}
              onRemoveItem={removeItem}
              onClearCart={clearCart}
              onFinalize={() => setShowPayment(true)}
              total={total}
              lastOrder={lastOrder}
              onDismissSuccess={() => setLastOrder(null)}
              onCloseMobile={() => setIsMobileCartOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Carrinho Lateral Fixo para Desktop (lg+) */}
      <div className="hidden lg:flex shrink-0 h-full min-h-0">
        <PDVCart
          cart={cart}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          customerPhone={customerPhone}
          onCustomerPhoneChange={setCustomerPhone}
          customerEmail={customerEmail}
          onCustomerEmailChange={setCustomerEmail}
          onUpdateQty={updateQty}
          onRemoveItem={removeItem}
          onClearCart={clearCart}
          onFinalize={() => setShowPayment(true)}
          total={total}
          lastOrder={lastOrder}
          onDismissSuccess={() => setLastOrder(null)}
        />
      </div>

      {/* Modal de Pagamento */}
      {showPayment && (
        <PDVPaymentModal
          total={total}
          onConfirm={handleFinalize}
          onClose={() => setShowPayment(false)}
        />
      )}
    </div>
  );
}