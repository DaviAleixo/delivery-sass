import React, { forwardRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

const ProductCard = forwardRef(function ProductCard(
  { product, onProductClick, _isStoreOpen = true, _isPopular = false, isVisualOnly = false },
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
        className="relative flex items-center justify-between gap-3.5 sm:gap-4 p-4 sm:p-5 bg-white hover:bg-stone-50/70 transition-colors duration-150 overflow-hidden w-full"
      >
        {/* Lado Esquerdo / Principal: Informações e Preço */}
        <div className="flex-1 min-w-0 pr-1 flex flex-col justify-between self-stretch py-0.5 relative z-10">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 
                className="font-extrabold text-sm sm:text-base text-[#171717] group-hover:text-[#047857] transition-colors line-clamp-1 tracking-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {product.name}
              </h3>
            </div>

            {product.description && (
              <p className="text-[11px] sm:text-xs text-stone-500 leading-relaxed line-clamp-2 mt-1 font-normal">
                {product.description}
              </p>
            )}
          </div>

          <div className="pt-3 mt-auto flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span 
                className="font-black text-sm sm:text-base text-[#171717] tracking-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {product.pizza_prices && Object.keys(product.pizza_prices).length > 0 ? (
                  <>
                    <span className="text-xs font-normal text-stone-500 mr-1">A partir de</span>
                    R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}
                  </>
                ) : (
                  <>R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}</>
                )}
              </span>

              {product.promotional_price && Number(product.promotional_price) > 0 && (
                <span className="text-[11px] text-stone-400 line-through">
                  R$ {Number(product.promotional_price).toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>

            {/* Botão + quando não há foto */}
            {!hasValidImage && !isVisualOnly && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#047857] hover:bg-[#036348] text-white flex items-center justify-center transition-all duration-200 shadow-xs pointer-events-none"
                aria-label="Adicionar produto"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Lado Direito: Imagem */}
        {hasValidImage && (
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 min-w-[96px] min-h-[96px] max-w-[96px] max-h-[96px] sm:min-w-[112px] sm:min-h-[112px] sm:max-w-[112px] sm:max-h-[112px] flex-shrink-0 rounded-xl overflow-hidden bg-[#F7F9F8] border border-[#E5EAE7]">
            <img
              src={product.image_url}
              alt={product.name}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 block"
              loading="lazy"
            />

            {/* Botão flutuante + sobre a imagem */}
            {!isVisualOnly && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                className="absolute bottom-1.5 right-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#047857] hover:bg-[#036348] text-white flex items-center justify-center transition-all duration-200 shadow-md pointer-events-none"
                aria-label="Adicionar produto"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </motion.button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});

ProductCard.displayName = "ProductCard";

export default ProductCard;