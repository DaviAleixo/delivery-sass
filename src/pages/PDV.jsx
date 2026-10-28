import React, { useState, useEffect } from "react";
import { Product } from "@/entities/Product";
import { Category } from "@/entities/Category";
import { Order } from "@/entities/Order";
import { RestaurantTable, TableSession } from "@/entities/RestaurantTable";
import { getActiveTenantId } from "@/entities/storage";
import PDVProductGrid from "../components/pdv/PDVProductGrid";
import PDVCart from "../components/pdv/PDVCart";
import PDVPaymentModal from "../components/pdv/PDVPaymentModal";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateSchema, orderSchema } from "@/schemas";
import { toast } from "sonner";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

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
  const [tables, setTables] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [orderType, setOrderType] = useState("pickup");
  const [selectedTableNumber, setSelectedTableNumber] = useState("");
  const [isSubmittingTableOrder, setIsSubmittingTableOrder] = useState(false);
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  useEffect(() => {
    const preTable = localStorage.getItem("pdv_preselected_table");
    if (preTable) {
      setSelectedTableNumber(preTable);
      setOrderType("dine_in");
      localStorage.removeItem("pdv_preselected_table");
    }

    loadData();
    const unsubProduct = Product.subscribe(() => loadData());
    const unsubCategory = Category.subscribe(() => loadData());
    const unsubTable = RestaurantTable.subscribe(() => loadData());
    const unsubSession = TableSession.subscribe(() => loadData());

    return () => {
      if (typeof unsubProduct === "function") unsubProduct();
      if (typeof unsubCategory === "function") unsubCategory();
      if (typeof unsubTable === "function") unsubTable();
      if (typeof unsubSession === "function") unsubSession();
    };
  }, []);

  const loadData = async () => {
    try {
      const [prods, cats, tbls, sess] = await Promise.all([
        Product.list("-created_date"),
        Category.list("order_index"),
        RestaurantTable.list().catch(() => []),
        TableSession.list("-opened_at", 100).catch(() => []),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
      
      let finalTables = tbls || [];
      if (finalTables.length === 0) {
        const activeTenantId = getActiveTenantId();
        if (activeTenantId && isSupabaseConfigured() && supabase) {
          try {
            await supabase.rpc("generate_default_tables", {
              p_tenant_id: activeTenantId,
              p_count: 10,
            });
            finalTables = await RestaurantTable.list().catch(() => []);
          } catch {}
        }
      }
      setTables(finalTables);
      setSessions(sess || []);
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

  const handleOpenPayment = () => {
    if (cart.length === 0) {
      toast.error("O carrinho está vazio.");
      return;
    }

    const trimmedName = customerName.trim();
    const rawPhone = customerPhone.replace(/\D/g, "");

    if (!trimmedName || rawPhone.length < 10) {
      if (!trimmedName && rawPhone.length < 10) {
        toast.error("Informe o nome e o telefone do cliente (ou selecione um cliente salvo) para continuar.");
      } else if (!trimmedName) {
        toast.error("Informe o nome do cliente para continuar.");
      } else {
        toast.error("Informe um telefone válido com DDD (mínimo 10 dígitos) para continuar.");
      }
      return;
    }

    setShowPayment(true);
  };

  const handleLaunchToTable = async () => {
    if (cart.length === 0) {
      toast.error("O carrinho está vazio.");
      return;
    }
    if (!selectedTableNumber) {
      toast.error("Selecione a mesa do salão.");
      return;
    }

    try {
      setIsSubmittingTableOrder(true);
      const activeTenantId = getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";
      const cleanTargetNum = String(selectedTableNumber).replace(/^Mesa\s*/i, "").trim();

      // Localiza a mesa física
      let table = tables.find(t => String(t.table_number).replace(/^Mesa\s*/i, "").trim() === cleanTargetNum);

      // Se a mesa física não foi encontrada ou não possui ID UUID válido, busca ou cria no Supabase
      if (!table?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(table.id)) {
        if (isSupabaseConfigured() && supabase) {
          const { data: dbTable } = await supabase
            .from("restaurant_tables")
            .select("id, table_number, status, tenant_id")
            .eq("tenant_id", activeTenantId)
            .eq("table_number", cleanTargetNum)
            .maybeSingle();

          if (dbTable) {
            table = dbTable;
          } else {
            const { data: createdTbl } = await supabase
              .from("restaurant_tables")
              .insert([{
                tenant_id: activeTenantId,
                table_number: cleanTargetNum,
                label: "Salão Principal",
                capacity: 4,
                status: "occupied"
              }])
              .select()
              .single();
            if (createdTbl) table = createdTbl;
          }
        }
      }

      // Garante status occupied na mesa física
      if (table?.id) {
        if (isSupabaseConfigured() && supabase) {
          await supabase
            .from("restaurant_tables")
            .update({ status: "occupied", updated_at: new Date().toISOString() })
            .eq("id", table.id);
        } else {
          await RestaurantTable.update(table.id, { status: "occupied" }).catch(() => {});
        }
      }

      // Busca sessão ativa ou abre uma nova sessão real com UUID no Supabase
      let activeSessionId = null;
      let activeSessionCustomer = customerName.trim() || `Mesa ${cleanTargetNum}`;
      let activeSessionPhone = customerPhone.trim() || "";

      if (isSupabaseConfigured() && supabase) {
        const { data: existingSess } = await supabase
          .from("table_sessions")
          .select("id, status, customer_name, customer_phone")
          .eq("tenant_id", activeTenantId)
          .eq("table_number", cleanTargetNum)
          .in("status", ["open", "bill_requested"])
          .order("opened_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSess?.id) {
          activeSessionId = existingSess.id;
          if (existingSess.customer_name && !customerName.trim()) {
            activeSessionCustomer = existingSess.customer_name;
          }
          if (existingSess.customer_phone && !customerPhone.trim()) {
            activeSessionPhone = existingSess.customer_phone;
          }
        } else if (table?.id) {
          const { data: newSess } = await supabase
            .from("table_sessions")
            .insert([{
              tenant_id: activeTenantId,
              table_id: table.id,
              table_number: cleanTargetNum,
              customer_name: activeSessionCustomer,
              customer_phone: activeSessionPhone || null,
              people_count: 2,
              status: "open",
              opened_at: new Date().toISOString()
            }])
            .select("id")
            .single();

          if (newSess?.id) {
            activeSessionId = newSess.id;
          }
        }
      }

      const orderData = {
        tenant_id: activeTenantId,
        customer_name: activeSessionCustomer,
        customer_phone: activeSessionPhone || "-",
        customer_email: customerEmail.trim() || "",
        total_amount: total,
        total: total,
        subtotal: total,
        status: "confirmado",
        payment_method: "comanda_mesa",
        order_type: "dine_in",
        table_number: cleanTargetNum,
        table_session_id: activeSessionId,
        items: cart.map((item) => {
          const cat = categories.find((c) => c.id === item.category_id || c.id === item.category);
          const catName = cat?.name || (typeof item.category === "string" && item.category ? item.category : "Geral");
          return {
            product_id: item.id,
            product_name: item.name,
            name: item.name,
            product_price: Number(item.price) || 0,
            price: Number(item.price) || 0,
            category_name: item.category_name || catName,
            quantity: item.qty,
            subtotal: (Number(item.price) || 0) * item.qty,
            additionals: [],
          };
        }),
      };

      const created = await Order.create(orderData);
      toast.success(`Pedido de R$ ${total.toFixed(2).replace(".", ",")} lançado na Mesa ${cleanTargetNum}! 🍻`);
      setLastOrder(created);
      clearCart();
      setIsMobileCartOpen(false);
      await loadData();

      // Dispara eventos locais e cross-tab para atualização em tempo real
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("db_event_orders", { detail: { type: "create", data: created } }));
        window.dispatchEvent(new CustomEvent("db_event_restaurant_tables", { detail: { type: "update" } }));
        window.dispatchEvent(new CustomEvent("db_event_table_sessions", { detail: { type: "update" } }));
      }
    } catch (err) {
      console.error("Erro ao lançar pedido na mesa:", err);
      toast.error("Erro ao lançar pedido na mesa. Tente novamente.");
    } finally {
      setIsSubmittingTableOrder(false);
    }
  };

  const handleFinalize = async (paymentMethod) => {
    const isDineIn = orderType === "dine_in";
    const trimmedName = customerName.trim() || (isDineIn ? `Mesa ${selectedTableNumber}` : "");
    const rawPhone = customerPhone.replace(/\D/g, "");

    if (!isDineIn && (!trimmedName || rawPhone.length < 10)) {
      toast.error("Nome e telefone do cliente são obrigatórios no PDV.");
      return;
    }

    if (isDineIn && !selectedTableNumber) {
      toast.error("Selecione uma mesa do salão.");
      return;
    }

    const cleanTargetNum = isDineIn ? String(selectedTableNumber).replace(/^Mesa\s*/i, "").trim() : "Balcão";
    const activeTenantId = getActiveTenantId() || "a0000000-0000-0000-0000-000000000001";
    let activeSessionId = null;

    if (isDineIn) {
      let table = tables.find(t => String(t.table_number).replace(/^Mesa\s*/i, "").trim() === cleanTargetNum);
      if (table?.id) {
        await RestaurantTable.update(table.id, { status: "occupied" }).catch(() => {});
      }

      let activeSession = sessions.find(s => 
        String(s.table_number).replace(/^Mesa\s*/i, "").trim() === cleanTargetNum &&
        (s.status === 'open' || s.status === 'bill_requested')
      );
      if (!activeSession && table?.id) {
        try {
          activeSession = await TableSession.create({
            tenant_id: activeTenantId,
            table_id: table.id,
            table_number: cleanTargetNum,
            customer_name: trimmedName,
            customer_phone: customerPhone.trim(),
            people_count: 2,
            opened_at: new Date().toISOString(),
            status: "open",
          });
        } catch {}
      }
      if (activeSession && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeSession.id)) {
        activeSessionId = activeSession.id;
      }
    }

    const orderData = {
      tenant_id: activeTenantId,
      customer_name: trimmedName,
      customer_phone: customerPhone.trim(),
      customer_email: customerEmail.trim() || "",
      total_amount: total,
      total: total,
      subtotal: total,
      status: "confirmado",
      payment_method: paymentMethod,
      order_type: isDineIn ? "dine_in" : "pickup",
      table_number: cleanTargetNum,
      table_session_id: activeSessionId,
      payment_status: "paid",
      items: cart.map((item) => {
        const cat = categories.find((c) => c.id === item.category_id || c.id === item.category);
        const catName = cat?.name || (typeof item.category === "string" && item.category ? item.category : "Geral");
        return {
          product_id: item.id,
          product_name: item.name,
          name: item.name,
          product_price: Number(item.price) || 0,
          price: Number(item.price) || 0,
          category_name: item.category_name || catName,
          quantity: item.qty,
          subtotal: (Number(item.price) || 0) * item.qty,
          additionals: [],
        };
      }),
    };

    const zodValidation = validateSchema(orderSchema, {
      ...orderData,
      customer_phone: orderData.customer_phone,
      order_type: isDineIn ? "mesa" : "balcao",
      items: orderData.items.map(it => ({
        ...it,
        name: it.product_name,
        price: it.product_price,
        category_name: it.category_name,
      }))
    });

    if (!zodValidation.success) {
      console.warn("Aviso de validação Zod (PDV):", zodValidation.errorList);
    }

    try {
      const created = await Order.create(orderData);
      toast.success("Pedido finalizado com sucesso!");
      setLastOrder(created);
      clearCart();
      setShowPayment(false);
      setIsMobileCartOpen(false);
      await loadData();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("db_event_orders", { detail: { type: "create", data: created } }));
        window.dispatchEvent(new CustomEvent("db_event_restaurant_tables", { detail: { type: "update" } }));
        window.dispatchEvent(new CustomEvent("db_event_table_sessions", { detail: { type: "update" } }));
      }
    } catch (err) {
      console.error("Erro ao finalizar pedido no PDV:", err);
      toast.error("Erro ao salvar pedido no PDV. Tente novamente.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F7F9F8]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#047857] mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Carregando PDV...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col lg:flex-row h-full min-h-0 min-w-0 bg-[#F7F9F8] overflow-hidden w-full">
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
            <div className="w-10 h-10 rounded-xl bg-[#047857] flex items-center justify-center font-black text-sm text-white">
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
            className="bg-[#047857] hover:bg-[#065f46] text-white font-bold h-10 px-4 rounded-xl gap-1.5 shadow-md cursor-pointer"
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
              onFinalize={handleOpenPayment}
              total={total}
              lastOrder={lastOrder}
              onDismissSuccess={() => setLastOrder(null)}
              onCloseMobile={() => setIsMobileCartOpen(false)}
              orderType={orderType}
              onOrderTypeChange={setOrderType}
              tables={tables}
              selectedTableNumber={selectedTableNumber}
              onSelectTableNumber={setSelectedTableNumber}
              onLaunchToTable={handleLaunchToTable}
              isSubmittingTableOrder={isSubmittingTableOrder}
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
          onFinalize={handleOpenPayment}
          total={total}
          lastOrder={lastOrder}
          onDismissSuccess={() => setLastOrder(null)}
          orderType={orderType}
          onOrderTypeChange={setOrderType}
          tables={tables}
          selectedTableNumber={selectedTableNumber}
          onSelectTableNumber={setSelectedTableNumber}
          onLaunchToTable={handleLaunchToTable}
          isSubmittingTableOrder={isSubmittingTableOrder}
        />
      </div>

      {/* Modal de Pagamento */}
      {showPayment && (
        <PDVPaymentModal
          total={total}
          customerName={customerName}
          customerPhone={customerPhone}
          onConfirm={handleFinalize}
          onClose={() => setShowPayment(false)}
        />
      )}
    </div>
  );
}