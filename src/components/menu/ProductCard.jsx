import React, { forwardRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

const ProductCard = forwardRef(function ProductCard(
  { product, onProductClick, _isStoreOpen = true, _isPopular = false, isVisualOnly = false, cashbackRate = 0 },
  ref
) {
  const [imageError, setImageError] = useState(false);
  const hasValidImage = Boolean(product?.image_url && !imageError);

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
      className="group cursor-pointer w-full select-none"
      onClick={() => onProductClick(product)}
    >
      <div 
        className="relative flex items-center justify-between gap-3 sm:gap-4 p-3.5 sm:p-4 bg-white hover:bg-stone-50/70 transition-colors duration-150 overflow-hidden w-full"
      >
        {/* Lado Esquerdo: Imagem Quadrada com cantos bem arredondados */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 min-w-[80px] min-h-[80px] sm:min-w-[96px] sm:min-h-[96px] max-w-[80px] max-h-[80px] sm:max-w-[96px] sm:max-h-[96px] flex-shrink-0 rounded-2xl overflow-hidden bg-stone-50 border border-stone-100 flex items-center justify-center">
          {hasValidImage ? (
            <img
              src={product.image_url}
              alt={product.name}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 block"
              loading="lazy"
            />
          ) : (
            <span className="text-2xl select-none">🍽️</span>
          )}
        </div>

        {/* Centro: Informações, Descrição e Preço */}
        <div className="flex-1 min-w-0 pr-1 flex flex-col justify-center py-0.5">
          <h3 
            className="font-bold text-sm sm:text-base text-stone-900 group-hover:text-[#046c4e] transition-colors line-clamp-1 tracking-tight leading-snug"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            {product.name}
          </h3>

          {product.description && (
            <p className="text-[11px] sm:text-xs text-stone-500 leading-snug line-clamp-2 mt-0.5 font-normal">
              {product.description}
            </p>
          )}

          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span 
              className="font-bold text-xs sm:text-sm text-stone-950 tracking-tight"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {product.pizza_prices && Object.keys(product.pizza_prices).length > 0 ? (
                <>
                  <span className="text-[11px] font-normal text-stone-500 mr-1">A partir de</span>
                  R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}
                </>
              ) : (
                <>R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}</>
              )}
            </span>

            {product.promotional_price && Number(product.promotional_price) > 0 && (
              <span className="text-[10px] text-stone-400 line-through">
                R$ {Number(product.promotional_price).toFixed(2).replace('.', ',')}
              </span>
            )}
          </div>

          {cashbackRate > 0 && !isVisualOnly && (() => {
            const cbVal = (Number(product.price || 0) * cashbackRate) / 100;
            return cbVal >= 0.05 ? (
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.2 rounded-md mt-1 w-fit">
                🎁 +R$ {cbVal.toFixed(2).replace('.', ',')} de volta
              </span>
            ) : null;
          })()}
        </div>

        {/* Lado Direito: Botão Circular Verde + */}
        {!isVisualOnly && (
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#046c4e] hover:bg-[#03543d] text-white flex items-center justify-center shadow-xs flex-shrink-0 transition-transform group-hover:scale-105 active:scale-95">
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </div>
        )}
      </div>
    </motion.div>
  );
});

ProductCard.displayName = "ProductCard";

export default ProductCard;