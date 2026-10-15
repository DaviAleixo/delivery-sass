import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Minus, Check, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ProductDetailModal({ 
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

  const handleLegacyAdditionalToggle = (ad, checked) => {
    const next = { ...selectedComplements };
    if (checked) {
      next[ad.id] = {
        id: ad.id,
        group_id: "legacy",
        group_name: "Adicionais",
        name: ad.name,
        price: Number(ad.price) || 0,
        quantity: 1,
      };
    } else {
      delete next[ad.id];
    }
    setSelectedComplements(next);
  };

  const validateGroups = () => {
    if (!complementGroups || complementGroups.length === 0) return { isValid: true };

    for (const grp of complementGroups) {
      if (grp.min_quantity > 0) {
        const count = getGroupSelectedCount(grp.id);
        if (count < grp.min_quantity) {
          return {
            isValid: false,
            missingGroup: grp.name,
            minNeeded: grp.min_quantity - count,
          };
        }
      }
    }
    return { isValid: true };
  };

  const validation = validateGroups();

  const calculateTotal = () => {
    const complementsTotal = Object.values(selectedComplements).reduce(
      (sum, item) => sum + (item.price * (item.quantity || 1)),
      0
    );
    return (Number(product.price || 0) + complementsTotal) * quantity;
  };

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
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 rounded-3xl bg-white border-[#E5EAE7] text-[#171717] shadow-2xl scrollbar-hide">
        {hasValidImage ? (
          <div className="relative w-full h-56 sm:h-72 bg-[#F7F9F8] overflow-hidden">
            <img 
              src={product.image_url} 
              alt={product.name} 
              onError={() => setImageError(true)}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6">
              <div className="bg-white/95 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl border border-[#E5EAE7] shadow-lg">
                <h3 
                  className="text-lg sm:text-2xl font-black text-[#171717] leading-tight"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {product.name}
                </h3>
                <p className="text-base sm:text-lg font-black text-[#171717] mt-0.5">
                  R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <DialogHeader className="p-4 sm:p-6 pb-3 border-b border-[#E5EAE7] bg-[#F7F9F8]">
            <DialogTitle 
              className="text-xl sm:text-2xl font-black text-[#171717]"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {product.name}
            </DialogTitle>
            <p className="text-base sm:text-lg font-black text-[#171717] mt-1">
              R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}
            </p>
          </DialogHeader>
        )}

        <div className="p-4 sm:p-6 space-y-5">
          {product.description && (
            <div className="p-3.5 rounded-2xl bg-[#F7F9F8] border border-[#E5EAE7] text-xs sm:text-sm text-stone-600 leading-relaxed font-normal">
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
                    className="rounded-2xl border border-[#E5EAE7] overflow-hidden bg-white shadow-xs"
                  >
                    <div className="p-3.5 sm:p-4 bg-[#F7F9F8] border-b border-[#E5EAE7] flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-extrabold text-[#171717] text-sm sm:text-base leading-tight tracking-tight">
                            {group.name}
                          </h4>
                          {isRequired ? (
                            <span className="bg-amber-100 border border-amber-300 text-amber-900 font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md">
                              OBRIGATÓRIO
                            </span>
                          ) : (
                            <span className="bg-stone-200 border border-stone-300 text-stone-600 font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md">
                              OPCIONAL
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-stone-500 mt-1 leading-tight font-normal">
                          {group.description || (
                            isSingleChoice 
                              ? "Escolha 1 opção" 
                              : isRequired 
                                ? `Escolha de ${group.min_quantity} a ${group.max_quantity} opções`
                                : `Escolha até ${group.max_quantity} opções`
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-black shrink-0">
                        <span className={`px-2 py-0.5 rounded-md ${isGroupSatisfied ? "bg-[#D1E9DF] text-[#047857] border border-[#047857]/20" : "bg-white text-stone-600 border border-[#E5EAE7]"}`}>
                          {selectedCount}/{group.max_quantity}
                        </span>
                        {isGroupSatisfied && <Check className="w-4 h-4 text-[#047857] stroke-[3]" />}
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
                                    ? 'bg-[#D1E9DF]/20 text-[#171717]' 
                                    : 'hover:bg-[#F7F9F8] text-stone-700'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                                    isSelected 
                                      ? 'border-[#047857] bg-[#047857] shadow-xs' 
                                      : 'border-stone-300 bg-white'
                                  }`}>
                                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-xs sm:text-sm font-bold leading-tight ${isSelected ? 'text-[#171717]' : 'text-stone-800'}`}>
                                      {item.name}
                                    </p>
                                    {item.description && (
                                      <p className="text-[11px] text-stone-500 mt-0.5 leading-tight line-clamp-2">
                                        {item.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <span className={`text-xs sm:text-sm font-extrabold shrink-0 whitespace-nowrap pl-1 ${
                                  item.price > 0 ? 'text-[#171717]' : 'text-[#047857]'
                                }`}>
                                  {item.price > 0 ? `+ R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : 'Grátis'}
                                </span>
                              </label>
                            );
                          }

                          return (
                            <div 
                              key={item.id}
                              className={`flex items-center justify-between p-3.5 sm:p-4 transition-colors gap-3 ${
                                isSelected ? 'bg-[#D1E9DF]/20' : 'hover:bg-[#F7F9F8]'
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-1">
                                <p className={`text-xs sm:text-sm font-bold leading-tight ${isSelected ? 'text-[#171717]' : 'text-stone-800'}`}>
                                  {item.name}
                                </p>
                                {item.description && (
                                  <p className="text-[11px] text-stone-500 mt-0.5 leading-tight line-clamp-2">
                                    {item.description}
                                  </p>
                                )}
                                <p className={`text-xs font-black mt-1 ${item.price > 0 ? 'text-[#171717]' : 'text-[#047857]'}`}>
                                  {item.price > 0 ? `+ R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : 'Grátis'}
                                </p>
                              </div>

                              {!isVisualOnly && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {itemQty > 0 ? (
                                    <div className="flex items-center gap-1 bg-white border border-[#E5EAE7] rounded-xl p-1 shadow-xs">
                                      <motion.button
                                        whileTap={{ scale: 0.85 }}
                                        type="button"
                                        onClick={() => handleItemQtyChange(group, item, -1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-600 hover:bg-[#F7F9F8] hover:text-[#171717] transition-colors cursor-pointer"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </motion.button>
                                      <span className="w-5 text-center font-black text-xs sm:text-sm text-[#171717]">
                                        {itemQty}
                                      </span>
                                      <motion.button
                                        whileTap={{ scale: 0.85 }}
                                        type="button"
                                        disabled={isMaxGroupReached || isMaxItemReached}
                                        onClick={() => handleItemQtyChange(group, item, 1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-white bg-[#047857] hover:bg-[#036348] transition-colors disabled:opacity-30 cursor-pointer"
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
                                      className="rounded-xl text-[11px] sm:text-xs font-bold border-[#D1E9DF] bg-[#D1E9DF]/40 text-[#047857] hover:bg-[#D1E9DF] hover:border-[#D1E9DF] disabled:opacity-30 h-8 px-3 transition-all cursor-pointer"
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
              <h4 className="font-bold text-stone-900 text-sm">Adicionais</h4>
              <div className="space-y-2">
                {additionals.map(ad => {
                  const isChecked = !!selectedComplements[ad.id];
                  return (
                    <label 
                      key={ad.id}
                      className={`flex items-center justify-between p-3.5 border rounded-2xl cursor-pointer transition-all gap-2 ${
                        isChecked 
                          ? 'bg-stone-50 border-stone-900 text-stone-900' 
                          : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleLegacyAdditionalToggle(ad, e.target.checked)}
                          className="w-4 h-4 text-stone-900 rounded border-stone-300 shrink-0 accent-stone-900"
                        />
                        <span className="font-semibold text-xs sm:text-sm truncate">{ad.name}</span>
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-stone-900 shrink-0 whitespace-nowrap">
                        + R$ {Number(ad.price || 0).toFixed(2).replace('.', ',')}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isVisualOnly && (
            <div>
              <label htmlFor="modal-notes" className="block text-xs font-black uppercase tracking-wider text-stone-600 mb-1.5">
                Alguma observação para o preparo?
              </label>
              <Textarea
                id="modal-notes"
                placeholder="Ex: Ponto da carne, sem cebola, maionese à parte..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none rounded-2xl text-xs sm:text-sm bg-[#F7F9F8] border-[#E5EAE7] text-[#171717] placeholder:text-stone-400 focus:border-[#047857] focus:ring-2 focus:ring-[#D1E9DF] focus:bg-white outline-none"
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-[#E5EAE7] p-3.5 pb-6 sm:pb-4 sm:p-5 space-y-2.5 shadow-2xl z-20">
          {isVisualOnly ? (
            <div className="flex items-center justify-between gap-3 bg-[#F7F9F8] border border-[#E5EAE7] rounded-2xl p-3.5 sm:p-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">Preço</span>
                <span className="text-xl font-black text-[#171717]">
                  R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-xl font-bold border-[#E5EAE7] bg-white text-[#171717] hover:bg-[#F7F9F8] h-10 px-5 cursor-pointer"
              >
                Fechar
              </Button>
            </div>
          ) : (
            <>
              {!validation.isValid && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                  <span>Selecione: <strong>{validation.missingGroup}</strong> para continuar.</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-[#F7F9F8] p-1 rounded-2xl border border-[#E5EAE7] flex-shrink-0">
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl hover:bg-white text-stone-700 hover:text-[#171717] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Minus className="h-4 w-4" />
                  </motion.button>
                  <span className="font-black text-sm sm:text-base w-7 sm:w-8 text-center text-[#171717]">{quantity}</span>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl hover:bg-white text-stone-700 hover:text-[#171717] flex items-center justify-center transition-colors cursor-pointer"
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
                  className="flex-1 min-w-0 bg-[#047857] hover:bg-[#036348] text-white h-11 sm:h-12 rounded-2xl text-xs sm:text-sm font-black shadow-lg shadow-[#047857]/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between px-4 sm:px-5 gap-2 transition-all cursor-pointer"
                >
                  <span className="truncate">Adicionar ao Pedido</span>
                  <span className="shrink-0 font-black text-emerald-100">
                    R$ {calculateTotal().toFixed(2).replace('.', ',')}
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