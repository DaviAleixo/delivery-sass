import React, { useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, RotateCcw, X, ShoppingBag, ArrowRight, Check, Package } from "lucide-react";
import { formatBRLValue } from "@/utils/pizzaPricing";

function RecentOrderCard({
  order,
  resolvedItems,
  index,
  hasMoved,
  onReorder,
  onViewDetails,
}) {
  const [imageError, setImageError] = useState(false);

  const firstItem = resolvedItems[0] || {};
  const displayImage = firstItem.image_url || null;

  // Formatar data/hora amigável
  const orderDate = order.created_date ? new Date(order.created_date) : null;
  const formattedDate = orderDate
    ? orderDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "";

  const totalAmount = Number(order.total_amount || order.total || 0);

  return (
    <motion.div
      key={order.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03, ease: [0.25, 1, 0.5, 1] }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0 w-44 sm:w-52 group cursor-pointer"
      onClick={() => {
        if (!hasMoved) {
          onViewDetails(order, resolvedItems);
        }
      }}
    >
      <div className="relative flex flex-col h-full rounded-2xl overflow-hidden border border-stone-200/80 group-hover:border-emerald-500/40 transition-all duration-200 shadow-xs group-hover:shadow-sm p-2 sm:p-2.5 bg-white">
        {/* Imagem / Collage com Badge */}
        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-stone-50 border border-stone-100">
          {displayImage && !imageError ? (
            <img
              src={displayImage}
              alt={firstItem.product_name || "Produto"}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-stone-50 border border-stone-100">
              <Package className="w-7 h-7 text-stone-300 stroke-[1.5]" />
            </div>
          )}

          {/* Badge de Data / Pedido */}
          <div className="absolute top-2 left-2 bg-white/95 border border-stone-200 text-stone-700 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-xs flex items-center gap-1">
            <History className="w-3 h-3 text-emerald-700" />
            <span>{formattedDate || `#${(order.id || "").slice(-4)}`}</span>
          </div>

          {/* Badge de múltiplos itens */}
          {resolvedItems.length > 1 && (
            <div className="absolute top-2 right-2 bg-stone-900/90 border border-stone-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-lg shadow-xs flex items-center gap-0.5">
              <span>+{resolvedItems.length - 1} {resolvedItems.length - 1 === 1 ? "item" : "itens"}</span>
            </div>
          )}

          {/* Botão de Repetir Pedido Rápido */}
          <button
            type="button"
            title="Repetir este pedido"
            onClick={(e) => {
              e.stopPropagation();
              onReorder(order, resolvedItems);
            }}
            className="absolute bottom-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center shadow-xs transition-transform active:scale-90"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Informações dos Itens */}
        <div className="pt-2 sm:pt-2.5 px-0.5 flex flex-col flex-1 justify-between">
          <div>
            <div className="text-[11px] sm:text-xs text-stone-800 font-bold line-clamp-2 leading-tight group-hover:text-emerald-800 transition-colors">
              {resolvedItems.map((item, idx) => (
                <span key={idx}>
                  {item.quantity}x {item.product_name}
                  {idx < resolvedItems.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>

            {/* Primeiro adicional se houver */}
            {firstItem.additionals && firstItem.additionals.length > 0 && (
              <p className="text-[10px] text-stone-500 line-clamp-1 mt-0.5">
                +{firstItem.additionals.map((a) => a.name).join(", ")}
              </p>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-1.5">
            <span
              className="font-bold text-xs sm:text-sm text-stone-950 tracking-tight"
              style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
            >
              {formatBRLValue(totalAmount)}
            </span>
            <span className="text-[10px] text-stone-500 font-medium group-hover:text-emerald-700 transition-colors flex items-center gap-0.5">
              Pedir <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function VrummRecentOrdersRow({
  orders = [],
  products = [],
  onAddToCart,
  _isStoreOpen = true,
}) {
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);
  const [modalState, setModalState] = useState(null);
  const [reorderedSuccess, setReorderedSuccess] = useState(false);

  const { productsById, productsByName } = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    (products || []).forEach((p) => {
      if (p.id) byId.set(p.id, p);
      if (p.name) byName.set(p.name.trim().toLowerCase(), p);
    });
    return { productsById: byId, productsByName: byName };
  }, [products]);

  const validRecentOrders = useMemo(() => {
    if (!Array.isArray(orders) || orders.length === 0 || products.length === 0) return [];

    const validList = [];

    for (const order of orders) {
      if (!order || !order.items) continue;

      const rawItems = Array.isArray(order.items)
        ? order.items
        : typeof order.items === "string"
        ? JSON.parse(order.items || "[]")
        : [];

      if (rawItems.length === 0) continue;

      const resolvedItems = [];
      let allItemsExist = true;

      for (const item of rawItems) {
        const prodId = item.product_id || item.id;
        const prodName = (item.product_name || item.name || "").trim().toLowerCase();

        let matchedProduct = prodId ? productsById.get(prodId) : null;
        if (!matchedProduct && prodName) {
          matchedProduct = productsByName.get(prodName);
        }

        if (!matchedProduct) {
          allItemsExist = false;
          break;
        }

        resolvedItems.push({
          ...item,
          product_id: matchedProduct.id,
          product_name: matchedProduct.name,
          product_price: Number(matchedProduct.price || item.product_price || 0),
          image_url: matchedProduct.image_url || item.image_url,
          currentProduct: matchedProduct,
        });
      }

      if (allItemsExist && resolvedItems.length > 0) {
        validList.push({
          order,
          resolvedItems,
        });
      }

      if (validList.length >= 10) break;
    }

    return validList;
  }, [orders, products, productsById, productsByName]);

  if (validRecentOrders.length === 0) return null;

  const handleReorder = (order, resolvedItems) => {
    resolvedItems.forEach((item) => {
      const product = item.currentProduct;
      const additionals = (item.additionals || []).map((add) => ({
        id: add.id,
        name: add.name,
        price: Number(add.price ?? add.unit_price ?? 0),
        group_name: add.group_name || "",
      }));

      onAddToCart(
        product,
        additionals,
        Number(item.quantity) || 1,
        item.notes || ""
      );
    });

    setReorderedSuccess(true);
    setTimeout(() => {
      setReorderedSuccess(false);
      setModalState(null);
    }, 1200);
  };

  const handleMouseDown = (e) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setHasMoved(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeftState(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 6) {
      setHasMoved(true);
    }
    scrollRef.current.scrollLeft = scrollLeftState - walk;
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
            <RotateCcw className="w-3.5 h-3.5" />
          </div>
          <h2
            className="text-base sm:text-lg font-bold text-stone-900 tracking-tight flex items-center gap-2"
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            <span>Últimos Pedidos</span>
            <span className="text-stone-500 text-xs font-semibold bg-stone-100 border border-stone-200/80 px-2 py-0.5 rounded-full">
              Últimos {validRecentOrders.length}
            </span>
          </h2>
        </div>
      </div>

      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex gap-3 sm:gap-3.5 overflow-x-auto scrollbar-hide py-1 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {validRecentOrders.map(({ order, resolvedItems }, index) => (
          <RecentOrderCard
            key={order.id || index}
            order={order}
            resolvedItems={resolvedItems}
            index={index}
            hasMoved={hasMoved}
            onReorder={handleReorder}
            onViewDetails={(ord, itms) => setModalState({ order: ord, items: itms })}
          />
        ))}
      </div>

      <AnimatePresence>
        {modalState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-xl text-stone-900 relative overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setModalState(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-stone-100 text-stone-500 hover:text-stone-800 hover:bg-stone-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-900">Detalhes do Pedido</h3>
                  <p className="text-xs text-stone-500">
                    Pedido #{modalState.order.id?.slice(-6)} •{" "}
                    {modalState.order.created_date
                      ? new Date(modalState.order.created_date).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </p>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 my-4 pr-1 scrollbar-thin">
                {modalState.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80 flex flex-col gap-1"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-sm text-stone-900">
                        {item.quantity}x {item.product_name}
                      </span>
                      <span className="font-bold text-sm text-stone-900">
                        {formatBRLValue(item.subtotal || item.product_price || 0)}
                      </span>
                    </div>

                    {item.additionals && item.additionals.length > 0 && (
                      <div className="text-xs text-stone-500 pl-2 border-l-2 border-stone-200 space-y-0.5">
                        {item.additionals.map((add, addIdx) => (
                          <div key={addIdx} className="flex justify-between">
                            <span>• {add.name}</span>
                            {Number(add.price || 0) > 0 && (
                              <span>+{formatBRLValue(add.price)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {item.notes && (
                      <p className="text-[11px] text-amber-700 italic">
                        Obs: {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-stone-500 block">Total do Pedido</span>
                  <span className="text-lg font-black text-stone-950">
                    {formatBRLValue(modalState.order.total_amount || modalState.order.total || 0)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleReorder(modalState.order, modalState.items)}
                  disabled={reorderedSuccess}
                  className={`px-5 py-2.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer ${
                    reorderedSuccess
                      ? "bg-emerald-600 text-white"
                      : "bg-emerald-700 hover:bg-emerald-800 text-white active:scale-95"
                  }`}
                >
                  {reorderedSuccess ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Adicionado!</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Pedir Novamente</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
