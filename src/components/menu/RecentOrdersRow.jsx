import React, { useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, RotateCcw, X, ShoppingBag, ArrowRight, Check } from "lucide-react";

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
      className="flex-shrink-0 w-32 sm:w-36 group cursor-pointer"
      onClick={() => {
        if (!hasMoved) {
          onViewDetails(order, resolvedItems);
        }
      }}
    >
      <div className="relative flex flex-col h-full">
        {/* Imagem / Collage com Badge */}
        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-[#F7F9F8] border border-[#E5EAE7]">
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
            <div className="w-full h-full flex items-center justify-center text-3xl bg-[#F7F9F8]">
              🍽️
            </div>
          )}

          {/* Badge de Data / Pedido */}
          <div className="absolute top-2 left-2 bg-[#171717]/90 text-white text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-1">
            <History className="w-3 h-3 text-stone-300" />
            <span>{formattedDate || `#${(order.id || "").slice(-4)}`}</span>
          </div>

          {/* Badge de múltiplos itens */}
          {resolvedItems.length > 1 && (
            <div className="absolute top-2 right-2 bg-[#D1E9DF] border border-[#047857]/20 text-[#047857] text-[10px] font-black px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
              <span>+{resolvedItems.length - 1}</span>
            </div>
          )}

          {/* Botão de Repetir Pedido Rápido sobre a imagem */}
          <button
            type="button"
            title="Repetir este pedido"
            onClick={(e) => {
              e.stopPropagation();
              onReorder(order, resolvedItems);
            }}
            className="absolute bottom-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#047857] hover:bg-[#036348] text-white flex items-center justify-center shadow-md transition-transform active:scale-90 hover:scale-105"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Informações dos Itens - Proporções idênticas a Mais Pedidos */}
        <div className="pt-2 px-0.5 flex flex-col flex-1 justify-between">
          <div>
            <div className="font-bold text-xs sm:text-sm text-[#171717] group-hover:text-[#047857] transition-colors line-clamp-1 leading-snug tracking-tight">
              {resolvedItems.map((item, idx) => (
                <span key={idx}>
                  {item.quantity}x {item.product_name}
                  {idx < resolvedItems.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span
              className="font-black text-xs sm:text-sm text-[#171717] tracking-tight"
              style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
            >
              R$ {totalAmount.toFixed(2).replace(".", ",")}
            </span>
            <span className="text-[10px] text-[#047857] font-bold group-hover:text-[#036348] transition-colors flex items-center gap-0.5">
              Pedir <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function RecentOrdersRow({
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
    <section className="bg-white rounded-2xl sm:rounded-3xl border border-[#E5EAE7] shadow-xs p-3.5 sm:p-5 space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2
            className="text-base sm:text-lg font-black text-[#171717] tracking-tight flex items-center gap-2"
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            <span>Últimos Pedidos</span>
            <span className="text-[#047857] text-[11px] font-bold bg-[#D1E9DF]/60 border border-[#D1E9DF] px-2 py-0.5 rounded-full">
              Últimos {validRecentOrders.length}
            </span>
          </h2>
        </div>
      </div>

      {/* Fileira */}
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide py-1 -mx-1 px-1 scroll-smooth select-none ${
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

      {/* Modal Detalhado do Pedido */}
      <AnimatePresence>
        {modalState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl text-stone-900 relative overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setModalState(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-stone-100 text-stone-500 hover:text-stone-900 hover:bg-stone-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-xl bg-stone-100 border border-stone-200 text-stone-800">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-stone-900">Detalhes do Pedido</h3>
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

              {/* Lista dos Itens */}
              <div className="max-h-60 overflow-y-auto space-y-2.5 my-4 pr-1 scrollbar-thin">
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
                        R${" "}
                        {Number(item.subtotal || item.product_price || 0)
                          .toFixed(2)
                          .replace(".", ",")}
                      </span>
                    </div>

                    {item.additionals && item.additionals.length > 0 && (
                      <div className="text-xs text-stone-500 pl-2 border-l-2 border-stone-200 space-y-0.5">
                        {item.additionals.map((add, addIdx) => (
                          <div key={addIdx} className="flex justify-between">
                            <span>• {add.name}</span>
                            {Number(add.price || 0) > 0 && (
                              <span>+R$ {Number(add.price).toFixed(2).replace(".", ",")}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {item.notes && (
                      <p className="text-[11px] text-amber-600 italic">
                        Obs: {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Total e Ação */}
              <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-stone-500 block">Total do Pedido</span>
                  <span className="text-xl font-black text-stone-900">
                    R${" "}
                    {Number(modalState.order.total_amount || modalState.order.total || 0)
                      .toFixed(2)
                      .replace(".", ",")}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleReorder(modalState.order, modalState.items)}
                  disabled={reorderedSuccess}
                  className={`px-5 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-sm transition-all ${
                    reorderedSuccess
                      ? "bg-[#047857] text-white"
                      : "bg-[#047857] hover:bg-[#036348] text-white active:scale-95 shadow-md shadow-[#047857]/20"
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
