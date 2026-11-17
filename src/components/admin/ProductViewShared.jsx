import React from "react";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Package } from "lucide-react";
import {
  formatBRLValue,
  getMinPizzaPrice,
  getPizzaSizePriceList,
  hasMultipleDistinctVariationPrices,
  hasPizzaPrices,
} from "@/utils/pizzaPricing";

export function ProductThumbnail({ product, isVisible, className = "", iconSize = "w-7 h-7" }) {
  if (product.image_url) {
    return (
      <img
        src={product.image_url}
        alt={product.name}
        className={`w-full h-full object-cover transition-all ${
          isVisible ? "" : "grayscale-40 opacity-75"
        } ${className}`}
      />
    );
  }

  return (
    <div
      className={`w-full h-full flex items-center justify-center bg-stone-50 border border-stone-100 ${className}`}
    >
      <Package className={`${iconSize} text-stone-300 stroke-[1.5]`} />
    </div>
  );
}

export function ProductPrice({ product, categorySizes = [], compact = false }) {
  if (hasPizzaPrices(product)) {
    const minPrice = getMinPizzaPrice(product, categorySizes);
    const sizeList = getPizzaSizePriceList(product, categorySizes);
    const hasMultipleDistinct = hasMultipleDistinctVariationPrices(product, categorySizes);

    return (
      <div className={compact ? "text-right" : ""}>
        <span className="text-xs font-semibold text-stone-500 block">
          {hasMultipleDistinct && "A partir de "}
          <span
            className={`${
              compact ? "text-sm" : "text-lg"
            } font-black font-mono tabular-nums text-stone-900`}
          >
            {formatBRLValue(minPrice)}
          </span>
        </span>
        {sizeList.length > 0 && (
          <div
            className={`text-[10px] text-stone-400 font-mono mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 ${
              compact ? "justify-end" : ""
            }`}
          >
            {sizeList.map((s, idx) => (
              <span key={s.id} className="whitespace-nowrap">
                {idx > 0 ? "· " : ""}
                {s.shortName} {formatBRLValue(s.price)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      className={`${
        compact ? "text-sm" : "text-lg"
      } font-black font-mono tabular-nums text-stone-900`}
    >
      {formatBRLValue(product.price)}
    </span>
  );
}

export function ProductActionButtons({ product, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onEdit(product)}
        className="h-8 px-2.5 text-xs text-stone-700 bg-white hover:bg-stone-100 border-stone-300 cursor-pointer"
        title="Editar produto"
      >
        <Edit className="w-3.5 h-3.5 mr-1" />
        Editar
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDelete(product.id)}
        className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
        title="Excluir produto"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

