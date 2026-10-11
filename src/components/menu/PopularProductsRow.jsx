import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

function PopularProductCard({ product, index, hasMoved, onProductClick }) {
  const [imageError, setImageError] = useState(false);
  const isTop1 = index === 0;
  const isTop3 = index < 3;
  const hasValidImage = Boolean(product.image_url && !imageError);

  return (
    <motion.div
      key={product.id}
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.25, 1, 0.5, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.96 }}
      className="flex-shrink-0 w-36 sm:w-44 group cursor-pointer"
      onClick={() => {
        if (!hasMoved) {
          onProductClick(product);
        }
      }}
    >
      <div
        className="relative flex flex-col h-full rounded-2xl sm:rounded-3xl overflow-hidden border border-stone-800/90 group-hover:border-red-500/60 transition-all duration-300 shadow-md group-hover:shadow-2xl group-hover:shadow-red-950/40 p-2 sm:p-2.5 bg-gradient-to-b from-[#191311] via-[#140f0e] to-[#110d0c]"
      >
        {/* Glow sutil */}
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/0 via-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Imagem Quadrada */}
        <div className="relative w-full aspect-square rounded-xl sm:rounded-2xl overflow-hidden bg-stone-900/90 border border-stone-800/60 shadow-inner">
          {hasValidImage ? (
            <img
              src={product.image_url}
              alt={product.name}
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

          {/* Badge de Ranking sofisticado */}
          <div className={`absolute top-2 left-2 backdrop-blur-md border text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-lg shadow-lg flex items-center gap-1 ${
            isTop1 
              ? 'bg-amber-950/85 text-amber-300 border-amber-500/50 shadow-amber-950/50' 
              : (isTop3 
                  ? 'bg-stone-900/85 text-amber-400 border-stone-700/60' 
                  : 'bg-stone-950/80 text-stone-300 border-stone-800/80')
          }`}>
            <span>#{index + 1}</span>
          </div>

          {/* Botão flutuante rápido */}
          <div className="absolute bottom-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-red-600 to-red-500 group-hover:from-red-500 group-hover:to-amber-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-90">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
          </div>
        </div>

        {/* Informações */}
        <div className="pt-2 sm:pt-2.5 px-1 flex flex-col flex-1 justify-between relative z-10">
          <h3
            className="font-bold text-xs sm:text-sm text-stone-100 group-hover:text-red-400 transition-colors line-clamp-1 leading-snug tracking-tight"
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            {product.name}
          </h3>
          
          <div className="mt-1.5 flex items-baseline justify-between gap-1">
            <span
              className="font-black text-xs sm:text-sm text-red-500 tracking-tight"
              style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
            >
              R$ {Number(product.price || 0).toFixed(2).replace(".", ",")}
            </span>
            {product.totalSold > 0 && (
              <span className="text-[10px] text-stone-400 font-medium">
                {product.totalSold} {product.totalSold === 1 ? 'pedido' : 'pedidos'}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function PopularProductsRow({ products = [], onProductClick, _isStoreOpen = true }) {
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);

  // Pega os 7 produtos mais pedidos (ou os primeiros 7 disponíveis)
  const popularProducts = products
    .filter((p) => p.available !== false)
    .slice(0, 7);

  if (popularProducts.length === 0) return null;

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
          <h2
            className="text-lg sm:text-2xl font-black text-white tracking-tight flex items-center gap-2"
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            <span>Mais Pedidos</span>
            <span className="text-stone-500 text-xs sm:text-sm font-bold bg-stone-900 border border-stone-800 px-2 py-0.5 rounded-full">
              Top {popularProducts.length}
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
        {popularProducts.map((product, index) => (
          <PopularProductCard
            key={product.id}
            product={product}
            index={index}
            hasMoved={hasMoved}
            onProductClick={onProductClick}
          />
        ))}
      </div>
    </section>
  );
}
