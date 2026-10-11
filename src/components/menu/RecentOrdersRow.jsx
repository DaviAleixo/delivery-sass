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

  // Formatar data/hora amigável
  const orderDate = order.created_date ? new Date(order.created_date) : null;
  const formattedDate = orderDate
    ? orderDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : "";

  const totalAmount = Number(order.total_amount || order.total || 0);

  return (
    <motion.div
      key={order.id}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.25, 1, 0.5, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0 w-44 sm:w-52 group cursor-pointer"
      onClick={() => {
        if (!hasMoved) {
          onViewDetails(order, resolvedItems);
        }
      }}
    >
      <div className="relative flex flex-col h-full rounded-2xl sm:rounded-3xl overflow-hidden border border-stone-800/90 group-hover:border-red-500/60 transition-all duration-300 shadow-md group-hover:shadow-2xl group-hover:shadow-red-950/40 p-2 sm:p-2.5 bg-gradient-to-b from-[#191311] via-[#140f0e] to-[#110d0c]">
        {/* Glow sutil */}
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/0 via-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Imagem / Collage com Badge */}
        <div className="relative w-full aspect-square rounded-xl sm:rounded-2xl overflow-hidden bg-stone-900/90 border border-stone-800/60 shadow-inner">
          {displayImage && !imageError ? (
            <img
              src={displayImage}
              alt={firstItem.product_name || "Produto"}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl bg-stone-900">
              🍽️
            </div>
          )}

          {/* Badge de Data / Pedido */}
          <div className="absolute top-2 left-2 backdrop-blur-md bg-stone-950/85 border border-stone-800/80 text-stone-300 text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-lg flex items-center gap-1">
            <History className="w-3 h-3 text-red-400" />
            <span>{formattedDate || `#${(order.id || "").slice(-4)}`}</span>
          </div>

          {/* Badge de múltiplos itens */}
          {resolvedItems.length > 1 && (
            <div className="absolute top-2 right-2 backdrop-blur-md bg-red-950/90 border border-red-500/40 text-red-300 text-[10px] font-black px-1.5 py-0.5 rounded-lg shadow-lg flex items-center gap-0.5">
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
            className="absolute bottom-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-red-600 to-red-500 group-hover:from-red-500 group-hover:to-amber-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-90 hover:scale-105"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Informações dos Itens (Exibe o nome atualizado do produto cadastrado) */}
        <div className="pt-2 sm:pt-2.5 px-1 flex flex-col flex-1 justify-between relative z-10">
          <div>
            <div className="text-[11px] sm:text-xs text-stone-300 font-bold line-clamp-2 leading-tight group-hover:text-red-300 transition-colors">
              {resolvedItems.map((item, idx) => (
                <span key={idx}>
                  {item.quantity}x {item.product_name}
                  {idx < resolvedItems.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>

            {/* Primeiro adicional/complemento do primeiro item se houver */}
            {firstItem.additionals && firstItem.additionals.length > 0 && (
              <p className="text-[10px] text-stone-500 line-clamp-1 mt-0.5">
                +{firstItem.additionals.map((a) => a.name).join(", ")}
              </p>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-stone-800/60 pt-1.5">
            <span
              className="font-black text-xs sm:text-sm text-red-500 tracking-tight"
              style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
            >
              R$ {totalAmount.toFixed(2).replace(".", ",")}
            </span>
            <span className="text-[10px] text-stone-400 font-medium group-hover:text-stone-200 transition-colors flex items-center gap-0.5">
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
  const [modalState, setModalState] = useState(null); // { order, items }
  const [reorderedSuccess, setReorderedSuccess] = useState(false);

  // Mapear produtos para rápido acesso por ID e por Nome
  const { productsById, productsByName } = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    (products || []).forEach((p) => {
      if (p.id) byId.set(p.id, p);
      if (p.name) byName.set(p.name.trim().toLowerCase(), p);
    });
    return { productsById: byId, productsByName: byName };
  }, [products]);

  // Filtrar pedidos: APENAS pedidos cujos produtos ainda existem e estão cadastrados
  // Se o nome foi editado, exibe com o nome editado; se foi excluído, oculta o pedido.
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

        // 1. Tenta achar por ID
        let matchedProduct = prodId ? productsById.get(prodId) : null;

        // 2. Se não achou por ID, tenta achar pelo nome
        if (!matchedProduct && prodName) {
          matchedProduct = productsByName.get(prodName);
        }

        // Se o produto foi excluído / não existe no cadastro atual, descarta este pedido
        if (!matchedProduct) {
          allItemsExist = false;
          break;
        }

        resolvedItems.push({
          ...item,
          product_id: matchedProduct.id,
          product_name: matchedProduct.name, // Nome atualizado do cadastro
          product_price: Number(matchedProduct.price || item.product_price || 0),
          image_url: matchedProduct.image_url || item.image_url,
          currentProduct: matchedProduct,
        });
      }

      // Só inclui se TODOS os itens do pedido ainda existem no cadastro
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

  // Função para reordenar (adicionar todos os itens válidos ao carrinho)
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

  // Mouse Drag handlers
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
    <section className="space-y-3.5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-600/20 to-red-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <RotateCcw className="w-4 h-4" />
          </div>
          <h2
            className="text-lg sm:text-2xl font-black text-white tracking-tight flex items-center gap-2"
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            <span>Últimos Pedidos</span>
            <span className="text-stone-500 text-xs sm:text-sm font-bold bg-stone-900 border border-stone-800 px-2 py-0.5 rounded-full">
              Últimos {validRecentOrders.length}
            </span>
          </h2>
        </div>
      </div>

      {/* Fileira com arrastar fluido no mouse e touch */}
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex gap-3.5 sm:gap-4 overflow-x-auto scrollbar-hide py-2 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth select-none ${
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-stone-900 border border-stone-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl text-white relative overflow-hidden"
            >
              {/* Fechar */}
              <button
                type="button"
                onClick={() => setModalState(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-stone-800 text-stone-400 hover:text-white hover:bg-stone-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-xl bg-red-950/80 border border-red-500/30 text-red-400">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-white">Detalhes do Pedido</h3>
                  <p className="text-xs text-stone-400">
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

              {/* Lista dos Itens do Pedido */}
              <div className="max-h-60 overflow-y-auto space-y-2.5 my-4 pr-1 scrollbar-thin">
                {modalState.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-stone-950/80 rounded-2xl border border-stone-800/80 flex flex-col gap-1"
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-sm text-stone-200">
                        {item.quantity}x {item.product_name}
                      </span>
                      <span className="font-bold text-sm text-red-400">
                        R${" "}
                        {Number(item.subtotal || item.product_price || 0)
                          .toFixed(2)
                          .replace(".", ",")}
                      </span>
                    </div>

                    {/* Adicionais */}
                    {item.additionals && item.additionals.length > 0 && (
                      <div className="text-xs text-stone-400 pl-2 border-l-2 border-stone-800 space-y-0.5">
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
                      <p className="text-[11px] text-amber-400/80 italic">
                        Obs: {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Total e Ação */}
              <div className="pt-3 border-t border-stone-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-stone-400 block">Total do Pedido</span>
                  <span className="text-xl font-black text-red-500">
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
                  className={`px-5 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg transition-all ${
                    reorderedSuccess
                      ? "bg-emerald-600 text-white"
                      : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-amber-500 text-white active:scale-95"
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
