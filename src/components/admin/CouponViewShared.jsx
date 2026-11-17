import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Percent,
  DollarSign,
  Copy,
  Edit3,
  Trash2,
  Calendar,
  AlertCircle,
  Tag,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function isCouponExpired(coupon) {
  if (!coupon?.end_date) return false;
  return new Date(coupon.end_date) < new Date();
}

export function formatCouponDiscount(coupon) {
  if (!coupon) return "";
  if (coupon.discount_type === "fixed_amount") {
    const val = Number(coupon.discount_value || 0);
    return `R$ ${val.toFixed(2).replace(".", ",")} OFF`;
  }
  return `${coupon.discount_value || 0}% OFF`;
}

export function CouponDiscountBadge({ coupon, size = "md" }) {
  const isPercentage = coupon?.discount_type === "percentage";
  const label = formatCouponDiscount(coupon);
  const isTextSm = size === "sm";

  return (
    <Badge
      variant="outline"
      className={`font-extrabold inline-flex items-center gap-1 shrink-0 ${
        isTextSm ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1"
      } ${
        isPercentage
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-emerald-50 text-emerald-700 border-emerald-200"
      }`}
    >
      {isPercentage ? (
        <Percent className="w-3 h-3 text-blue-600" />
      ) : (
        <DollarSign className="w-3 h-3 text-emerald-600" />
      )}
      <span>{label}</span>
    </Badge>
  );
}

export function CouponCodeBadge({ code, className = "" }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (!code) return;
    try {
      navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(`Código "${code}" copiado!`);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Clique para copiar o código"
      className={`group/code inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-stone-200 bg-stone-100/80 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-mono font-bold text-xs text-stone-800 hover:text-emerald-800 cursor-pointer ${className}`}
    >
      <Tag className="w-3 h-3 text-stone-400 group-hover/code:text-emerald-600" />
      <span>{code}</span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald-600 ml-0.5" />
      ) : (
        <Copy className="w-3 h-3 text-stone-400 group-hover/code:text-emerald-600 ml-0.5 opacity-60 group-hover/code:opacity-100" />
      )}
    </button>
  );
}

export function CouponRuleSummary({ coupon }) {
  const expired = isCouponExpired(coupon);
  const minVal = Number(coupon?.min_order_value || 0);
  const limit = coupon?.usage_limit ? Number(coupon.usage_limit) : null;
  const isProductsSpecific =
    coupon?.apply_to === "specific_products" &&
    Array.isArray(coupon?.applicable_products) &&
    coupon.applicable_products.length > 0;

  return (
    <div className="space-y-1 text-[11px] text-stone-600">
      <div className="flex items-center gap-2 flex-wrap">
        {minVal > 0 ? (
          <span className="font-medium text-stone-700">
            Mín: <strong className="text-stone-900">R$ {minVal.toFixed(2).replace(".", ",")}</strong>
          </span>
        ) : (
          <span className="text-stone-400">Sem pedido mín.</span>
        )}

        <span className="text-stone-300">·</span>

        <span>
          {limit ? (
            <span className="font-medium text-stone-700">
              Limite: <strong className="text-stone-900">{limit}x</strong>/cliente
            </span>
          ) : (
            <span className="text-stone-400">Uso ilimitado</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {isProductsSpecific ? (
          <span className="text-indigo-600 font-medium">
            {coupon.applicable_products.length} produto(s) específico(s)
          </span>
        ) : (
          <span className="text-stone-500">Aplica no total do pedido</span>
        )}

        {coupon?.end_date && (
          <>
            <span className="text-stone-300">·</span>
            <span
              className={`inline-flex items-center gap-1 ${
                expired ? "text-rose-600 font-bold" : "text-stone-600"
              }`}
            >
              {expired ? (
                <AlertCircle className="w-3 h-3 text-rose-500" />
              ) : (
                <Calendar className="w-3 h-3 text-stone-400" />
              )}
              {expired
                ? `Venceu em ${format(new Date(coupon.end_date), "dd/MM/yyyy", { locale: ptBR })}`
                : `Até ${format(new Date(coupon.end_date), "dd/MM/yyyy", { locale: ptBR })}`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function CouponActionButtons({ coupon, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-1 justify-end">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg cursor-pointer"
        onClick={() => onEdit(coupon)}
        title="Editar Cupom"
      >
        <Edit3 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
        onClick={() => onDelete(coupon.id)}
        title="Excluir Cupom"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

