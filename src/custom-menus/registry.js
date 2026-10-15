/**
 * ==============================================================================
 * REGISTRO CENTRAL DE TEMPLATES DE CARDÁPIO (MODO A - MULTI-TEMPLATE ENGINE)
 * ==============================================================================
 *
 * Este arquivo é o ponto único de conexão entre os restaurantes VIP do banco de dados
 * e os front-ends personalizados criados para cada cliente.
 *
 * 📖 COMO ADICIONAR UM NOVO CARDÁPIO PERSONALIZADO:
 * 1. Crie uma pasta dentro de `src/custom-menus/<nome-do-template>/`
 *    Exemplo: `src/custom-menus/texas-burger/`
 *
 * 2. Crie seu componente principal, por exemplo `TexasBurgerMenu.jsx`:
 *    Ele recebe as seguintes props padronizadas:
 *    - `tenant`: Objeto completo com dados da empresa (nome, logo, cor, etc.)
 *    - `tenantId`: UUID do restaurante
 *    - `settings`: Configurações de horários, taxa de entrega, etc.
 *    - `products`: Lista de produtos ativos da loja
 *    - `categories`: Lista de categorias ativas
 *    - `banners`: Lista de banners ativos
 *    - `cart`: Estado do carrinho atual
 *    - `storeIsOpen`: Boolean indicando se o restaurante está aberto
 *    - e quaisquer outras funções/estados passados pelo Menu.jsx
 *
 * 3. Importe o componente aqui e adicione no array `AVAILABLE_TEMPLATES`:
 *    ```javascript
 *    import TexasBurgerMenu from "./texas-burger/TexasBurgerMenu";
 *
 *    AVAILABLE_TEMPLATES.push({
 *      id: "texas-burger",
 *      name: "Texas Burger & Grill VIP",
 *      description: "Design exclusivo Dark & Rustic com carrossel dinâmico e modal 3D",
 *      badge: "VIP Exclusivo",
 *      component: TexasBurgerMenu,
 *    });
 *    ```
 *
 * 4. Pronto! No SuperAdmin, basta abrir o restaurante e selecionar "Texas Burger & Grill VIP"
 *    no seletor de templates. O cardápio troca instantaneamente sem afetar nenhuma outra loja!
 */

import React from "react";
import VrummMenu from "./vrumm/VrummMenu";

/**
 * Catálogo de templates registrados no sistema.
 * O template "default" (component: null) indica o layout padrão oficial do sistema.
 */
export const AVAILABLE_TEMPLATES = [
  {
    id: "default",
    name: "Padrão Clean Retail (SaaS)",
    description: "Design moderno, clean e de alta conversão para qualquer nicho de restaurante.",
    badge: "Oficial",
    component: null, // null aciona o Menu.jsx genérico nativo
  },
  {
    id: "vrumm",
    name: "Vrumm Burguer VIP (Dark & Red)",
    description: "Design exclusivo Dark & Red com carrossel dinâmico e paleta escura (#0d0a09) para hamburguerias e pubs.",
    badge: "Exclusivo Vrumm",
    component: VrummMenu,
  },
];

/**
 * Retorna o componente do template customizado associado ao identificador informado.
 * Se o template for nulo, "default", vazio ou não for encontrado no registro, retorna null
 * (sinalizando para o Menu.jsx renderizar o cardápio padrão genérico).
 *
 * @param {string|null|undefined} templateId - O identificador gravado na coluna `custom_template`
 * @returns {React.ComponentType|null} Componente React customizado ou null para fallback
 */
export function getCustomMenuTemplate(templateId) {
  if (!templateId || typeof templateId !== "string") {
    return null;
  }

  const cleanId = templateId.trim().toLowerCase();
  if (cleanId === "" || cleanId === "default" || cleanId === "padrao" || cleanId === "standard") {
    return null;
  }

  const found = AVAILABLE_TEMPLATES.find(
    (t) => t.id.toLowerCase() === cleanId
  );

  return found && found.component ? found.component : null;
}

/**
 * Retorna a lista de todos os templates disponíveis para seleção no SuperAdmin.
 *
 * @returns {Array<{id: string, name: string, description: string, badge: string}>}
 */
export function listAvailableTemplates() {
  return AVAILABLE_TEMPLATES.map(({ id, name, description, badge }) => ({
    id,
    name,
    description,
    badge,
  }));
}
