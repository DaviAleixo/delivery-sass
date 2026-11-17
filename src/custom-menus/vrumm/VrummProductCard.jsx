import React, { forwardRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Package } from "lucide-react";
import {
  formatBRLValue,
  getMinPizzaPrice,
  getPizzaSizePriceList,
  hasMultipleDistinctVariationPrices,
  hasPizzaPrices,
} from "@/utils/pizzaPricing";

const VrummProductCard = forwardRef(function VrummProductCard(
  { product, categorySizes = [], onProductClick, _isStoreOpen = true, _isPopular = false, isVisualOnly = false, cashbackRate = 0 },
  ref
) {
  const [imageError, setImageError] = useState(false);
  const hasValidImage = Boolean(product?.image_url && !imageError);

  const variationList = hasPizzaPrices(product) ? getPizzaSizePriceList(product, categorySizes) : [];
  const variationNamesSummary = variationList.map((v) => v.shortName).join(" · ");
  const hasMultipleDistinct = hasPizzaPrices(product) && hasMultipleDistinctVariationPrices(product, categorySizes);

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
        className="relative flex items-center justify-between gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl bg-white border border-stone-200/80 hover:border-emerald-500/40 hover:shadow-sm transition-all duration-200 overflow-hidden"
      >
        {/* Lado Esquerdo / Centro: Informações e Preço */}
        <div className="flex-1 min-w-0 pr-1 flex flex-col justify-between self-stretch py-0.5">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 
                className="font-bold text-sm sm:text-base text-stone-900 group-hover:text-emerald-800 transition-colors line-clamp-1 tracking-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {product.name}
              </h3>
            </div>

            {product.description && product.description.trim() !== "" ? (
              <p className="text-[11px] sm:text-xs text-stone-500 leading-relaxed line-clamp-2 mt-1 font-normal">
                {product.description}
              </p>
            ) : variationNamesSummary ? (
              <p className="text-[11px] sm:text-xs text-stone-500 leading-relaxed line-clamp-1 mt-1 font-normal">
                {variationNamesSummary}
              </p>
            ) : null}
          </div>

          <div className="pt-2.5 mt-auto flex items-center justify-between">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span 
                className="font-bold text-xs sm:text-sm text-stone-950 tracking-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {hasPizzaPrices(product) ? (
                  <>
                    {hasMultipleDistinct && (
                      <span className="text-[11px] font-normal text-stone-500 mr-1">A partir de</span>
                    )}
                    {formatBRLValue(getMinPizzaPrice(product, categorySizes))}
                  </>
                ) : product.min_size_price && Number(product.min_size_price) > 0 ? (
                  <>
                    <span className="text-[11px] font-normal text-stone-500 mr-1">A partir de</span>
                    {formatBRLValue(product.min_size_price)}
                  </>
                ) : (
                  formatBRLValue(product.price)
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
                <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded-md w-fit">
                  🎁 +R$ {cbVal.toFixed(2).replace('.', ',')} de volta
                </span>
              ) : null;
            })()}

            {/* Botão + visível se não há foto */}
            {!hasValidImage && !isVisualOnly && (
              <div
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center transition-all duration-200 shadow-xs pointer-events-none"
                aria-label="Adicionar produto"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Imagem Quadrada */}
        {hasValidImage ? (
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 min-w-[80px] min-h-[80px] sm:min-w-[96px] sm:min-h-[96px] max-w-[80px] max-h-[80px] sm:max-w-[96px] sm:max-h-[96px] flex-shrink-0 rounded-2xl overflow-hidden bg-stone-50 border border-stone-100 shadow-xs group-hover:border-emerald-500/30 transition-colors">
            <img
              src={product.image_url}
              alt={product.name}
              onError={() => setImageError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 block"
              loading="lazy"
            />

            {!isVisualOnly && (
              <div
                className="absolute bottom-1 right-1 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-700 text-white flex items-center justify-center transition-all duration-200 shadow-sm pointer-events-none"
                aria-label="Adicionar produto"
              >
                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
              </div>
            )}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
});

VrummProductCard.displayName = "VrummProductCard";

export default VrummProductCard;
