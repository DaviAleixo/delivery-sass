import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, X, ChevronDown, Check, Plus, Minus, Search, Sparkles } from 'lucide-react';

export default function PizzaBuilderModal({
  isOpen,
  onClose,
  initialProduct,
  allCategoryProducts = [],
  category,
  complementGroups = [],
  allComplementGroups = [],
  allComplementItems = [],
  productComplementGroups = [],
  pricingRule = 'highest_price', // 'highest_price' ou 'average'
  onAddToCart,
  isVisualOnly = false,
}) {
  if (!isOpen || !category) return null;

  // Unifica referências de complementos (suporte a prop antiga e nova)
  const rawGroups = useMemo(() => {
    if (allComplementGroups && allComplementGroups.length > 0) return allComplementGroups;
    return complementGroups || [];
  }, [allComplementGroups, complementGroups]);

  const rawItems = allComplementItems || [];
  const rawLinks = productComplementGroups || [];

  // Tamanhos disponíveis da categoria
  const sizes = useMemo(() => {
    if (Array.isArray(category.pizza_sizes) && category.pizza_sizes.length > 0) {
      return category.pizza_sizes;
    }
    return [
      { id: "broto", name: "Broto (4 fatias)", slices: 4, max_flavors: 1 },
      { id: "media", name: "Média (6 fatias)", slices: 6, max_flavors: 2 },
      { id: "grande", name: "Grande (8 fatias)", slices: 8, max_flavors: 2 },
      { id: "familia", name: "Família (12 fatias)", slices: 12, max_flavors: 3 },
    ];
  }, [category]);

  // Tamanho selecionado (padrão 'grande' se existir, ou o primeiro)
  const [selectedSize, setSelectedSize] = useState(() => {
    return sizes.find(s => s.id === "grande" || s.name.toLowerCase().includes("grande")) || sizes[0];
  });

  // Quantidade de sabores desejada (1, 2 ou 3)
  const [flavorCount, setFlavorCount] = useState(2);

  // Sabores selecionados: array de objetos { product, additionals: {} }
  const [selectedFlavors, setSelectedFlavors] = useState([]);

  // Estado para controlar qual metade está com a sanfona de adicionais aberta
  const [expandedSlotIndex, setExpandedSlotIndex] = useState(null);

  // Observações gerais da pizza (ex: "sem cebola, pouco queijo...")
  const [observations, setObservations] = useState("");

  // Sabores disponíveis na categoria (produtos da mesma categoria de pizza)
  const availableFlavors = useMemo(() => {
    const list = allCategoryProducts.filter(p => p.available !== false);
    if (list.length > 0) return list;
    return initialProduct ? [initialProduct] : [];
  }, [allCategoryProducts, initialProduct]);

  // Modal para escolher o sabor de uma fatia específica
  const [pickingSlotIndex, setPickingSlotIndex] = useState(null);
  const [flavorSearch, setFlavorSearch] = useState("");

  // Complementos Globais da Pizza Toda (Bordas Recheadas, Tipo de Massa)
  const [selectedComplements, setSelectedComplements] = useState({});

  // Quantidade total de pizzas
  const [quantity, setQuantity] = useState(1);

  // =========================================================================
  // CLASSIFICAÇÃO DOS COMPLEMENTOS (OPÇÃO A: GLOBAIS VS ESPECÍFICOS DE METADE)
  // =========================================================================

  // 1. Grupos Globais da Pizza (Pizza Toda: Bordas, Massas, Bebidas)
  const globalGroups = useMemo(() => {
    if (!rawGroups || rawGroups.length === 0) return [];

    const pizzaProductIds = new Set(allCategoryProducts.map(p => p.id));
    if (initialProduct?.id) pizzaProductIds.add(initialProduct.id);

    const linkedGroupIds = new Set(
      rawLinks
        .filter(pcg => pizzaProductIds.has(pcg.product_id))
        .map(pcg => pcg.group_id)
    );

    return rawGroups
      .filter(g => g.active !== false)
      .filter(g => {
        // 1. Prioridade absoluta para a flag is_pizza_crust (Borda / Pizza Inteira)
        if (g.is_pizza_crust === true || g.is_pizza_crust === "true") return true;

        const nameLower = (g.name || "").toLowerCase();
        const isGlobalKeyword = /borda|crust|massa|corte|bebida|refrigerante/i.test(nameLower);
        const isLinkedToPizza = linkedGroupIds.has(g.id);
        const isFlavorAdditionalsKeyword = /adicionais|adicional|extras|extra|ingredientes|turbine/i.test(nameLower);

        if (isGlobalKeyword) return true;
        if (isLinkedToPizza && !isFlavorAdditionalsKeyword) return true;
        if (Array.isArray(g.items) && g.items.length > 0 && isGlobalKeyword) return true;
        return false;
      })
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map(g => {
        const items = Array.isArray(g.items) && g.items.length > 0
          ? g.items
          : rawItems.filter(i => i.group_id === g.id && i.active !== false);
        return {
          ...g,
          items: items.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        };
      })
      .filter(g => g.items.length > 0);
  }, [rawGroups, rawItems, rawLinks, allCategoryProducts, initialProduct]);

  // 2. Helper: Grupos de Adicionais específicos de um sabor (Metade)
  const getAdditionalsForFlavor = (product) => {
    if (!product || !rawGroups || rawGroups.length === 0) return [];

    const linkedGroupIds = new Set(
      rawLinks
        .filter(pcg => pcg.product_id === product.id)
        .map(pcg => pcg.group_id)
    );

    const pizzaProductIds = new Set(allCategoryProducts.map(p => p.id));
    const anyPizzaLinkedGroupIds = new Set(
      rawLinks
        .filter(pcg => pizzaProductIds.has(pcg.product_id))
        .map(pcg => pcg.group_id)
    );

    return rawGroups
      .filter(g => g.active !== false)
      .filter(g => {
        // Se for marcado com a flag is_pizza_crust, pertence à pizza toda, NUNCA à metade!
        if (g.is_pizza_crust === true || g.is_pizza_crust === "true") return false;

        const nameLower = (g.name || "").toLowerCase();
        if (/borda|crust|massa|corte/i.test(nameLower)) return false; // Fallback para bordas sem flag

        const isLinkedToThisProduct = linkedGroupIds.has(g.id);
        const isAdditionalsKeyword = /adicionais|adicional|extras|extra|ingredientes|turbine/i.test(nameLower);
        const isLinkedToAnyPizza = anyPizzaLinkedGroupIds.has(g.id);

        return isLinkedToThisProduct || (isAdditionalsKeyword && isLinkedToAnyPizza);
      })
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map(g => {
        const items = Array.isArray(g.items) && g.items.length > 0
          ? g.items
          : rawItems.filter(i => i.group_id === g.id && i.active !== false);
        return {
          ...g,
          items: items.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        };
      })
      .filter(g => g.items.length > 0);
  };

  // Inicialização ao abrir
  useEffect(() => {
    if (isOpen) {
      const initialSize = sizes.find(s => s.id === "grande" || s.name.toLowerCase().includes("grande")) || sizes[0];
      setSelectedSize(initialSize);
      
      const maxF = initialSize.max_flavors || 2;
      const initialCount = Math.min(2, maxF);
      setFlavorCount(initialCount);

      const firstFlavor = initialProduct || availableFlavors[0] || null;
      const initialSlots = [];
      for (let i = 0; i < initialCount; i++) {
        initialSlots.push({
          product: firstFlavor,
          additionals: {},
        });
      }
      setSelectedFlavors(initialSlots);
      setQuantity(1);
      setSelectedComplements({});
      setPickingSlotIndex(null);
      setExpandedSlotIndex(null);
      setObservations("");
      setFlavorSearch("");
    }
  }, [isOpen, initialProduct, category, sizes]);

  // Ajusta a quantidade de fatias quando o tamanho mudar
  const handleSelectSize = (size) => {
    setSelectedSize(size);
    const maxF = size.max_flavors || 1;
    let newCount = flavorCount;
    if (flavorCount > maxF) {
      newCount = maxF;
      setFlavorCount(maxF);
    }

    setSelectedFlavors(prev => {
      const copy = [...prev];
      while (copy.length < newCount) {
        copy.push({ product: availableFlavors[0] || null, additionals: {} });
      }
      return copy.slice(0, newCount);
    });
  };

  const handleSelectFlavorCount = (count) => {
    setFlavorCount(count);
    setSelectedFlavors(prev => {
      const copy = [...prev];
      while (copy.length < count) {
        copy.push({ product: availableFlavors[0] || null, additionals: {} });
      }
      return copy.slice(0, count);
    });
  };

  // Preço de um sabor no tamanho selecionado
  const getFlavorPriceForSize = (product, size) => {
    if (!product) return 0;
    if (product.pizza_prices && size?.id && product.pizza_prices[size.id] !== undefined) {
      const val = Number(product.pizza_prices[size.id]);
      if (!isNaN(val) && val > 0) return val;
    }
    return Number(product.price) || 0;
  };

  // Preço de referência para exibir no card do tamanho (Step 1)
  const getSizeReferencePrice = (size) => {
    if (!size) return 0;
    if (initialProduct?.pizza_prices?.[size.id]) {
      const val = Number(initialProduct.pizza_prices[size.id]);
      if (!isNaN(val) && val > 0) return val;
    }
    const prices = availableFlavors
      .map(f => getFlavorPriceForSize(f, size))
      .filter(p => p > 0);
    if (prices.length > 0) {
      return Math.min(...prices);
    }
    return Number(initialProduct?.price) || 0;
  };

  // Cálculo do preço base da pizza de acordo com a regra da loja
  const basePizzaPrice = useMemo(() => {
    const validSlots = selectedFlavors.filter(slot => Boolean(slot.product));
    if (validSlots.length === 0) return 0;

    const prices = validSlots.map(slot => getFlavorPriceForSize(slot.product, selectedSize));

    if (pricingRule === 'average') {
      const sum = prices.reduce((acc, p) => acc + p, 0);
      return sum / prices.length;
    }

    // Padrão Brasil: Maior valor das metades
    return Math.max(...prices);
  }, [selectedFlavors, selectedSize, pricingRule]);

  // Total dos complementos globais da pizza (Borda, etc.)
  const globalComplementsTotal = useMemo(() => {
    return Object.values(selectedComplements).reduce((acc, item) => {
      return acc + (Number(item.price || 0) * (item.quantity || 1));
    }, 0);
  }, [selectedComplements]);

  // Total dos adicionais específicos de cada metade
  const slotAdditionalsTotal = useMemo(() => {
    return selectedFlavors.reduce((sum, slot) => {
      if (!slot.additionals) return sum;
      return sum + Object.values(slot.additionals).reduce((acc, item) => {
        return acc + (Number(item.price || 0) * (item.quantity || 1));
      }, 0);
    }, 0);
  }, [selectedFlavors]);

  const unitTotalPrice = basePizzaPrice + globalComplementsTotal + slotAdditionalsTotal;
  const grandTotal = unitTotalPrice * quantity;

  // Troca o sabor de uma fatia
  const handleChooseFlavorForSlot = (product) => {
    if (pickingSlotIndex === null) return;
    setSelectedFlavors(prev => {
      const copy = [...prev];
      copy[pickingSlotIndex] = {
        ...copy[pickingSlotIndex],
        product,
        // Ao trocar de sabor, limpa adicionais anteriores para evitar inconsistência
        additionals: {},
      };
      return copy;
    });
    setPickingSlotIndex(null);
    setFlavorSearch("");
  };

  // Limpa o sabor de uma fatia
  const handleClearSlot = (index) => {
    setSelectedFlavors(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], product: null, additionals: {} };
      return copy;
    });
    if (expandedSlotIndex === index) setExpandedSlotIndex(null);
  };

  // Marca/desmarca complemento global (Bordas, etc.)
  const handleToggleGlobalComplement = (item, group) => {
    const isSingle = group.min_quantity === 1 && group.max_quantity === 1;
    setSelectedComplements(prev => {
      const next = { ...prev };
      if (isSingle) {
        Object.keys(next).forEach(k => {
          if (next[k].group_id === group.id) delete next[k];
        });
      }

      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = {
          id: item.id,
          group_id: group.id,
          group_name: group.name,
          name: item.name,
          price: Number(item.price || 0),
          quantity: 1,
        };
      }
      return next;
    });
  };

  // Marca/desmarca adicional específico de UMA metade
  const handleToggleSlotAdditional = (slotIndex, item, group) => {
    setSelectedFlavors(prev => {
      const copy = [...prev];
      const slot = { ...copy[slotIndex] };
      const currentAdds = { ...(slot.additionals || {}) };

      const isSingle = group.min_quantity === 1 && group.max_quantity === 1;
      if (isSingle) {
        Object.keys(currentAdds).forEach(k => {
          if (currentAdds[k].group_id === group.id) delete currentAdds[k];
        });
      }

      if (currentAdds[item.id]) {
        delete currentAdds[item.id];
      } else {
        currentAdds[item.id] = {
          id: item.id,
          group_id: group.id,
          group_name: group.name,
          name: item.name,
          price: Number(item.price || 0),
          quantity: 1,
        };
      }

      slot.additionals = currentAdds;
      copy[slotIndex] = slot;
      return copy;
    });
  };

  const canAddToCart = selectedFlavors.length > 0 && selectedFlavors.every(slot => Boolean(slot.product));

  const handleAddPizzaToCart = () => {
    if (!canAddToCart) {
      const emptyIdx = selectedFlavors.findIndex(slot => !slot.product);
      if (emptyIdx !== -1) {
        setPickingSlotIndex(emptyIdx);
      }
      return;
    }

    const fractionLabels = {
      1: ["Inteira"],
      2: ["1/2", "1/2"],
      3: ["1/3", "1/3", "1/3"],
      4: ["1/4", "1/4", "1/4", "1/4"],
    };

    const fractions = fractionLabels[flavorCount] || [];

    // Sabores estruturados para exibição fracionada e comanda térmica
    const pizzaFlavorsList = selectedFlavors.map((slot, idx) => ({
      name: slot.product?.name || "Sabor",
      fraction: fractions[idx] || "1/2",
      notes: "",
      unit_price: getFlavorPriceForSize(slot.product, selectedSize),
      additionals: Object.values(slot.additionals || {}).map(a => ({
        id: a.id,
        name: a.name,
        price: a.price,
        quantity: a.quantity || 1,
        group_name: a.group_name
      }))
    }));

    // Adicionais globais (Bordas) + Adicionais por metade combinados para o cálculo padrão do carrinho
    const globalAdds = Object.values(selectedComplements).map(c => ({
      id: c.id,
      name: c.name,
      price: c.price,
      quantity: 1,
      group_name: c.group_name,
    }));

    const slotAdds = [];
    selectedFlavors.forEach((slot, idx) => {
      if (slot.additionals) {
        Object.values(slot.additionals).forEach(a => {
          slotAdds.push({
            id: `${a.id}-slot-${idx}`,
            name: `${a.name} (${fractions[idx] || 'Metade'})`,
            price: a.price,
            quantity: 1,
            group_name: a.group_name,
          });
        });
      }
    });

    const combinedAdditionalsList = [...globalAdds, ...slotAdds];

    const titleParts = selectedFlavors.map((slot, idx) => `${fractions[idx] || ''} ${slot.product?.name || ''}`).filter(Boolean);
    const cleanSizeName = selectedSize.name.replace(/\(.*?\)/g, '').trim();
    const pizzaDisplayName = `Pizza ${cleanSizeName} (${titleParts.join(' + ')})`;

    const customPizzaProduct = {
      id: `pizza-${selectedSize.id}-${Date.now()}`,
      name: pizzaDisplayName,
      price: unitTotalPrice,
      image_url: selectedFlavors[0]?.product?.image_url || initialProduct?.image_url || "",
      category_id: category.id,
      category: category.id,
      is_pizza: true,
      pizza_size: selectedSize,
      pizza_flavors: pizzaFlavorsList,
      notes: observations.trim(),
    };

    onAddToCart(customPizzaProduct, combinedAdditionalsList, quantity, observations.trim());
    onClose();
  };

  // Filtro de busca no modal de seleção de sabor
  const filteredFlavors = useMemo(() => {
    if (!flavorSearch.trim()) return availableFlavors;
    const q = flavorSearch.toLowerCase();
    return availableFlavors.filter(f => 
      f.name?.toLowerCase().includes(q) || 
      f.description?.toLowerCase().includes(q)
    );
  }, [availableFlavors, flavorSearch]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-full max-h-[92vh] overflow-y-auto overflow-x-hidden p-0 rounded-3xl bg-white border-none text-gray-900 shadow-2xl scrollbar-hide flex flex-col gap-0 [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">Montador de Pizza</DialogTitle>

        {/* Top Header Limpo: Botão Voltar, Eyebrow e Botão Fechar (Foto 1) */}
        <div className="p-5 pb-3 bg-white shrink-0">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              MONTADOR DE PIZZA
            </span>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <h2 className="text-2xl sm:text-[26px] font-extrabold text-gray-900 tracking-tight leading-tight">
            Monte sua pizza
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Escolha o tamanho, divida os sabores e monte do seu jeito.
          </p>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-5 pt-1 space-y-6 flex-1">
          
          {/* Passo 1: Escolha o tamanho */}
          <div>
            <h3 className="font-bold text-sm sm:text-base text-gray-900 mb-3">
              1. Escolha o tamanho
            </h3>

            {/* Grid / Carrossel Horizontal de Tamanhos */}
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide sm:grid sm:grid-cols-4">
              {sizes.map((s) => {
                const isSelected = selectedSize.id === s.id;
                const cleanName = s.name.replace(/\(.*?\)/g, '').trim();
                const refPrice = getSizeReferencePrice(s);

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectSize(s)}
                    className={`p-3 rounded-2xl text-left transition-all cursor-pointer relative flex-1 min-w-[105px] sm:min-w-0 flex flex-col justify-between ${
                      isSelected 
                        ? "border-2 border-[#047857] bg-[#047857]/[0.03] shadow-xs" 
                        : "border border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <p className="font-bold text-sm text-gray-900 leading-tight">
                        {cleanName}
                      </p>
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full border-2 border-[#047857] flex items-center justify-center bg-white shrink-0 ml-1">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#047857]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 bg-white shrink-0 ml-1" />
                      )}
                    </div>

                    <div className="mt-2.5">
                      <p className="text-[11px] text-gray-500 leading-tight">
                        {s.slices} fatias
                      </p>
                      <p className="text-[11px] text-gray-500 leading-tight mt-0.5">
                        Até {s.max_flavors || 1} sabor{s.max_flavors > 1 ? 'es' : ''}
                      </p>
                      <p className="font-bold text-sm text-gray-900 mt-2">
                        R$ {refPrice.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Passo 2: Divisão de sabores */}
          {(selectedSize.max_flavors || 1) > 1 && (
            <div>
              <h3 className="font-bold text-sm sm:text-base text-gray-900 mb-3">
                2. Divisão de sabores
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSelectFlavorCount(1)}
                  className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm text-center transition-all cursor-pointer ${
                    flavorCount === 1 
                      ? "bg-[#047857] text-white shadow-xs" 
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  1 Sabor (Pizza inteira)
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectFlavorCount(2)}
                  className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm text-center transition-all cursor-pointer ${
                    flavorCount === 2 
                      ? "bg-[#047857] text-white shadow-xs" 
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  2 Sabores (1/2 e 1/2)
                </button>

                {(selectedSize.max_flavors || 1) >= 3 && (
                  <button
                    type="button"
                    onClick={() => handleSelectFlavorCount(3)}
                    className={`py-3 px-3 rounded-xl font-bold text-xs sm:text-sm text-center transition-all cursor-pointer ${
                      flavorCount === 3 
                        ? "bg-[#047857] text-white shadow-xs" 
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    3 Sabores (1/3 cada)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Passo 3: Escolha os sabores (com Adicionais por Metade) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-gray-900">
                  3. Escolha os sabores
                </h3>
                {flavorCount > 1 && (
                  <span className={`text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    pricingRule === 'average'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}>
                    {pricingRule === 'average' ? '⚖️ Média das metades' : '🥇 Cobra maior valor'}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400 font-normal">
                Toque para trocar
              </span>
            </div>

            <div className="space-y-3.5">
              {selectedFlavors.map((slot, idx) => {
                const fractionLabel = flavorCount === 1 ? "100%" : (flavorCount === 2 ? "50%" : "33%");
                const fractionName = flavorCount === 1 ? "PIZZA INTEIRA (100%)" : `${idx + 1}ª METADE (${fractionLabel})`;
                
                // Grupos de adicionais deste sabor
                const flavorAdditionalsGroups = slot.product ? getAdditionalsForFlavor(slot.product) : [];
                const slotAddsArray = slot.additionals ? Object.values(slot.additionals) : [];
                const slotAddsCount = slotAddsArray.length;
                const slotAddsTotal = slotAddsArray.reduce((acc, a) => acc + (Number(a.price || 0) * (a.quantity || 1)), 0);
                const isExpanded = expandedSlotIndex === idx;

                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        {fractionName}
                      </span>
                      {slot.product && (
                        <button
                          type="button"
                          onClick={() => handleClearSlot(idx)}
                          className="text-xs font-semibold text-[#047857] hover:text-[#03543d] transition-colors cursor-pointer"
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    <div className="w-full border border-gray-200 rounded-2xl bg-white shadow-2xs overflow-hidden transition-all">
                      {/* Card do Sabor */}
                      <div
                        onClick={() => setPickingSlotIndex(idx)}
                        className="p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {slot.product?.image_url ? (
                            <img
                              src={slot.product.image_url}
                              alt={slot.product.name}
                              className="w-12 h-12 rounded-full object-cover shrink-0 border border-gray-100 shadow-2xs"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#047857] flex items-center justify-center font-bold text-lg shrink-0 border border-emerald-100">
                              🍕
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-gray-900 truncate">
                              {slot.product?.name || "Toque para escolher o sabor"}
                            </h4>
                            <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                              {slot.product?.description || "Selecione o sabor desta fração..."}
                            </p>
                          </div>
                        </div>

                        <ChevronDown className="w-5 h-5 text-gray-400 shrink-0 ml-2" />
                      </div>

                      {/* Seletor de Adicionais da Metade (Padrão iFood / Opção A) */}
                      {slot.product && flavorAdditionalsGroups.length > 0 && (
                        <div className="border-t border-gray-100 bg-gray-50/40 p-3 pt-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedSlotIndex(isExpanded ? null : idx);
                            }}
                            className="w-full flex items-center justify-between text-left cursor-pointer group"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Sparkles className="w-3.5 h-3.5 text-[#047857] shrink-0" />
                              <span className="text-xs font-bold text-gray-800 truncate">
                                {slotAddsCount > 0 ? (
                                  <span className="text-[#047857]">
                                    ✓ {slotAddsCount} adicional{slotAddsCount > 1 ? 'is' : ''} nesta metade (+ R$ {slotAddsTotal.toFixed(2).replace('.', ',')})
                                  </span>
                                ) : (
                                  <span>+ Adicionais para esta metade (ex: Bacon, Queijo...)</span>
                                )}
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-[#047857] shrink-0 ml-2 group-hover:underline">
                              {isExpanded ? "Ocultar" : "Personalizar"}
                            </span>
                          </button>

                          {/* Lista expansível de adicionais deste sabor */}
                          {isExpanded && (
                            <div className="mt-3 space-y-3 pt-2 border-t border-gray-200/60">
                              {flavorAdditionalsGroups.map((group) => (
                                <div key={group.id} className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                                      {group.name}
                                    </p>
                                    <span className="text-[10px] text-gray-400">
                                      Até {group.max_quantity || 5}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {(group.items || []).map((item) => {
                                      const isItemChecked = Boolean(slot.additionals && slot.additionals[item.id]);

                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() => handleToggleSlotAdditional(idx, item, group)}
                                          className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                            isItemChecked
                                              ? "border-[#047857] bg-white ring-1 ring-[#047857] shadow-2xs"
                                              : "border-gray-200 hover:border-gray-300 bg-white"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0 pr-1">
                                            <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center shrink-0 ${
                                              isItemChecked ? "border-[#047857] bg-[#047857] text-white" : "border-gray-300"
                                            }`}>
                                              {isItemChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                            </div>
                                            <span className="text-xs font-medium text-gray-800 truncate">
                                              {item.name}
                                            </span>
                                          </div>
                                          <span className="text-[11px] font-bold text-gray-700 shrink-0">
                                            + R$ {Number(item.price || 0).toFixed(2).replace('.', ',')}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Passo 4: Observações (opcional) - Foto 1 */}
          <div>
            <h3 className="font-bold text-sm sm:text-base text-gray-900 mb-2">
              4. Observações <span className="text-gray-400 font-normal">(opcional)</span>
            </h3>
            <div className="relative">
              <textarea
                value={observations}
                maxLength={200}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Ex.: sem cebola, pouco queijo, bem assada..."
                rows={3}
                className="w-full p-3.5 rounded-2xl border border-gray-200 text-xs sm:text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] resize-none bg-white transition-all shadow-2xs"
              />
              <div className="text-right text-[11px] text-gray-400 mt-1">
                {observations.length}/200
              </div>
            </div>
          </div>

          {/* Passo 5: Complementos Globais da Pizza (Bordas Recheadas, etc. - Pizza Toda) */}
          {globalGroups && globalGroups.length > 0 && (
            <div className="space-y-3 pt-1">
              <h3 className="font-bold text-sm sm:text-base text-gray-900">
                5. Borda Recheada & Opcionais da Pizza
              </h3>

              {globalGroups.map((group) => (
                <div key={group.id} className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-2xs">
                  <div className="p-3 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between">
                    <h4 className="font-bold text-xs sm:text-sm text-gray-900">{group.name}</h4>
                    <span className="text-[11px] text-gray-500">Escolha até {group.max_quantity || 1}</span>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {(group.items || []).map((item) => {
                      const isSelected = Boolean(selectedComplements[item.id]);
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleGlobalComplement(item, group)}
                          className="p-3 flex items-center justify-between hover:bg-gray-50/50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected ? "border-[#047857] bg-[#047857] text-white" : "border-gray-300 bg-white"
                            }`}>
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                            <span className="font-medium text-xs sm:text-sm text-gray-900">{item.name}</span>
                          </div>
                          <span className="text-xs font-bold text-gray-700">
                            + R$ {Number(item.price || 0).toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Barra Fixa Inferior: Stepper e Adicionar ao Pedido */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 pt-3 z-30">
          <div className="flex items-center gap-3">
            {/* Stepper de Quantidade */}
            {!isVisualOnly && (
              <div className="flex items-center justify-between border border-gray-200 rounded-xl px-2 h-12 bg-white shrink-0 w-24 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-7 h-full flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="font-bold text-sm text-gray-950">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-7 h-full flex items-center justify-center text-[#047857] hover:text-[#03543d] transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            )}

            {/* Botão de Adicionar ao Pedido */}
            <button
              type="button"
              disabled={!canAddToCart}
              onClick={handleAddPizzaToCart}
              className={`flex-1 bg-[#047857] hover:bg-[#03543d] text-white h-12 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between px-5 sm:px-6 shadow-sm transition-all active:scale-[0.99] cursor-pointer ${
                !canAddToCart ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <span>Adicionar ao Pedido</span>
              <span className="font-bold text-white tracking-wide">
                | R$ {grandTotal.toFixed(2).replace('.', ',')}
              </span>
            </button>
          </div>
        </div>

        {/* Sub-Modal / Drawer para Seleção do Sabor */}
        <Dialog open={pickingSlotIndex !== null} onOpenChange={(open) => !open && setPickingSlotIndex(null)}>
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto p-4 sm:p-5 rounded-3xl bg-white [&>button:last-child]:hidden">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {pickingSlotIndex !== null 
                    ? (flavorCount === 1 ? "Escolha o sabor da pizza" : `Escolha a ${pickingSlotIndex + 1}ª Metade`) 
                    : "Escolha o sabor"}
                </h3>
                <p className="text-xs text-gray-500">
                  Tamanho: <span className="font-semibold text-gray-700">{selectedSize.name.replace(/\(.*?\)/g, '').trim()}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickingSlotIndex(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Campo de Busca de Sabores */}
            <div className="relative mt-3 mb-2">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={flavorSearch}
                onChange={(e) => setFlavorSearch(e.target.value)}
                placeholder="Buscar sabor (ex: Calabresa, Frango...)"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#047857]"
              />
            </div>

            {/* Lista de Sabores */}
            <div className="divide-y divide-gray-100 max-h-[55vh] overflow-y-auto mt-1">
              {filteredFlavors.map((p) => {
                const priceForSize = getFlavorPriceForSize(p, selectedSize);
                const isCurrent = pickingSlotIndex !== null && selectedFlavors[pickingSlotIndex]?.product?.id === p.id;

                return (
                  <div
                    key={p.id}
                    onClick={() => handleChooseFlavorForSlot(p)}
                    className={`p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer rounded-2xl transition-colors ${
                      isCurrent ? "bg-[#047857]/[0.06] border border-[#047857]/20" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded-full object-cover shrink-0 border border-gray-100 shadow-2xs" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#047857] flex items-center justify-center text-xl shrink-0 border border-emerald-100">
                          🍕
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-gray-900 truncate">{p.name}</h4>
                        {p.description && (
                          <p className="text-xs text-gray-500 line-clamp-1">{p.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <span className="font-bold text-xs sm:text-sm text-gray-900 block">
                        R$ {priceForSize.toFixed(2).replace('.', ',')}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] text-[#047857] font-bold">Selecionado</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
