import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Package } from "lucide-react";
import { formatBRLValue } from "@/utils/pizzaPricing";

function PopularProductCard({ product, index, hasMoved, onProductClick, isVisualOnly = false }) {
  const [imageError, setImageError] = useState(false);
  const isTop1 = index === 0;
  const isTop3 = index < 3;
  const hasValidImage = Boolean(product.image_url && !imageError);

  return (
    <motion.div
      key={product.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03, ease: [0.25, 1, 0.5, 1] }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0 w-36 sm:w-44 group cursor-pointer"
      onClick={() => {
        if (!hasMoved) {
          onProductClick(product);
        }
      }}
    >
      <div
        className="relative flex flex-col h-full rounded-2xl overflow-hidden border border-stone-200/80 group-hover:border-emerald-500/40 transition-all duration-200 shadow-xs group-hover:shadow-sm p-2 sm:p-2.5 bg-white"
      >
        {/* Imagem Quadrada */}
        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-stone-50 border border-stone-100">
          {hasValidImage ? (
            <img
              src={product.image_url}
              alt={product.name}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-stone-50 border border-stone-100">
              <Package className="w-8 h-8 text-stone-300 stroke-[1.5]" />
            </div>
          )}

          {/* Badge de Ranking sóbrio e profissional */}
          <div className={`absolute top-2 left-2 border text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-xs flex items-center gap-1 ${
            isTop1 
              ? 'bg-amber-50 text-amber-900 border-amber-200' 
              : (isTop3 
                  ? 'bg-stone-50 text-stone-800 border-stone-200' 
                  : 'bg-white/95 text-stone-700 border-stone-200')
          }`}>
            <span>#{index + 1}</span>
          </div>

          {/* Botão flutuante rápido */}
          {!isVisualOnly && (
            <div className="absolute bottom-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center shadow-xs transition-transform active:scale-90 group-hover:bg-emerald-800">
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
            </div>
          )}
        </div>

        {/* Informações */}
        <div className="pt-2 sm:pt-2.5 px-0.5 flex flex-col flex-1 justify-between">
          <h3
            className="font-bold text-xs sm:text-sm text-stone-900 group-hover:text-emerald-800 transition-colors line-clamp-1 leading-snug tracking-tight"
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            {product.name}
          </h3>
          
          <div className="mt-1.5 flex items-baseline justify-between gap-1">
            <span
              className="font-bold text-xs sm:text-sm text-stone-950 tracking-tight"
              style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
            >
              {formatBRLValue(product.min_size_price || product.price || 0)}
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

export default function VrummPopularProductsRow({ products = [], onProductClick, _isStoreOpen = true, isVisualOnly = false }) {
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
    <section className="space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2
            className="text-base sm:text-lg font-bold text-stone-900 tracking-tight flex items-center gap-2"
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            <span>Mais Pedidos</span>
            <span className="text-stone-500 text-xs font-semibold bg-stone-100 border border-stone-200/80 px-2 py-0.5 rounded-full">
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
        className={`flex gap-3 sm:gap-3.5 overflow-x-auto scrollbar-hide py-1 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth select-none ${
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
            isVisualOnly={isVisualOnly}
          />
        ))}
      </div>
    </section>
  );
}
