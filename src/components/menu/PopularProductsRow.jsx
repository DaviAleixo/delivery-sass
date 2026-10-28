import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

function PopularProductCard({ product, index, hasMoved, onProductClick, isVisualOnly = false }) {
  const [imageError, setImageError] = useState(false);
  const hasValidImage = Boolean(product.image_url && !imageError);

  return (
    <motion.div
      key={product.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03, ease: [0.25, 1, 0.5, 1] }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className="flex-shrink-0 w-36 sm:w-40 bg-white rounded-2xl p-2.5 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between cursor-pointer group select-none"
      onClick={() => {
        if (!hasMoved) {
          onProductClick(product);
        }
      }}
    >
      {/* Imagem Proporção 4:3 com cantos arredondados */}
      <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
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
          <div className="w-full h-full flex items-center justify-center text-3xl bg-gray-50">
            🍽️
          </div>
        )}
      </div>

      {/* Informações: Título, Preço e Botão + verde circular */}
      <div className="pt-2 flex flex-col flex-1 justify-between">
        <h3 className="font-bold text-xs sm:text-sm text-gray-900 group-hover:text-[#046c4e] transition-colors line-clamp-1 leading-snug tracking-tight">
          {product.name}
        </h3>
        
        <div className="mt-2 flex items-center justify-between">
          <span className="font-black text-xs sm:text-sm text-gray-950">
            {product.pizza_prices && Object.keys(product.pizza_prices).length > 0 ? (
              <span className="text-[10px] sm:text-xs">
                A partir de R$ {Number(product.price || 0).toFixed(2).replace(".", ",")}
              </span>
            ) : (
              `R$ ${Number(product.price || 0).toFixed(2).replace(".", ",")}`
            )}
          </span>

          {!isVisualOnly && (
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#046c4e] hover:bg-[#03543d] text-white flex items-center justify-center shadow-xs transition-transform active:scale-90">
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </div>
          )}
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
    <section className="space-y-3">
      {/* Cabeçalho limpo fora de container, idêntico à Foto 1 */}
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-lg sm:text-xl font-black text-gray-950 tracking-tight">
          Mais pedidos
        </h2>
        <span className="text-[#046c4e] text-xs font-bold bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
          Top {popularProducts.length}
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
