import React, { useMemo } from "react";
import { Plus, Minus, Trash2, ShoppingBag, X, ArrowRight, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

// Heurísticas de identificação por categoria ou nome do item
function isBeverage(categoryName = "", productName = "") {
  const text = `${categoryName} ${productName}`.toLowerCase();
  return /bebida|refrigerante|suco|água|agua|coca|guaran[aá]|fanta|sprite|cerveja|chopp|chope|drink|lata|long neck|h2oh|energ[eé]tico/i.test(text);
}

function isDessert(categoryName = "", productName = "") {
  const text = `${categoryName} ${productName}`.toLowerCase();
  return /sobremesa|doce|sorvete|pudim|brownie|a[cç]a[ií]|milk shake|milkshake|torta|bolo|petit g[aâ]teau/i.test(text);
}

function isSide(categoryName = "", productName = "") {
  const text = `${categoryName} ${productName}`.toLowerCase();
  return /acompanhamento|por[cç][aã]o|entrada|batata|fritas|onion|nuggets|an[eé]is de cebola|molho|maionese|farofa|anéis/i.test(text);
}

export default function Cart({
  cart = [],
  updateQuantity,
  onCheckout,
  deliveryFee = 0,
  isVisible,
  onToggle,
  products = [],
  categories = [],
  onAddToCart,
  onSelectProduct,
  complementGroups = [],
  productComplementGroups = []
}) {
  const getSubtotal = () =>
    cart.reduce((total, item) => {
      const additionalsTotal = (item.additionals || []).reduce((sum, ad) => sum + (ad.price || 0), 0);
      return total + (item.price + additionalsTotal) * item.quantity;
    }, 0);

  const subtotal = getSubtotal();
  const total = subtotal + Number(deliveryFee || 0);
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);

  const categoryMap = useMemo(() => {
    const map = new Map();
    (categories || []).forEach(c => map.set(c.id, c.name || ""));
    return map;
  }, [categories]);

  const hasBeverageInCart = useMemo(() => {
    return cart.some(item => {
      const catName = categoryMap.get(item.category) || "";
      return isBeverage(catName, item.name);
    });
  }, [cart, categoryMap]);

  const hasDessertInCart = useMemo(() => {
    return cart.some(item => {
      const catName = categoryMap.get(item.category) || "";
      return isDessert(catName, item.name);
    });
  }, [cart, categoryMap]);

  const upsellProducts = useMemo(() => {
    if (!products || products.length === 0) return [];

    const candidates = products.filter(p => {
      if (p.available === false) return false;
      return !cart.some(item => item.id === p.id);
    });

    const scored = candidates.map(p => {
      const catName = categoryMap.get(p.category) || "";
      let score = 0;
      let tag = "Recomendado";
      let icon = "✨";

      const bev = isBeverage(catName, p.name);
      const des = isDessert(catName, p.name);
      const side = isSide(catName, p.name);

      if (!hasBeverageInCart && bev) {
        score += 100;
        tag = "Bebida Gelada";
        icon = "🥤";
      } else if (!hasDessertInCart && des) {
        score += 85;
        tag = "Sobremesa";
        icon = "🍰";
      } else if (side) {
        score += 70;
        tag = "Acompanhamento";
        icon = "🍟";
      } else if (bev) {
        score += 50;
        tag = "Bebida";
        icon = "🥤";
      } else if (des) {
        score += 45;
        tag = "Sobremesa";
        icon = "🍰";
      } else {
        const price = Number(p.price) || 999;
        if (price <= 15) score += 30;
        else if (price <= 25) score += 20;
        else score += 10;
      }

      if (p.popular) score += 15;

      return {
        ...p,
        upsellScore: score,
        upsellTag: tag,
        upsellIcon: icon,
      };
    });

    return scored
      .filter(item => item.upsellScore > 0)
      .sort((a, b) => b.upsellScore - a.upsellScore)
      .slice(0, 8);
  }, [products, cart, categoryMap, hasBeverageInCart, hasDessertInCart]);

  const handleAddUpsell = (product) => {
    const linkedGroups = (productComplementGroups || []).filter(pcg => pcg.product_id === product.id);
    const hasRequiredComplements = (complementGroups || []).some(g =>
      linkedGroups.some(lg => lg.group_id === g.id) && (Number(g.min_quantity) > 0 || g.is_required)
    );

    if (hasRequiredComplements && onSelectProduct) {
      onSelectProduct(product);
      return;
    }

    if (onAddToCart) {
      onAddToCart(product, [], 1, "");
      toast.success(`✓ ${product.name} adicionado ao pedido!`, {
        description: `R$ ${Number(product.price || 0).toFixed(2).replace('.', ',')}`,
        duration: 3000,
      });
    }
  };

  // Botão flutuante inferior no menu
  if (!isVisible && cart.length > 0) {
    return (
      <motion.div
        initial={{ y: 80, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", damping: 24, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2 pointer-events-none"
      >
        <div className="max-w-md mx-auto pointer-events-auto">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={onToggle}
            className="w-full bg-[#047857] hover:bg-[#036348] text-white flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 rounded-2xl shadow-xl shadow-[#047857]/20 transition-all duration-200 cursor-pointer border border-[#036348]"
          >
            <div className="flex items-center gap-3">
              <div className="relative bg-white/10 w-10 h-10 rounded-xl flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-white" />
                <motion.span 
                  key={itemCount}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1.5 -right-1.5 bg-[#D1E9DF] text-[#047857] text-xs font-black rounded-full w-5 h-5 flex items-center justify-center shadow-xs leading-none"
                >
                  {itemCount}
                </motion.span>
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-emerald-100 leading-none">Ver Pedido</p>
                <p className="text-sm sm:text-base font-black tracking-tight leading-tight mt-0.5">
                  R$ {total.toFixed(2).replace('.', ',')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-white/10 px-3.5 py-2 rounded-xl text-xs font-bold">
              <span>Avançar</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </div>
          </motion.button>
        </div>
      </motion.div>
    );
  }

  if (!isVisible) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onToggle}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity"
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-hidden max-w-lg mx-auto bg-white text-[#171717] border-t border-[#E5EAE7] shadow-2xl flex flex-col"
        style={{ maxHeight: '88vh' }}
      >
        <div className="flex justify-center pt-3 pb-1 cursor-grab">
          <div className="w-10 h-1 rounded-full bg-stone-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-[#E5EAE7]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#D1E9DF]/40 border border-[#D1E9DF] flex items-center justify-center text-[#047857]">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h3 
                className="font-black text-base text-[#171717] tracking-tight leading-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Seu Carrinho
              </h3>
              <span className="text-[11px] text-stone-500 font-medium">
                {itemCount} {itemCount === 1 ? 'item no pedido' : 'itens no pedido'}
              </span>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 border border-stone-200 flex items-center justify-center text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
            aria-label="Fechar carrinho"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-2.5 flex-1 scrollbar-hide">
          {cart.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="text-5xl">🛒</div>
              <p className="font-bold text-base text-[#171717]">Seu carrinho está vazio</p>
              <p className="text-xs text-stone-500">Adicione produtos saborosos do cardápio para continuar</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {cart.map((item, index) => {
                const itemTotal = (item.price + (item.additionals || []).reduce((s, a) => s + (a.price || 0), 0)) * item.quantity;

                return (
                  <motion.div
                    key={item.cartItemId || `cart-item-${item.id || index}-${index}`}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-3 rounded-2xl p-3 bg-white border border-[#E5EAE7] shadow-xs"
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#F7F9F8] border border-[#E5EAE7]">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pr-1">
                      <p className="font-extrabold text-xs sm:text-sm text-[#171717] truncate">{item.name}</p>
                      {item.additionals && item.additionals.length > 0 && (
                        <p className="text-[11px] text-stone-500 truncate mt-0.5 font-normal">
                          {item.additionals.map(ad => ad.name).join(', ')}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-[10px] text-amber-600 truncate italic mt-0.5">
                          Obs: {item.notes}
                        </p>
                      )}
                      <p className="font-black text-xs sm:text-sm text-[#171717] mt-1">
                        R$ {itemTotal.toFixed(2).replace('.', ',')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 bg-[#F7F9F8] border border-[#E5EAE7] rounded-xl p-1 flex-shrink-0 shadow-xs">
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        type="button"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-500 hover:text-red-600 hover:bg-white transition-colors cursor-pointer"
                        onClick={() => updateQuantity(index, item.quantity - 1)}
                      >
                        {item.quantity === 1 ? (
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" />
                        )}
                      </motion.button>
                      <span className="min-w-[1.2rem] text-center font-black text-xs text-[#171717]">
                        {item.quantity}
                      </span>
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        type="button"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-white bg-[#047857] hover:bg-[#036348] transition-colors cursor-pointer"
                        onClick={() => updateQuantity(index, item.quantity + 1)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}

          {cart.length > 0 && upsellProducts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-4 pt-3.5 border-t border-[#E5EAE7] space-y-2.5"
            >
              <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-[#D1E9DF]/40 border border-[#D1E9DF] flex items-center justify-center text-[#047857]">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                  </div>
                  <h4 
                    className="font-black text-xs uppercase tracking-wider text-[#171717]"
                    style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                  >
                    Complete seu Pedido
                  </h4>
                </div>
                <span className="text-[10px] text-[#047857] font-extrabold bg-[#D1E9DF]/50 px-2 py-0.5 rounded-full border border-[#D1E9DF]">
                  {hasBeverageInCart ? "Peça também" : "Bebidas & Acompanhamentos"}
                </span>
              </div>

              <div className="flex gap-2.5 overflow-x-auto pb-2 pt-0.5 scrollbar-hide -mx-1 px-1 snap-x snap-mandatory">
                {upsellProducts.map((p) => {
                  const price = Number(p.price || 0);

                  return (
                    <div
                      key={`upsell-${p.id}`}
                      className="w-[134px] sm:w-[144px] flex-shrink-0 snap-start bg-white hover:bg-[#D1E9DF]/20 border border-[#E5EAE7] rounded-2xl p-2.5 flex flex-col justify-between transition-all duration-200 group shadow-xs"
                    >
                      <div>
                        <div className="w-full h-20 rounded-xl overflow-hidden bg-[#F7F9F8] border border-[#E5EAE7] relative mb-2 flex items-center justify-center">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-3xl select-none">{p.upsellIcon || "✨"}</span>
                          )}

                          <span className="absolute top-1 right-1 bg-[#047857] text-[9px] font-black text-white px-1.5 py-0.5 rounded-md shadow-xs">
                            {p.upsellTag}
                          </span>
                        </div>

                        <p className="font-extrabold text-xs text-[#171717] line-clamp-2 leading-tight group-hover:text-[#047857] transition-colors">
                          {p.name}
                        </p>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-[#E5EAE7] flex items-center justify-between gap-1.5">
                        <span className="font-black text-xs text-[#171717] whitespace-nowrap">
                          R$ {price.toFixed(2).replace('.', ',')}
                        </span>

                        <motion.button
                          whileTap={{ scale: 0.90 }}
                          type="button"
                          onClick={() => handleAddUpsell(p)}
                          className="bg-[#047857] hover:bg-[#036348] text-white font-black text-[11px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-xs cursor-pointer transition-all active:scale-95"
                          title="Adicionar ao pedido"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Pedir</span>
                        </motion.button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-[#E5EAE7] bg-white space-y-3">
            {!hasBeverageInCart && upsellProducts.some(p => p.upsellTag.includes('Bebida')) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2 text-[11px] text-amber-900"
              >
                <span className="text-base select-none">🥤</span>
                <span className="font-semibold leading-tight">
                  Que tal uma <b>bebida gelada</b> para acompanhar seu pedido? Escolha acima!
                </span>
              </motion.div>
            )}

            <div className="space-y-1.5 text-xs text-stone-600">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-[#171717] font-semibold">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
              </div>
              {Number(deliveryFee) > 0 && (
                <div className="flex justify-between">
                  <span>Taxa de entrega (estimada)</span>
                  <span className="text-[#171717] font-semibold">R$ {Number(deliveryFee).toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-base text-[#171717] pt-2 border-t border-[#E5EAE7]">
                <span>Total</span>
                <span>R$ {total.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold transition-all bg-[#D1E9DF]/50 hover:bg-[#D1E9DF] text-[#047857] border border-[#D1E9DF] cursor-pointer"
              >
                <span>Adicionar Mais Itens</span>
              </button>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={onCheckout}
                className="w-full text-white flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-xs sm:text-sm font-black tracking-tight transition-all cursor-pointer bg-[#047857] hover:bg-[#036348] shadow-lg shadow-[#047857]/25"
              >
                <span>Finalizar Pedido</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
}