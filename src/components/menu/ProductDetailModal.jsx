import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Minus, Check, ArrowLeft, ChevronDown, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [expandedGroups, setExpandedGroups] = useState({});
  const [notes, setNotes] = useState("");
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (isOpen && product) {
      setQuantity(1);
      setNotes("");
      setImageError(false);
      const initial = {};
      const expandedState = {};

      if (complementGroups && complementGroups.length > 0) {
        complementGroups.forEach(grp => {
          expandedState[grp.id] = true; // Aberto por padrão
          if (grp.min_quantity === 1 && grp.max_quantity === 1 && grp.items && grp.items.length > 0) {
            let defaultItem = grp.items[0];
            // Se for seletor de tamanho, pré-seleciona a opção de menor preço por padrão
            if (grp.is_size_selector) {
              const sortedByPrice = [...grp.items].sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
              defaultItem = sortedByPrice[0] || grp.items[0];
            }
            initial[defaultItem.id] = {
              id: defaultItem.id,
              group_id: grp.id,
              group_name: grp.name,
              name: defaultItem.name,
              price: Number(defaultItem.price) || 0,
              quantity: 1,
              variation_size_id: defaultItem.variation_size_id || null,
              is_category_variation: Boolean(defaultItem.is_category_variation),
            };
          }
        });
      } else {
        expandedState["legacy"] = true;
      }

      setExpandedGroups(expandedState);
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

  const toggleGroupExpanded = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
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
      variation_size_id: item.variation_size_id || null,
      is_category_variation: Boolean(item.is_category_variation),
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

  const handleToggleItem = (group, item) => {
    const isSingleChoice = group.min_quantity === 1 && group.max_quantity === 1;
    if (isSingleChoice) {
      handleSingleSelect(group, item);
      return;
    }

    const current = selectedComplements[item.id];
    if (current && current.quantity > 0) {
      handleItemQtyChange(group, item, -current.quantity);
    } else {
      handleItemQtyChange(group, item, 1);
    }
  };

  const handleLegacyAdditionalToggle = (ad, checked) => {
    const next = { ...selectedComplements };
    if (checked) {
      next[ad.id] = {
        id: ad.id,
        group_id: "legacy",
        group_name: "Extras opcionais",
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
    // 1. Identificar se algum grupo selecionado é seletor de tamanho (is_size_selector)
    let effectiveBasePrice = Number(product.price || 0);

    if (complementGroups && complementGroups.length > 0) {
      for (const grp of complementGroups) {
        if (grp.is_size_selector) {
          const sizeItem = Object.values(selectedComplements).find(c => c.group_id === grp.id);
          if (sizeItem && Number(sizeItem.price) > 0) {
            effectiveBasePrice = Number(sizeItem.price);
          }
        }
      }
    }

    // 2. Calcular o valor dos complementos respeitando free_quantity por grupo
    let complementsTotal = 0;

    if (complementGroups && complementGroups.length > 0) {
      complementGroups.forEach(grp => {
        if (grp.is_size_selector) return;

        const groupItems = Object.values(selectedComplements).filter(c => c.group_id === grp.id);
        const freeLimit = Number(grp.free_quantity || 0);

        if (freeLimit <= 0) {
          groupItems.forEach(item => {
            complementsTotal += (Number(item.price || 0) * (item.quantity || 1));
          });
        } else {
          const unitPrices = [];
          groupItems.forEach(item => {
            const qty = item.quantity || 1;
            for (let i = 0; i < qty; i++) {
              unitPrices.push(Number(item.price || 0));
            }
          });
          unitPrices.sort((a, b) => a - b);
          const billableUnits = unitPrices.slice(freeLimit);
          billableUnits.forEach(p => {
            complementsTotal += p;
          });
        }
      });
    }

    // Complementos legados (se houver)
    const legacyItems = Object.values(selectedComplements).filter(c => c.group_id === "legacy");
    legacyItems.forEach(item => {
      complementsTotal += (Number(item.price || 0) * (item.quantity || 1));
    });

    return (effectiveBasePrice + complementsTotal) * quantity;
  };

  // Preço unitário base dinâmico (acompanha em tempo real o tamanho selecionado)
  const currentBasePrice = (() => {
    if (complementGroups && complementGroups.length > 0) {
      for (const grp of complementGroups) {
        if (grp.is_size_selector) {
          const sizeItem = Object.values(selectedComplements).find(c => c.group_id === grp.id);
          if (sizeItem && Number(sizeItem.price) > 0) {
            return Number(sizeItem.price);
          }
          if (grp.items && grp.items.length > 0) {
            const validPrices = grp.items.map(i => Number(i.price || 0)).filter(p => p > 0);
            if (validPrices.length > 0) return Math.min(...validPrices);
          }
        }
      }
    }
    return Number(product.price || 0);
  })();

  const handleAddToCart = () => {
    if (!validation.isValid) return;

    let effectiveBasePrice = Number(product.price || 0);
    let selectedVariationSizeId = null;
    const additionalsList = [];

    if (complementGroups && complementGroups.length > 0) {
      complementGroups.forEach(grp => {
        const groupItems = Object.values(selectedComplements).filter(c => c.group_id === grp.id);

        if (grp.is_size_selector) {
          groupItems.forEach(item => {
            if (Number(item.price) > 0) {
              effectiveBasePrice = Number(item.price);
            }
            if (item.variation_size_id) {
              selectedVariationSizeId = item.variation_size_id;
            }
            additionalsList.push({
              id: item.id,
              name: `Tamanho: ${item.name}`,
              price: 0,
              unit_price: 0,
              group_name: grp.name,
              quantity: 1,
              is_size: true
            });
          });
          return;
        }

        const freeLimit = Number(grp.free_quantity || 0);
        if (freeLimit <= 0) {
          groupItems.forEach(item => {
            additionalsList.push({
              id: item.id,
              name: item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name,
              price: Number(item.price || 0) * (item.quantity || 1),
              unit_price: Number(item.price || 0),
              group_name: item.group_name,
              quantity: item.quantity,
            });
          });
        } else {
          const expanded = [];
          groupItems.forEach(item => {
            const qty = item.quantity || 1;
            for (let i = 0; i < qty; i++) {
              expanded.push({ ...item, singlePrice: Number(item.price || 0) });
            }
          });
          expanded.sort((a, b) => a.singlePrice - b.singlePrice);

          let freeRemaining = freeLimit;
          const itemChargedMap = {};

          expanded.forEach(u => {
            if (!itemChargedMap[u.id]) {
              itemChargedMap[u.id] = { item: u, totalCharged: 0, totalQty: 0 };
            }
            itemChargedMap[u.id].totalQty += 1;
            if (freeRemaining > 0) {
              freeRemaining -= 1;
            } else {
              itemChargedMap[u.id].totalCharged += u.singlePrice;
            }
          });

          Object.values(itemChargedMap).forEach(({ item, totalCharged, totalQty }) => {
            additionalsList.push({
              id: item.id,
              name: totalQty > 1 ? `${totalQty}x ${item.name}` : item.name,
              price: totalCharged,
              unit_price: totalQty > 0 ? (totalCharged / totalQty) : 0,
              group_name: item.group_name,
              quantity: totalQty,
            });
          });
        }
      });
    }

    const legacyItems = Object.values(selectedComplements).filter(c => c.group_id === "legacy");
    legacyItems.forEach(item => {
      additionalsList.push({
        id: item.id,
        name: item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name,
        price: Number(item.price || 0) * (item.quantity || 1),
        unit_price: Number(item.price || 0),
        group_name: item.group_name,
        quantity: item.quantity,
      });
    });

    const productToSend = {
      ...product,
      price: effectiveBasePrice,
      ...(selectedVariationSizeId ? { size_id: selectedVariationSizeId } : {}),
    };

    onAddToCart(productToSend, additionalsList, quantity, notes.trim());
    onClose();
  };

  const hasGroups = complementGroups && complementGroups.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto overflow-x-hidden p-0 rounded-3xl bg-white border-none text-gray-900 shadow-2xl scrollbar-hide flex flex-col gap-0">
        <DialogTitle className="sr-only">{product.name}</DialogTitle>

        {/* Topo: Imagem Hero se houver foto, ou Topbar limpa com fundo branco se não houver foto */}
        {hasValidImage ? (
          <div className="relative w-full h-64 sm:h-72 bg-stone-900 overflow-hidden shrink-0">
            <img 
              src={product.image_url} 
              alt={product.name} 
              onError={() => setImageError(true)}
              className="w-full h-full object-cover"
            />

            {/* Botão Voltar Circular à Esquerda */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center backdrop-blur-md transition-all shadow-md z-20 cursor-pointer"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="pt-4 px-5 sm:px-6 flex items-center justify-between bg-white shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center transition-all cursor-pointer shadow-xs"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Card do Conteúdo Sobreposto à Foto com Cantos Arredondados */}
        <div className={`relative z-[2] bg-white px-5 sm:px-6 pb-2 space-y-5 ${hasValidImage ? "-mt-6 rounded-t-[24px] pt-6" : "pt-2"}`}>
          {/* Linha Principal: Título, Preço e Stepper de Quantidade do Produto Inline */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 
                className="text-xl sm:text-2xl font-black text-gray-950 tracking-tight leading-tight"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {product.name}
              </h2>
              <p className="text-lg sm:text-xl font-bold text-gray-900 mt-0.5">
                R$ {currentBasePrice.toFixed(2).replace('.', ',')}
              </p>
            </div>

            {/* Stepper de Quantidade do Produto Inspirado na Foto 2 */}
            {!isVisualOnly && (
              <div className="flex items-center gap-2 border border-gray-200 rounded-full px-2 py-1 bg-white shadow-2xs shrink-0 mt-0.5">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                  aria-label="Diminuir quantidade"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-sm text-gray-950 w-4 text-center">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-7 h-7 rounded-full bg-[#046c4e] hover:bg-[#03543d] text-white flex items-center justify-center shadow-xs transition-transform active:scale-90 cursor-pointer"
                  aria-label="Aumentar quantidade"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            )}
          </div>

          {/* Descrição do Produto em tom suave cinza (não exibe se vazia ou redundante com a categoria) */}
          {product.description && 
           product.description.trim() !== "" && 
           !product.description.toLowerCase().trim().includes("cervejas") && (
            <p className="text-xs sm:text-sm text-gray-400 font-normal leading-relaxed">
              {product.description}
            </p>
          )}

          {/* Grupos de Complementos / Extras Opcionais */}
          {hasGroups ? (
            <div className="space-y-4">
              {complementGroups.map((group) => {
                const isSingleChoice = group.min_quantity === 1 && group.max_quantity === 1;
                const selectedCount = getGroupSelectedCount(group.id);
                const _isGroupSatisfied = selectedCount >= group.min_quantity;
                const isExpanded = expandedGroups[group.id] !== false;

                return (
                  <div 
                    key={group.id} 
                    className="rounded-2xl border border-gray-200/90 overflow-hidden bg-white shadow-2xs"
                  >
                    {/* Cabeçalho do Grupo com Chevron Acordeom */}
                    <div 
                      onClick={() => toggleGroupExpanded(group.id)}
                      className="p-3.5 sm:p-4 flex items-center justify-between cursor-pointer select-none bg-white hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm sm:text-base text-gray-950">
                            {group.name}
                          </h4>
                          {Number(group.free_quantity) > 0 && (
                            <span className="bg-emerald-50 text-[#046c4e] font-bold text-[10px] px-2 py-0.5 rounded-full border border-emerald-200">
                              {selectedCount < group.free_quantity
                                ? `${group.free_quantity - selectedCount} de ${group.free_quantity} grátis`
                                : `✓ Limite de ${group.free_quantity} grátis atingido`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="bg-emerald-50 text-[#046c4e] font-bold text-xs px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                          {selectedCount}/{group.max_quantity}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {/* Lista dos Itens do Grupo */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="divide-y divide-gray-100 border-t border-gray-100 overflow-hidden"
                        >
                          {group.items && group.items.length > 0 ? (
                            group.items.map((item) => {
                              const itemQty = selectedComplements[item.id]?.quantity || 0;
                              const isSelected = itemQty > 0;
                              const isMaxGroupReached = selectedCount >= group.max_quantity;
                              const isMaxItemReached = itemQty >= (item.max_quantity || 1);

                              // Cálculo de unidades gratuitas vs cobradas para grupos com franquia free_quantity
                              let freeUnitsForItem = 0;
                              let chargedUnitsForItem = 0;

                              if (Number(group.free_quantity) > 0 && isSelected) {
                                const groupItems = Object.values(selectedComplements).filter((c) => c.group_id === group.id);
                                const freeLimit = Number(group.free_quantity || 0);

                                const expandedUnits = [];
                                groupItems.forEach((ci) => {
                                  const qty = ci.quantity || 1;
                                  for (let i = 0; i < qty; i++) {
                                    expandedUnits.push({ id: ci.id, price: Number(ci.price || 0) });
                                  }
                                });
                                expandedUnits.sort((a, b) => a.price - b.price);

                                let freeRemaining = freeLimit;
                                expandedUnits.forEach((u) => {
                                  if (freeRemaining > 0) {
                                    freeRemaining -= 1;
                                    if (u.id === item.id) freeUnitsForItem += 1;
                                  } else {
                                    if (u.id === item.id) chargedUnitsForItem += 1;
                                  }
                                });
                              }

                              return (
                                <div 
                                  key={item.id}
                                  className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors ${
                                    isSelected ? 'bg-emerald-50/20' : 'hover:bg-gray-50/60'
                                  }`}
                                >
                                  {/* Lado Esquerdo: Checkbox + Nome + Preço */}
                                  <div 
                                    className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none"
                                    onClick={() => handleToggleItem(group, item)}
                                  >
                                    <div className={`w-5 h-5 transition-all flex items-center justify-center shrink-0 ${
                                      group.is_size_selector || group.max_quantity === 1
                                        ? `rounded-full border-2 ${
                                            isSelected
                                              ? 'border-[#046c4e] bg-white'
                                              : 'border-gray-300 bg-white'
                                          }`
                                        : `rounded-md border-2 ${
                                            isSelected 
                                              ? 'border-[#046c4e] bg-[#046c4e] text-white shadow-2xs' 
                                              : 'border-gray-300 bg-white'
                                          }`
                                    }`}>
                                      {isSelected && (
                                        group.is_size_selector || group.max_quantity === 1 ? (
                                          <div className="w-2.5 h-2.5 rounded-full bg-[#046c4e]" />
                                        ) : (
                                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                                        )
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-xs sm:text-sm text-gray-900 leading-tight">
                                        {item.name}
                                      </p>
                                      <p className="text-xs text-gray-500 font-medium mt-0.5">
                                        {group.is_size_selector ? (
                                          Number(item.price) > 0 ? (
                                            <span className="font-bold text-stone-900">
                                              R$ {Number(item.price || 0).toFixed(2).replace('.', ',')}
                                            </span>
                                          ) : (
                                            <span className="text-emerald-700 font-semibold text-[11px]">Incluso</span>
                                          )
                                        ) : Number(group.free_quantity) > 0 ? (
                                          isSelected ? (
                                            chargedUnitsForItem === 0 ? (
                                              <span className="text-emerald-700 font-bold">Grátis</span>
                                            ) : freeUnitsForItem > 0 ? (
                                              <span>
                                                <span className="text-emerald-700 font-bold">{freeUnitsForItem}x Grátis</span>
                                                <span className="text-stone-700 font-bold ml-1.5">
                                                  + R$ {(chargedUnitsForItem * Number(item.price || 0)).toFixed(2).replace('.', ',')}
                                                </span>
                                              </span>
                                            ) : (
                                              <span className="font-bold text-stone-900">
                                                + R$ {(chargedUnitsForItem * Number(item.price || 0)).toFixed(2).replace('.', ',')}
                                              </span>
                                            )
                                          ) : selectedCount < group.free_quantity ? (
                                            <span className="text-emerald-700 font-bold">Grátis</span>
                                          ) : Number(item.price) > 0 ? (
                                            `+ R$ ${Number(item.price).toFixed(2).replace('.', ',')}`
                                          ) : (
                                            <span className="text-emerald-700 font-semibold">Grátis</span>
                                          )
                                        ) : Number(item.price) > 0 ? (
                                          `+ R$ ${Number(item.price).toFixed(2).replace('.', ',')}`
                                        ) : (
                                          <span className="text-emerald-700 font-semibold">Grátis</span>
                                        )}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Lado Direito: Stepper de Quantidade [-] count [+] */}
                                  {!isSingleChoice && !isVisualOnly && (
                                    <div className="flex items-center gap-2 border border-gray-200 rounded-full px-2 py-0.5 bg-white shrink-0 shadow-2xs">
                                      <button
                                        type="button"
                                        disabled={itemQty === 0}
                                        onClick={() => handleItemQtyChange(group, item, -1)}
                                        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                                      >
                                        <Minus className="w-3 h-3" />
                                      </button>
                                      <span className="font-bold text-xs text-gray-900 w-3 text-center">
                                        {itemQty}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={isMaxGroupReached || isMaxItemReached}
                                        onClick={() => handleItemQtyChange(group, item, 1)}
                                        className="w-5 h-5 flex items-center justify-center text-[#046c4e] hover:text-[#03543d] font-bold disabled:opacity-30 cursor-pointer"
                                      >
                                        <Plus className="w-3 h-3 stroke-[2.5]" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <p className="p-4 text-xs text-gray-400 italic text-center">Nenhuma opção disponível.</p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ) : additionals && additionals.length > 0 ? (
            /* Fallback para Adicionais Legados com a mesma estética */
            <div className="rounded-2xl border border-gray-200/90 overflow-hidden bg-white shadow-2xs">
              <div 
                onClick={() => toggleGroupExpanded("legacy")}
                className="p-3.5 sm:p-4 flex items-center justify-between cursor-pointer select-none bg-white hover:bg-gray-50/50 transition-colors"
              >
                <h4 className="font-bold text-sm sm:text-base text-gray-950">
                  Extras opcionais
                </h4>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-50 text-[#046c4e] font-bold text-xs px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                    {Object.keys(selectedComplements).length}/{additionals.length}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expandedGroups["legacy"] !== false ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {expandedGroups["legacy"] !== false && (
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {additionals.map((ad) => {
                    const isChecked = !!selectedComplements[ad.id];
                    return (
                      <div 
                        key={ad.id}
                        className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 transition-colors ${
                          isChecked ? 'bg-emerald-50/20' : 'hover:bg-gray-50/60'
                        }`}
                      >
                        <div 
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none"
                          onClick={() => handleLegacyAdditionalToggle(ad, !isChecked)}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center shrink-0 ${
                            isChecked 
                              ? 'border-[#046c4e] bg-[#046c4e] text-white shadow-2xs' 
                              : 'border-gray-300 bg-white'
                          }`}>
                            {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs sm:text-sm text-gray-900 leading-tight">
                              {ad.name}
                            </p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">
                              + R$ {Number(ad.price || 0).toFixed(2).replace('.', ',')}
                            </p>
                          </div>
                        </div>

                        {!isVisualOnly && (
                          <div className="flex items-center gap-2 border border-gray-200 rounded-full px-2 py-0.5 bg-white shrink-0 shadow-2xs">
                            <button
                              type="button"
                              disabled={!isChecked}
                              onClick={() => handleLegacyAdditionalToggle(ad, false)}
                              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-bold text-xs text-gray-900 w-3 text-center">
                              {isChecked ? 1 : 0}
                            </span>
                            <button
                              type="button"
                              disabled={isChecked}
                              onClick={() => handleLegacyAdditionalToggle(ad, true)}
                              className="w-5 h-5 flex items-center justify-center text-[#046c4e] hover:text-[#03543d] font-bold disabled:opacity-30 cursor-pointer"
                            >
                              <Plus className="w-3 h-3 stroke-[2.5]" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {/* Campo de Observação para o Preparo */}
          {!isVisualOnly && (
            <div>
              <label htmlFor="modal-notes" className="block text-xs sm:text-sm font-semibold text-gray-900 mb-2">
                Alguma observação para o preparo?
              </label>
              <Textarea
                id="modal-notes"
                placeholder="Ex: Ponto da carne, sem cebola, maionese à parte..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none rounded-2xl text-xs sm:text-sm bg-gray-50/80 border border-gray-200/80 text-gray-900 placeholder:text-gray-400 focus:border-[#046c4e] focus:bg-white focus:ring-1 focus:ring-[#046c4e]/30 outline-none w-full p-3.5 transition-all"
              />
            </div>
          )}
        </div>

        {/* Botão Fixo Inferior de Ação: "Adicionar ao Pedido R$ 40,00" */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-gray-100 p-4 pt-3 z-30">
          {!validation.isValid && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold mb-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
              <span>Selecione: <strong>{validation.missingGroup}</strong> para continuar.</span>
            </div>
          )}

          <button
            type="button"
            disabled={!validation.isValid}
            onClick={handleAddToCart}
            className="w-full bg-[#046c4e] hover:bg-[#03543d] text-white h-12 rounded-2xl text-sm font-bold flex items-center justify-between px-6 shadow-md transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span>Adicionar ao Pedido</span>
            <span className="font-black text-white">
              R$ {calculateTotal().toFixed(2).replace('.', ',')}
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}