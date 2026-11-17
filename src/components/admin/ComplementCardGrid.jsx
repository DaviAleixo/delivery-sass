import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Link2, ListPlus, PauseCircle, CheckCircle2 } from "lucide-react";
import {
  ComplementActionButtons,
  ComplementRuleBadges,
  formatOptionPrice,
} from "./ComplementViewShared";

export default function ComplementCardGrid({
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 items-stretch">
      <AnimatePresence>
        {groups.map((group) => {
          const grpItems = getGroupItems(group.id);
          const linkedCount = getLinkedCount(group.id);
          const showDescription =
            group.description &&
            group.description.trim().toLowerCase() !==
              String(group.name || "").trim().toLowerCase();

          return (
            <motion.div
              key={group.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="h-full flex flex-col"
            >
              <Card
                className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-2xs hover:shadow-md flex flex-col justify-between h-full ${
                  group.active
                    ? "bg-white border-stone-200"
                    : "bg-stone-50/90 border-stone-200/80 opacity-80"
                }`}
              >
                {/* Cabeçalho */}
                <div className="p-4 border-b border-stone-100 bg-stone-50/40 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h3
                      className="font-bold text-stone-900 text-base truncate"
                      title={group.name}
                    >
                      {group.name}
                    </h3>
                    <ComplementRuleBadges group={group} />
                    {showDescription && (
                      <p
                        className="text-xs text-stone-500 line-clamp-1"
                        title={group.description}
                      >
                        {group.description}
                      </p>
                    )}
                  </div>

                  <Switch
                    checked={group.active}
                    onCheckedChange={(c) => onToggleGroupActive(group, c)}
                    title={group.active ? "Grupo ativo" : "Grupo pausado"}
                    className="shrink-0 mt-0.5 data-[state=checked]:bg-[#047857]"
                  />
                </div>

                {/* Corpo */}
                <CardContent className="p-4 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-2">
                      <span>Opções ({grpItems.length})</span>
                      <button
                        type="button"
                        onClick={() => onOpenItems(group)}
                        className="text-[#047857] hover:underline flex items-center gap-1 font-bold cursor-pointer normal-case text-xs"
                      >
                        <ListPlus className="w-3.5 h-3.5" /> Gerenciar opções
                      </button>
                    </div>

                    {grpItems.length === 0 ? (
                      <div className="py-5 px-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/50 text-center">
                        <AlertCircle className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                        <p className="text-xs text-amber-800 font-medium">
                          Nenhuma opção cadastrada
                        </p>
                        <button
                          type="button"
                          onClick={() => onOpenItems(group)}
                          className="text-[11px] text-[#047857] font-bold hover:underline mt-1 cursor-pointer"
                        >
                          + Adicionar opções
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                        {grpItems.slice(0, 6).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onToggleItemActive(item, !item.active)}
                            title={
                              item.active
                                ? "Clique para pausar esta opção"
                                : "Clique para reativar esta opção"
                            }
                            className={`w-full flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                              item.active
                                ? "bg-stone-50/80 border-stone-200/70 hover:bg-stone-100/80"
                                : "bg-stone-100/80 border-dashed border-stone-300 opacity-65 hover:opacity-90"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              {item.active ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              ) : (
                                <PauseCircle className="w-3 h-3 text-amber-600 shrink-0" />
                              )}
                              <span
                                className={`font-medium truncate ${
                                  item.active
                                    ? "text-stone-800"
                                    : "text-stone-400 line-through"
                                }`}
                              >
                                {item.name}
                              </span>
                            </span>
                            <span className="font-mono font-bold text-emerald-700 shrink-0 ml-2">
                              {formatOptionPrice(item.price)}
                            </span>
                          </button>
                        ))}
                        {grpItems.length > 6 && (
                          <button
                            type="button"
                            onClick={() => onOpenItems(group)}
                            className="w-full text-[11px] text-stone-500 hover:text-[#047857] text-center pt-0.5 cursor-pointer"
                          >
                            + {grpItems.length - 6} outras opções...
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Rodapé */}
                  <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2 mt-auto">
                    <button
                      type="button"
                      onClick={() => onOpenLinks(group)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>
                        {linkedCount}{" "}
                        {linkedCount === 1
                          ? "produto vinculado"
                          : "produtos vinculados"}
                      </span>
                    </button>

                    <ComplementActionButtons
                      group={group}
                      onDuplicate={onDuplicate}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      isDuplicating={duplicatingGroupId === group.id}
                    />
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

