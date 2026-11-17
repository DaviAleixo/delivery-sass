import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  CouponActionButtons,
  CouponCodeBadge,
  CouponDiscountBadge,
  CouponRuleSummary,
  isCouponExpired,
} from "./CouponViewShared";

export default function CouponCardGrid({
  coupons,
  onToggleActive,
  onEdit,
  onDelete,
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
      {coupons.map((coupon) => {
        const expired = isCouponExpired(coupon);
        const isActive = Boolean(coupon.active);

        return (
          <Card
            key={coupon.id}
            className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs hover:shadow-md flex flex-col justify-between ${
              !isActive
                ? "bg-stone-50/70 border-stone-200 opacity-80"
                : expired
                ? "bg-rose-50/20 border-rose-200"
                : "bg-white border-stone-200"
            }`}
          >
            {/* Cabeçalho do Card */}
            <div className="p-4 border-b border-stone-100 bg-stone-50/60 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <CouponDiscountBadge coupon={coupon} size="sm" />
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold px-1.5 py-0 ${
                      !isActive
                        ? "bg-stone-100 text-stone-600 border-stone-200"
                        : expired
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-emerald-50 text-[#047857] border-emerald-200"
                    }`}
                  >
                    {!isActive ? "Pausado" : expired ? "Expirado" : "Ativo"}
                  </Badge>
                </div>
                <h3 className="font-bold text-gray-900 text-base leading-snug truncate" title={coupon.name}>
                  {coupon.name}
                </h3>
              </div>

              <Switch
                checked={isActive}
                onCheckedChange={(checked) => onToggleActive(coupon, checked)}
                title={isActive ? "Desativar cupom" : "Ativar cupom"}
                className="shrink-0 mt-0.5"
              />
            </div>

            {/* Conteúdo */}
            <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                    Código Promocional
                  </span>
                  <CouponCodeBadge code={coupon.code} />
                </div>

                {coupon.description && (
                  <p className="text-xs text-stone-600 line-clamp-2" title={coupon.description}>
                    {coupon.description}
                  </p>
                )}

                <div className="pt-2 border-t border-stone-100">
                  <CouponRuleSummary coupon={coupon} />
                </div>
              </div>

              {/* Rodapé com Ações */}
              <div className="pt-3 border-t border-stone-100 flex items-center justify-end mt-auto">
                <CouponActionButtons
                  coupon={coupon}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

