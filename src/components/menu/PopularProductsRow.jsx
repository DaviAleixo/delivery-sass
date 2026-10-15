import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

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
      className="flex-shrink-0 w-32 sm:w-36 group cursor-pointer"
      onClick={() => {
        if (!hasMoved) {
          onProductClick(product);
        }
      }}
    >
      <div className="relative flex flex-col h-full">
        {/* Imagem Quadrada com cantos arredondados */}
        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-[#F7F9F8] border border-[#E5EAE7]">
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
            <div className="w-full h-full flex items-center justify-center text-3xl bg-[#F7F9F8]">
              🍽️
            </div>
          )}

          {/* Badge de Ranking minimalista */}
          <div className={`absolute top-2 left-2 text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1 ${
            isTop1 
              ? 'bg-amber-500 text-white' 
              : (isTop3 
                  ? 'bg-[#047857] text-white' 
                  : 'bg-[#D1E9DF] text-[#047857] border border-[#047857]/20')
          }`}>
            <span>#{index + 1}</span>
          </div>

          {/* Botão flutuante rápido sobre a imagem */}
          {!isVisualOnly && (
            <div className="absolute bottom-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#047857] hover:bg-[#036348] text-white flex items-center justify-center shadow-md transition-transform active:scale-90">
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
            </div>
          )}
        </div>

        {/* Informações */}
        <div className="pt-2 px-0.5 flex flex-col flex-1 justify-between">
          <h3
            className="font-bold text-xs sm:text-sm text-[#171717] group-hover:text-[#047857] transition-colors line-clamp-1 leading-snug tracking-tight"
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            {product.name}
          </h3>
          
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span
              className="font-black text-xs sm:text-sm text-[#171717] tracking-tight"
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

export default function PopularProductsRow({ products = [], onProductClick, _isStoreOpen = true, isVisualOnly = false }) {
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);

  const popularProducts = products
    .filter((p) => p.available !== false)
    .slice(0, 7);

  if (popularProducts.length === 0) return null;

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
      {/* Cabeçalho dentro do card grande */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2
            className="text-base sm:text-lg font-black text-[#171717] tracking-tight flex items-center gap-2"
            style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
          >
            <span>Mais Pedidos</span>
            <span className="text-[#047857] text-[11px] font-bold bg-[#D1E9DF]/60 border border-[#D1E9DF] px-2 py-0.5 rounded-full">
              Top {popularProducts.length}
            </span>
          </h2>
        </div>
      </div>

      {/* Fileira com arrastar fluido */}
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
