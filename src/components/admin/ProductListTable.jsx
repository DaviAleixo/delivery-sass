import React from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff } from "lucide-react";
import {
  ProductActionButtons,
  ProductPrice,
  ProductThumbnail,
} from "./ProductViewShared";

export default function ProductListTable({
  products,
  getCategoryNameById,
  getCategorySizesById,
  updatingVisibilityId,
  onToggleVisibility,
  onEdit,
  onDelete,
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-100/80 text-stone-500 font-semibold uppercase text-[10px] tracking-wide">
              <th className="py-3 px-4">Produto</th>
              <th className="py-3 px-4">Categoria</th>
              <th className="py-3 px-4 text-right">Preço</th>
              <th className="py-3 px-4 text-center">Cardápio</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200/70">
            {products.map((product) => {
              const isVisible = product.available !== false;
              const isUpdatingThis = updatingVisibilityId === product.id;

              return (
                <tr
                  key={product.id}
                  className={`transition-colors ${
                    isVisible
                      ? "odd:bg-white even:bg-stone-50/90 hover:bg-emerald-50/40"
                      : "bg-amber-50/50 hover:bg-amber-50/80"
                  }`}
                >
                  {/* Foto menor + Nome + Descrição */}
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-stone-200 shrink-0 bg-stone-100">
                        <ProductThumbnail
                          product={product}
                          isVisible={isVisible}
                          iconSize="w-5 h-5"
                        />
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`font-bold text-sm truncate max-w-[280px] ${
                            isVisible ? "text-stone-900" : "text-stone-600"
                          }`}
                        >
                          {product.name}
                        </p>
                        {product.description ? (
                          <p className="text-[11px] text-stone-500 truncate max-w-[320px] mt-0.5">
                            {product.description}
                          </p>
                        ) : (
                          <p className="text-[11px] text-stone-400 italic mt-0.5">
                            Sem descrição
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Categoria */}
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <Badge
                      variant="outline"
                      className="bg-white border-stone-200 text-stone-700 font-medium text-[11px]"
                    >
                      {getCategoryNameById(product.category)}
                    </Badge>
                  </td>

                  {/* Preço */}
                  <td className="py-2.5 px-4 text-right">
                    <ProductPrice
                      product={product}
                      categorySizes={getCategorySizesById?.(product.category)}
                      compact
                    />
                  </td>

                  {/* Switch Visibilidade */}
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          isVisible
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {isVisible ? (
                          <>
                            <Eye className="w-3 h-3" />
                            Visível
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            Oculto
                          </>
                        )}
                      </span>
                      <Switch
                        id={`list-switch-vis-${product.id}`}
                        checked={isVisible}
                        disabled={isUpdatingThis}
                        onCheckedChange={() => onToggleVisibility(product)}
                        className="data-[state=checked]:bg-emerald-600"
                        aria-label={`Alternar visibilidade de ${product.name}`}
                      />
                    </div>
                  </td>

                  {/* Ações */}
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex justify-end">
                      <ProductActionButtons
                        product={product}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

