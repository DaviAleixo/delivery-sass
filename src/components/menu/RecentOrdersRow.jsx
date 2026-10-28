import React, { useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, ShoppingBag, Check } from "lucide-react";
import { toast } from "sonner";

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
  const totalAmount = Number(order.total_amount || order.total || 0);

  return (
    <motion.div
      key={order.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03, ease: [0.25, 1, 0.5, 1] }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className="flex-shrink-0 w-36 sm:w-40 bg-white rounded-2xl p-2.5 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between cursor-pointer group select-none"
      onClick={() => {
        if (!hasMoved) {
          onViewDetails(order, resolvedItems);
        }
      }}
    >
      {/* Imagem Proporção 4:3 com cantos arredondados */}
      <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
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
          <div className="w-full h-full flex items-center justify-center text-3xl bg-gray-50">
            🍽️
          </div>
        )}
      </div>

      {/* Informações: Título, Preço e Botão + verde circular */}
      <div className="pt-2 flex flex-col flex-1 justify-between">
        <h3 className="font-bold text-xs sm:text-sm text-gray-900 group-hover:text-[#046c4e] transition-colors line-clamp-1 leading-snug tracking-tight">
          {firstItem.product_name || "Pedido"}
        </h3>
        
        <div className="mt-2 flex items-center justify-between">
          <span className="font-black text-xs sm:text-sm text-gray-950">
            R$ {totalAmount.toFixed(2).replace(".", ",")}
          </span>

          <button
            type="button"
            title="Adicionar itens ao carrinho"
            onClick={(e) => {
              e.stopPropagation();
              onReorder(order, resolvedItems);
            }}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#046c4e] hover:bg-[#03543d] text-white flex items-center justify-center shadow-xs transition-transform active:scale-90 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
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
  const [modalState, setModalState] = useState(null);
  const [reorderedSuccess, setReorderedSuccess] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);

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

    toast.success("Itens adicionados ao pedido!");
    setReorderedSuccess(true);
    setTimeout(() => {
      setReorderedSuccess(false);
      setModalState(null);
    }, 800);
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
      {/* Cabeçalho limpo, idêntico à Foto 1 */}
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-lg sm:text-xl font-black text-gray-950 tracking-tight">
          Últimos pedidos
        </h2>
        <span className="text-[#046c4e] text-xs font-bold bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
          Últimos {validRecentOrders.length}
        </span>
      </div>

      {/* Fileira de cards com arrastar fluido */}
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

      {/* Modal Detalhado do Pedido Recente */}
      <AnimatePresence>
        {modalState && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="font-black text-base text-gray-950">
                    Detalhes do Pedido Anterior
                  </h3>
                  <p className="text-xs text-gray-400">
                    #{String(modalState.order.id || "").slice(-6).toUpperCase()}
                  </p>
                </div>
                <button
                  onClick={() => setModalState(null)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Lista dos Itens */}
              <div className="divide-y divide-gray-100">
                {modalState.items.map((item, idx) => (
                  <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <p className="font-bold text-gray-900">
                        {item.quantity}x {item.product_name}
                      </p>
                      {item.additionals && item.additionals.length > 0 && (
                        <div className="text-[11px] text-gray-400 pl-2">
                          {item.additionals.map((add, addIdx) => (
                            <span key={addIdx} className="block">• {add.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-gray-950">
                      R$ {((Number(item.product_price) || 0) * (Number(item.quantity) || 1)).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                ))}
              </div>

              {/* Total e Ação */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-400 block">Total do Pedido</span>
                  <span className="text-lg font-black text-gray-950">
                    R$ {Number(modalState.order.total_amount || modalState.order.total || 0).toFixed(2).replace(".", ",")}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleReorder(modalState.order, modalState.items)}
                  disabled={reorderedSuccess}
                  className="px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 bg-[#046c4e] hover:bg-[#03543d] text-white transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  {reorderedSuccess ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Adicionado!</span>
                    </>
                  ) : (
                    <>
                      <ShoppingBag className="w-4 h-4" />
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
