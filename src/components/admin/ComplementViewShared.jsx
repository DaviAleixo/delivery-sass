import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Edit3, Pizza, Trash2 } from "lucide-react";

export function formatSelectionRule(group) {
  const min = Number(group.min_quantity || 0);
  const max = Math.max(1, Number(group.max_quantity || 1));
  const isRequired = Boolean(group.required || min > 0);

  if (isRequired) {
    const effectiveMin = Math.max(1, min);
    return effectiveMin === max
      ? `Obrigatório · Escolha ${effectiveMin}`
      : `Obrigatório · Mín ${effectiveMin} / Máx ${max}`;
  }
  return `Opcional · Até ${max}`;
}

export function ComplementRuleBadges({ group }) {
  const isRequired = Boolean(group.required || group.min_quantity > 0);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {group.is_size_selector && (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-800 border-blue-200 text-[10px] font-semibold inline-flex items-center gap-1"
        >
          📏 Seletor de Tamanho
        </Badge>
      )}
      {group.free_quantity > 0 && (
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-semibold inline-flex items-center gap-1"
        >
          🎁 Até {group.free_quantity} Grátis
        </Badge>
      )}
      {group.is_pizza_crust && (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-semibold inline-flex items-center gap-1"
        >
          <Pizza className="w-2.5 h-2.5" />
          Borda / Pizza Toda
        </Badge>
      )}
      <Badge
        variant="outline"
        className={`text-[10px] font-semibold ${
          isRequired
            ? "bg-amber-50 text-amber-800 border-amber-200"
            : "bg-stone-100 text-stone-600 border-stone-200"
        }`}
      >
        {formatSelectionRule(group)}
      </Badge>
    </div>
  );
}

export function ComplementActionButtons({
  group,
  onDuplicate,
  onEdit,
  onDelete,
  isDuplicating = false,
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={isDuplicating}
        onClick={() => onDuplicate(group)}
        className="h-8 w-8 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg cursor-pointer"
        title="Duplicar grupo com opções"
      >
        <Copy className="w-3.5 h-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onEdit(group)}
        className="h-8 w-8 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg cursor-pointer"
        title="Editar grupo"
      >
        <Edit3 className="w-3.5 h-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onDelete(group.id)}
        className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
        title="Excluir grupo"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export function formatOptionPrice(price) {
  const num = Number(price || 0);
  if (num <= 0) return "Grátis";
  return `+ R$ ${num.toFixed(2).replace(".", ",")}`;
}

