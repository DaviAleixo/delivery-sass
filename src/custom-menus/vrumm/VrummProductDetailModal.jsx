import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Minus, Check, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { formatBRLValue } from '@/utils/pizzaPricing';

export default function VrummProductDetailModal({ 
  product, 
  complementGroups = [], 
  additionals = [], 
  isOpen, 
  onClose, 
  onAddToCart,
  isVisualOnly = false
}) {
  const [quantity, setQuantity] = useState(1);
  const [selectedComplements, setSelectedComplements] = useState({});
  const [notes, setNotes] = useState("");
  const [imageError, setImageError] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setNotes("");
      setImageError(false);
      const initial = {};

      if (complementGroups && complementGroups.length > 0) {
        complementGroups.forEach(grp => {
          if (grp.min_quantity === 1 && grp.max_quantity === 1 && grp.items && grp.items.length > 0) {
            const firstItem = grp.items[0];
            initial[firstItem.id] = {
              id: firstItem.id,
              group_id: grp.id,
              group_name: grp.name,
              name: firstItem.name,
              price: Number(firstItem.price) || 0,
              quantity: 1,
            };
          }
        });
      }

      setSelectedComplements(initial);
    }
  }, [isOpen, product, complementGroups]);

  if (!product) return null;

  const hasValidImage = Boolean(product.image_url && !imageError);

  const getGroupSelectedCount = (groupId) => {
    return Object.values(selectedComplements)
      .filter(c => c.group_id === groupId)
      .reduce((sum, c) => sum + (c.quantity || 1), 0);
  };

  const handleSingleSelect = (group, item) => {
    const next = { ...selectedComplements };
    Object.keys(next).forEach(key => {
      if (next[key].group_id === group.id) {
        delete next[key];
      }
    });

    next[item.id] = {
      id: item.id,
      group_id: group.id,
      group_name: group.name,
      name: item.name,
      price: Number(item.price) || 0,
      quantity: 1,
    };

    setSelectedComplements(next);
  };

  const handleItemQtyChange = (group, item, delta) => {
    const current = selectedComplements[item.id];
    const currentQty = current ? current.quantity : 0;
    const newQty = currentQty + delta;
    const currentGroupTotal = getGroupSelectedCount(group.id);

    if (delta > 0 && currentGroupTotal >= group.max_quantity) return;
    if (delta > 0 && item.max_quantity && currentQty >= item.max_quantity) return;

    const next = { ...selectedComplements };

    if (newQty <= 0) {
      delete next[item.id];
    } else {
      next[item.id] = {
        id: item.id,
        group_id: group.id,
        group_name: group.name,
        name: item.name,
        price: Number(item.price) || 0,
        quantity: newQty,
      };
    }

    setSelectedComplements(next);
  };

  const handleLegacyAdditionalToggle = (additional, isChecked) => {
    const next = { ...selectedComplements };
    if (isChecked) {
      next[additional.id] = {
        id: additional.id,
        name: additional.name,
        price: Number(additional.price) || 0,
        quantity: 1,
        isLegacy: true,
      };
    } else {
      delete next[additional.id];
    }
    setSelectedComplements(next);
  };

  const calculateTotal = () => {
    const basePrice = Number(product.price) || 0;
    const complementsTotal = Object.values(selectedComplements).reduce((sum, item) => {
      return sum + (item.price * (item.quantity || 1));
    }, 0);
    return (basePrice + complementsTotal) * quantity;
  };

  const validateRequirements = () => {
    if (!complementGroups || complementGroups.length === 0) return { isValid: true };

    for (const group of complementGroups) {
      const count = getGroupSelectedCount(group.id);
      if (group.min_quantity > 0 && count < group.min_quantity) {
        return {
          isValid: false,
          missingGroup: group.name,
          minRequired: group.min_quantity,
          current: count,
        };
      }
    }

    return { isValid: true };
  };

  const validation = validateRequirements();

  const handleAddToCart = () => {
    if (!validation.isValid) return;

    const additionalsList = Object.values(selectedComplements).map(item => ({
      id: item.id,
      name: item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name,
      price: item.price * (item.quantity || 1),
      unit_price: item.price,
      group_name: item.group_name,
      quantity: item.quantity,
    }));

    onAddToCart(product, additionalsList, quantity, notes.trim());
    onClose();
  };

  const hasGroups = complementGroups && complementGroups.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 rounded-3xl bg-white border-stone-200 text-stone-900 shadow-2xl scrollbar-hide">
        {hasValidImage ? (
          <div className="relative w-full h-56 sm:h-64 bg-stone-100 overflow-hidden">
            <img 
              src={product.image_url} 
              alt={product.name} 
              onError={() => setImageError(true)}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 sm:bottom-5 sm:left-5 sm:right-5">
              <div className="bg-white/95 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl border border-stone-200/80 shadow-md">
                <h3 
                  className="text-base sm:text-xl font-bold text-stone-900 leading-tight"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {product.name}
                </h3>
                <p className="text-sm sm:text-base font-extrabold text-stone-950 mt-0.5">
                  {formatBRLValue(product.price || 0)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <DialogHeader className="p-4 sm:p-6 pb-3 border-b border-stone-100 bg-stone-50/70">
            <DialogTitle 
              className="text-lg sm:text-xl font-bold text-stone-900"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {product.name}
            </DialogTitle>
            <p className="text-sm sm:text-base font-extrabold text-stone-950 mt-1">
              {formatBRLValue(product.price || 0)}
            </p>
          </DialogHeader>
        )}

        <div className="p-4 sm:p-6 space-y-4">
          {product.description && (
            <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 text-xs sm:text-sm text-stone-600 leading-relaxed font-normal">
              {product.description}
            </div>
          )}

          {hasGroups ? (
            <div className="space-y-4">
              {complementGroups.map((group) => {
                const isRequired = group.min_quantity > 0;
                const isSingleChoice = group.min_quantity === 1 && group.max_quantity === 1;
                const selectedCount = getGroupSelectedCount(group.id);
                const isGroupSatisfied = selectedCount >= group.min_quantity;

                return (
                  <div 
                    key={group.id} 
                    className="rounded-2xl border border-stone-200/80 overflow-hidden bg-white shadow-xs"
                  >
                    <div className="p-3.5 sm:p-4 bg-stone-50 border-b border-stone-200/80 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-stone-900 text-xs sm:text-sm leading-tight tracking-tight">
                            {group.name}
                          </h4>
                          {isRequired ? (
                            <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md">
                              OBRIGATÓRIO
                            </span>
                          ) : (
                            <span className="bg-stone-100 border border-stone-200 text-stone-600 font-medium text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md">
                              OPCIONAL
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-500 mt-1 leading-tight font-normal">
                          {group.description || (
                            isSingleChoice 
                              ? "Escolha 1 opção" 
                              : isRequired 
                                ? `Escolha de ${group.min_quantity} a ${group.max_quantity} opções`
                                : `Escolha até ${group.max_quantity} opções`
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-bold shrink-0">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] ${isGroupSatisfied ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                          {selectedCount}/{group.max_quantity}
                        </span>
                        {isGroupSatisfied && <Check className="w-3.5 h-3.5 text-emerald-700 stroke-[3]" />}
                      </div>
                    </div>

                    <div className="divide-y divide-stone-100">
                      {group.items && group.items.length > 0 ? (
                        group.items.map((item) => {
                          const itemQty = selectedComplements[item.id]?.quantity || 0;
                          const isSelected = itemQty > 0;
                          const isMaxGroupReached = selectedCount >= group.max_quantity;
                          const isMaxItemReached = itemQty >= (item.max_quantity || 1);

                          if (isSingleChoice) {
                            return (
                              <label
                                key={item.id}
                                onClick={() => handleSingleSelect(group, item)}
                                className={`flex items-center justify-between p-3.5 sm:p-4 cursor-pointer transition-colors duration-150 gap-3 ${
                                  isSelected 
                                    ? 'bg-emerald-50/50 text-stone-900' 
                                    : 'hover:bg-stone-50 text-stone-700'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                                    isSelected 
                                      ? 'border-emerald-700 bg-emerald-700 shadow-xs' 
                                      : 'border-stone-300 bg-white'
                                  }`}>
                                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-xs sm:text-sm font-semibold leading-tight ${isSelected ? 'text-stone-900' : 'text-stone-700'}`}>
                                      {item.name}
                                    </p>
                                    {item.description && (
                                      <p className="text-[11px] text-stone-500 mt-0.5 leading-tight line-clamp-2">
                                        {item.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <span className={`text-xs sm:text-sm font-bold shrink-0 whitespace-nowrap pl-1 ${
                                  item.price > 0 ? 'text-stone-900' : 'text-emerald-700'
                                }`}>
                                  {item.price > 0 ? `+ ${formatBRLValue(item.price)}` : 'Grátis'}
                                </span>
                              </label>
                            );
                          }

                          return (
                            <div 
                              key={item.id}
                              className={`flex items-center justify-between p-3.5 sm:p-4 transition-colors gap-3 ${
                                isSelected ? 'bg-emerald-50/40' : 'hover:bg-stone-50'
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-1">
                                <p className={`text-xs sm:text-sm font-semibold leading-tight ${isSelected ? 'text-stone-900' : 'text-stone-700'}`}>
                                  {item.name}
                                </p>
                                {item.description && (
                                  <p className="text-[11px] text-stone-500 mt-0.5 leading-tight line-clamp-2">
                                    {item.description}
                                  </p>
                                )}
                                <p className={`text-xs font-bold mt-0.5 ${item.price > 0 ? 'text-stone-900' : 'text-emerald-700'}`}>
                                  {item.price > 0 ? `+ ${formatBRLValue(item.price)}` : 'Grátis'}
                                </p>
                              </div>

                              {!isVisualOnly && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {itemQty > 0 ? (
                                    <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-xl p-1 shadow-xs">
                                      <motion.button
                                        whileTap={{ scale: 0.85 }}
                                        type="button"
                                        onClick={() => handleItemQtyChange(group, item, -1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 hover:text-red-600 transition-colors cursor-pointer"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </motion.button>
                                      <span className="w-5 text-center font-bold text-xs sm:text-sm text-stone-900">
                                        {itemQty}
                                      </span>
                                      <motion.button
                                        whileTap={{ scale: 0.85 }}
                                        type="button"
                                        disabled={isMaxGroupReached || isMaxItemReached}
                                        onClick={() => handleItemQtyChange(group, item, 1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-30 cursor-pointer"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </motion.button>
                                    </div>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={isMaxGroupReached}
                                      onClick={() => handleItemQtyChange(group, item, 1)}
                                      className="rounded-xl text-[11px] sm:text-xs font-semibold border-stone-200 bg-white text-stone-700 hover:border-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 disabled:opacity-30 h-8 px-3 transition-all cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="p-4 text-xs text-stone-500 italic text-center">Nenhuma opção disponível.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : additionals && additionals.length > 0 ? (
            <div className="space-y-3">
              <h4 className="font-bold text-stone-900 text-xs sm:text-sm">Adicionais</h4>
              <div className="space-y-2">
                {additionals.map(ad => {
                  const isChecked = !!selectedComplements[ad.id];
                  return (
                    <label 
                      key={ad.id}
                      className={`flex items-center justify-between p-3.5 border rounded-2xl cursor-pointer transition-colors gap-2 ${
                        isChecked 
                          ? 'bg-emerald-50/50 border-emerald-300 text-stone-900' 
                          : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleLegacyAdditionalToggle(ad, e.target.checked)}
                          className="w-4 h-4 text-emerald-700 rounded bg-white border-stone-300 shrink-0 accent-emerald-700"
                        />
                        <span className="font-semibold text-xs sm:text-sm truncate">{ad.name}</span>
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-stone-900 shrink-0 whitespace-nowrap">
                        + {formatBRLValue(ad.price || 0)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isVisualOnly && (
            <div>
              <label htmlFor="modal-notes" className="block text-xs font-bold text-stone-700 mb-1.5">
                Alguma observação para o preparo?
              </label>
              <Textarea
                id="modal-notes"
                placeholder="Ex: Ponto da carne, sem cebola, maionese à parte..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none rounded-2xl text-xs sm:text-sm bg-stone-50 border-stone-200 text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:bg-white outline-none"
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-stone-200/80 p-3.5 pb-5 sm:pb-4 sm:p-5 space-y-2.5 shadow-lg z-20">
          {isVisualOnly ? (
            <div className="flex items-center justify-between gap-3 bg-stone-50 border border-stone-200 rounded-2xl p-3.5 sm:p-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 block">Preço</span>
                <span className="text-lg font-bold text-stone-900">
                  {formatBRLValue(product.price || 0)}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-xl font-semibold border-stone-200 bg-white text-stone-700 hover:bg-stone-50 h-10 px-5"
              >
                Fechar
              </Button>
            </div>
          ) : (
            <>
              {!validation.isValid && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                  <span>Selecione: <strong>{validation.missingGroup}</strong> para continuar.</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-stone-50 p-1 rounded-2xl border border-stone-200 flex-shrink-0">
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl hover:bg-stone-100 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Minus className="h-4 w-4" />
                  </motion.button>
                  <span className="font-bold text-sm sm:text-base w-7 sm:w-8 text-center text-stone-900">{quantity}</span>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl hover:bg-stone-100 text-stone-600 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </motion.button>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={!validation.isValid}
                  onClick={handleAddToCart}
                  className="flex-1 min-w-0 bg-emerald-700 hover:bg-emerald-800 text-white h-11 sm:h-12 rounded-2xl text-xs sm:text-sm font-bold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between px-4 sm:px-5 gap-2 transition-all cursor-pointer"
                >
                  <span className="truncate">Adicionar ao Pedido</span>
                  <span className="shrink-0 font-bold text-white">
                    {formatBRLValue(calculateTotal())}
                  </span>
                </motion.button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
