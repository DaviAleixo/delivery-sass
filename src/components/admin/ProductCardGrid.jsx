import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff } from "lucide-react";
import {
  ProductActionButtons,
  ProductPrice,
  ProductThumbnail,
} from "./ProductViewShared";

export default function ProductCardGrid({
  products,
  getCategoryNameById,
  getCategorySizesById,
  updatingVisibilityId,
  onToggleVisibility,
  onEdit,
  onDelete,
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
      <AnimatePresence>
        {products.map((product) => {
          const isVisible = product.available !== false;
          const isUpdatingThis = updatingVisibilityId === product.id;

          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <Card
                className={`overflow-hidden transition-all duration-200 flex flex-col justify-between h-full border ${
                  isVisible
                    ? "bg-white border-gray-200 hover:shadow-md hover:border-gray-300"
                    : "bg-stone-50/90 border-amber-300/80 shadow-xs"
                }`}
              >
                {/* Imagem do Produto com Badge de Visibilidade Flutuante */}
                <div className="relative aspect-video sm:aspect-4/3 overflow-hidden bg-gray-100">
                  <ProductThumbnail product={product} isVisible={isVisible} iconSize="w-9 h-9" />

                  <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`shadow-sm text-xs font-bold px-2.5 py-1 backdrop-blur-md flex items-center gap-1.5 ${
                        isVisible
                          ? "bg-emerald-500/90 text-white border-emerald-400"
                          : "bg-amber-500/95 text-white border-amber-400"
                      }`}
                    >
                      {isVisible ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          Visível
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          Oculto
                        </>
                      )}
                    </Badge>
                  </div>

                  <div className="absolute bottom-2 left-2 z-10">
                    <span className="bg-black/70 backdrop-blur-md text-white text-[11px] font-semibold px-2 py-0.5 rounded-md">
                      {getCategoryNameById(product.category)}
                    </span>
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <CardContent className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <h3
                      className={`font-bold text-base line-clamp-1 ${
                        isVisible ? "text-gray-900" : "text-stone-700"
                      }`}
                    >
                      {product.name}
                    </h3>
                    {product.description ? (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                        {product.description}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic mt-1">
                        Sem descrição cadastrada
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between gap-2">
                      <ProductPrice
                        product={product}
                        categorySizes={getCategorySizesById?.(product.category)}
                      />
                      <ProductActionButtons
                        product={product}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    </div>

                    <div
                      className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                        isVisible
                          ? "bg-emerald-50/50 border-emerald-200/80"
                          : "bg-amber-50/70 border-amber-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isVisible ? (
                          <Eye className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-amber-600" />
                        )}
                        <Label
                          htmlFor={`switch-vis-${product.id}`}
                          className="text-xs font-semibold cursor-pointer select-none"
                        >
                          {isVisible ? "Visível no cardápio" : "Oculto no cardápio"}
                        </Label>
                      </div>

                      <Switch
                        id={`switch-vis-${product.id}`}
                        checked={isVisible}
                        disabled={isUpdatingThis}
                        onCheckedChange={() => onToggleVisibility(product)}
                        className="data-[state=checked]:bg-emerald-600"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

