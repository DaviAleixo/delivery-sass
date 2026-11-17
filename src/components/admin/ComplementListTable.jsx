import React from "react";
import { Switch } from "@/components/ui/switch";
import { Link2, ListPlus, PauseCircle, CheckCircle2 } from "lucide-react";
import {
  ComplementActionButtons,
  ComplementRuleBadges,
  formatOptionPrice,
} from "./ComplementViewShared";

export default function ComplementListTable({
  groups,
  getGroupItems,
  getLinkedCount,
  duplicatingGroupId,
  onToggleGroupActive,
  onToggleItemActive,
  onOpenItems,
  onOpenLinks,
  onDuplicate,
  onEdit,
  onDelete,
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-100/80 text-stone-500 font-semibold uppercase text-[10px] tracking-wide">
              <th className="py-3 px-4">Grupo</th>
              <th className="py-3 px-4">Regra</th>
              <th className="py-3 px-4">Opções (clique para pausar)</th>
              <th className="py-3 px-4 text-center">Produtos</th>
              <th className="py-3 px-4 text-center">Ativo</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200/70">
            {groups.map((group) => {
              const grpItems = getGroupItems(group.id);
              const linkedCount = getLinkedCount(group.id);
              const showDescription =
                group.description &&
                group.description.trim().toLowerCase() !==
                  String(group.name || "").trim().toLowerCase();

              return (
                <tr
                  key={group.id}
                  className={`transition-colors ${
                    group.active
                      ? "odd:bg-white even:bg-stone-50/90 hover:bg-emerald-50/35"
                      : "bg-amber-50/40 hover:bg-amber-50/70 opacity-85"
                  }`}
                >
                  {/* Nome */}
                  <td className="py-3 px-4 align-top">
                    <div className="min-w-[160px]">
                      <p className="font-bold text-sm text-stone-900">
                        {group.name}
                      </p>
                      {showDescription && (
                        <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1 max-w-[220px]">
                          {group.description}
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Regra */}
                  <td className="py-3 px-4 align-top whitespace-nowrap">
                    <ComplementRuleBadges group={group} />
                  </td>

                  {/* Opções rápidas */}
                  <td className="py-3 px-4 align-top">
                    <div className="flex flex-wrap items-center gap-1.5 max-w-[380px]">
                      {grpItems.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => onOpenItems(group)}
                          className="text-[11px] text-amber-700 font-semibold hover:underline cursor-pointer"
                        >
                          + Adicionar opções
                        </button>
                      ) : (
                        <>
                          {grpItems.slice(0, 4).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => onToggleItemActive(item, !item.active)}
                              title={
                                item.active
                                  ? "Clique para pausar"
                                  : "Clique para reativar"
                              }
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] transition-colors cursor-pointer ${
                                item.active
                                  ? "bg-white border-stone-200 text-stone-700 hover:bg-stone-100"
                                  : "bg-stone-100 border-dashed border-stone-300 text-stone-400 line-through"
                              }`}
                            >
                              {item.active ? (
                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                              ) : (
                                <PauseCircle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                              )}
                              <span>{item.name}</span>
                              <span className="font-mono font-semibold text-emerald-700">
                                {formatOptionPrice(item.price)}
                              </span>
                            </button>
                          ))}
                          {grpItems.length > 4 && (
                            <button
                              type="button"
                              onClick={() => onOpenItems(group)}
                              className="text-[11px] font-semibold text-stone-500 hover:text-[#047857] px-1 cursor-pointer"
                            >
                              +{grpItems.length - 4}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenItems(group)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#047857] hover:underline ml-1 cursor-pointer"
                            title="Gerenciar opções"
                          >
                            <ListPlus className="w-3 h-3" />
                            Editar
                          </button>
                        </>
                      )}
                    </div>
                  </td>

                  {/* Produtos vinculados */}
                  <td className="py-3 px-4 text-center align-top whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onOpenLinks(group)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50/70 border border-indigo-200/70 px-2.5 py-1 rounded-lg cursor-pointer"
                    >
                      <Link2 className="w-3 h-3" />
                      {linkedCount}
                    </button>
                  </td>

                  {/* Switch ativo */}
                  <td className="py-3 px-4 text-center align-top whitespace-nowrap">
                    <Switch
                      checked={group.active}
                      onCheckedChange={(c) => onToggleGroupActive(group, c)}
                      className="data-[state=checked]:bg-[#047857]"
                      aria-label={`Alternar status de ${group.name}`}
                    />
                  </td>

                  {/* Ações */}
                  <td className="py-3 px-4 text-right align-top whitespace-nowrap">
                    <div className="inline-flex justify-end">
                      <ComplementActionButtons
                        group={group}
                        onDuplicate={onDuplicate}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        isDuplicating={duplicatingGroupId === group.id}
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

