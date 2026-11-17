import React from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  CouponActionButtons,
  CouponCodeBadge,
  CouponDiscountBadge,
  CouponRuleSummary,
  isCouponExpired,
} from "./CouponViewShared";

export default function CouponListTable({
  coupons,
  onToggleActive,
  onEdit,
  onDelete,
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-100/80 text-stone-500 font-semibold uppercase text-[10px] tracking-wide">
              <th className="py-3 px-4">Cupom & Código</th>
              <th className="py-3 px-4">Desconto</th>
              <th className="py-3 px-4">Regras & Vigência</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200/70">
            {coupons.map((coupon) => {
              const expired = isCouponExpired(coupon);
              const isActive = Boolean(coupon.active);

              return (
                <tr
                  key={coupon.id}
                  className={`transition-colors ${
                    !isActive
                      ? "bg-stone-50/60 opacity-80 hover:bg-stone-100/70"
                      : expired
                      ? "bg-rose-50/30 hover:bg-rose-50/60"
                      : "odd:bg-white even:bg-stone-50/90 hover:bg-emerald-50/40"
                  }`}
                >
                  {/* Cupom & Código */}
                  <td className="py-3 px-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-[200px]">
                      <CouponCodeBadge code={coupon.code} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-900 leading-tight">
                          {coupon.name}
                        </p>
                        {coupon.description && (
                          <p className="text-[11px] text-stone-500 truncate max-w-xs mt-0.5" title={coupon.description}>
                            {coupon.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Desconto */}
                  <td className="py-3 px-4">
                    <div className="flex flex-col items-start gap-1">
                      <CouponDiscountBadge coupon={coupon} size="sm" />
                    </div>
                  </td>

                  {/* Regras & Vigência */}
                  <td className="py-3 px-4">
                    <CouponRuleSummary coupon={coupon} />
                  </td>

                  {/* Status */}
                  <td className="py-3 px-4 text-center">
                    <div className="inline-flex flex-col items-center gap-1.5">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(checked) => onToggleActive(coupon, checked)}
                        title={isActive ? "Desativar cupom" : "Ativar cupom"}
                      />
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
                  </td>

                  {/* Ações */}
                  <td className="py-3 px-4 text-right">
                    <CouponActionButtons
                      coupon={coupon}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
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

