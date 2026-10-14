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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
      className="group cursor-pointer w-full select-none"
      onClick={() => onProductClick(product)}
    >
      <div 
        className="relative flex items-center justify-between gap-3.5 sm:gap-4 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-stone-800/80 hover:border-red-500/50 shadow-lg hover:shadow-2xl hover:shadow-red-950/20 transition-all duration-300 overflow-hidden bg-gradient-to-b from-[#181311] via-[#140f0e] to-[#100d0c]"
      >
        {/* Ambient Hover Glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/5 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {/* Lado Esquerdo / Principal: Informações e Preço */}
        <div className="flex-1 min-w-0 pr-1 flex flex-col justify-between self-stretch py-0.5 relative z-10">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 
                className="font-extrabold text-sm sm:text-base text-stone-100 group-hover:text-red-400 transition-colors line-clamp-1 tracking-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {product.name}
              </h3>
            </div>

            {product.description && (
              <p className="text-[11px] sm:text-xs text-stone-400 leading-relaxed line-clamp-2 mt-1.5 font-normal">
                {product.description}
              </p>
            )}
          </div>

          <div className="pt-3 mt-auto flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span 
                className="font-black text-sm sm:text-base text-red-500 tracking-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}
              </span>

              {product.promotional_price && Number(product.promotional_price) > 0 && (
                <span className="text-[11px] text-stone-500 line-through">
                  R$ {Number(product.promotional_price).toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>

            {/* Botão + visível no rodapé quando não há foto e não é apenas visual */}
            {!hasValidImage && !isVisualOnly && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.9 }}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-red-600 to-red-500 group-hover:from-red-500 group-hover:to-amber-500 text-white flex items-center justify-center transition-all duration-300 shadow-md shadow-red-950/70 pointer-events-none"
                aria-label="Adicionar produto"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Lado Direito: Imagem (Exibida SOMENTE se houver foto válida) */}
        {hasValidImage && (
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 min-w-[96px] min-h-[96px] max-w-[96px] max-h-[96px] sm:min-w-[112px] sm:min-h-[112px] sm:max-w-[112px] sm:max-h-[112px] flex-shrink-0 rounded-2xl overflow-hidden bg-stone-900/90 border border-stone-800/80 shadow-inner group-hover:border-red-500/40 transition-colors">
            <img
              src={product.image_url}
              alt={product.name}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 block"
              loading="lazy"
            />

            {/* Botão flutuante + sobre a imagem */}
            {!isVisualOnly && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.9 }}
                className="absolute bottom-1.5 right-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-r from-red-600 to-red-500 group-hover:from-red-500 group-hover:to-amber-500 text-white flex items-center justify-center transition-all duration-300 shadow-md shadow-red-950/70 pointer-events-none"
                aria-label="Adicionar produto"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
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