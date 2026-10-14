# Multi-Template Architecture & Custom Menus (Modo A) - Design Document

Projeto de arquitetura para a base de cardápios personalizados sob medida no mesmo ecossistema (Modo A: Single Repo Multi-Template Engine).

## Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │              Supabase Database               │
                      │  tenants (id, slug, plan, custom_template)   │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │   TenantContext / Hook    │
                               │  tenant.custom_template   │
                               └─────────────┬─────────────┘
                                             │
                     ┌───────────────────────┴───────────────────────┐
                     │                                               │
             custom_template is NULL                      custom_template = 'texas-vip'
                     │                                               │
                     ▼                                               ▼
     ┌───────────────────────────────┐               ┌───────────────────────────────┐
     │      Menu.jsx (Default)       │               │   src/custom-menus/registry   │
     │ Cardápio Padrão de Alta Conv. │               │   resolve 'texas-vip'         │
     └───────────────────────────────┘               └───────────────┬───────────────┘
                                                                     │
                                                                     ▼
                                                     ┌───────────────────────────────┐
                                                     │ src/custom-menus/texas-vip/   │
                                                     │ Custom VIP Component Rendered │
                                                     └───────────────────────────────┘
```

## 1. Database Layer (Supabase / PostgreSQL)

### 1.1 Tabela `public.tenants`
- Adição da coluna:
  ```sql
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS custom_template TEXT DEFAULT NULL;
  ```
- Comentário explicativo:
  ```sql
  COMMENT ON COLUMN public.tenants.custom_template IS 'Identificador do template de cardápio personalizado (ex: texas-burger, sushi-premium). Se NULL ou default, renderiza o Menu.jsx padrão.';
  ```

### 1.2 RPCs Atualizadas
- `public.get_master_tenants()`:
  - Adiciona `custom_template text` na lista de colunas retornadas para que o SuperAdmin conheça o template de cada cliente.
- `public.update_tenant_info(...)`:
  - Adiciona o parâmetro `p_custom_template TEXT DEFAULT NULL`.
  - Atualiza `tenants.custom_template = NULLIF(TRIM(p_custom_template), '')`.
- `public.create_new_tenant(...)`:
  - Permite criar já associando o plano `custom` com template opcional.

## 2. Frontend Architecture (Registry Pattern)

### 2.1 Diretório `src/custom-menus/`
- Estrutura de pastas:
  ```
  src/custom-menus/
  ├── registry.js              # Índice central de templates e documentação de novos
  └── (futuras pastas de lojas VIP, ex: texas-vip/, sushibar/)
  ```

### 2.2 Interface do Registry (`registry.js`)
```javascript
export const AVAILABLE_TEMPLATES = [
  {
    id: "default",
    name: "Padrão da Plataforma",
    description: "Layout oficial de alta conversão com carrossel de banners, categorias sticky e carrinho lateral.",
    badge: "Oficial",
    component: null, // indica fallback para Menu.jsx padrão
  },
  // Futuros templates VIP serão adicionados aqui
];

export function getCustomMenuTemplate(templateId);
export function listAvailableTemplates();
```

### 2.3 Integração no `Menu.jsx`
- O `Menu.jsx` verifica:
  ```javascript
  const customTemplateKey = tenant?.custom_template;
  const CustomTemplateComponent = getCustomMenuTemplate(customTemplateKey);

  if (CustomTemplateComponent) {
    return (
      <CustomTemplateComponent
        tenant={tenant}
        tenantId={tenantId}
        settings={settings}
        products={products}
        categories={categories}
        cart={cart}
        storeIsOpen={storeIsOpen}
        {...otherProps}
      />
    );
  }
  ```
- Isso garante que qualquer cliente sem template configurado continue acessando exatamente o cardápio padrão, sem efeito colateral.

## 3. SuperAdmin Integration

- **Criação de Empresas**:
  - Novo item no seletor de planos: `Plano VIP Personalizado (R$ 249,00/mês — Front-End Exclusivo)`.
- **Edição de Empresas**:
  - Seletor de `Plano de Assinatura`: adiciona `VIP Personalizado`.
  - Seletor de `Template do Cardápio`: dropdown dinâmico listando os templates retornados por `listAvailableTemplates()`.
- **Tabela e Drawer**:
  - Badge roxo/ouro especial para clientes VIP.
  - Indicador de qual template está ativo (ou se está usando o layout padrão provisório).
