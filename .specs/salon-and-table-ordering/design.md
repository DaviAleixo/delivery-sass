# Salon, Table Ordering & Digital Showcase (Plano Vitrine & Autoatendimento) - Design Document

Projeto técnico para suportar os modos de atendimento presencial (Cardápio Visual e Autoatendimento em Mesas com QR Code).

## 1. Schema & Database (Supabase)

### 1.1 Tabela `public.tenants`
```sql
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS salon_mode TEXT DEFAULT 'full';
COMMENT ON COLUMN public.tenants.salon_mode IS 'Modo de atendimento: full (mesas + delivery), table_only (apenas autoatendimento em mesas), showcase (apenas cardápio visual informativo sem pedidos)';
```

### 1.2 RPC `public.update_tenant_settings`
Atualizar o RPC para permitir atualizar `salon_mode`:
```sql
salon_mode = CASE WHEN p_data ? 'salon_mode' THEN p_data->>'salon_mode' ELSE salon_mode END,
```

## 2. Lógica de Resolução de Modo (`salonModeResolver`)

A resolução do modo ativo considera tanto o `plan` da assinatura quanto a preferência salva em `salon_mode`:
- Se `tenant.plan === 'showcase'` ou `tenant.salon_mode === 'showcase'`:
  - `isVisualOnly = true`
- Se `tenant.plan === 'table'` ou `tenant.salon_mode === 'table_only'`:
  - `isTableOnly = true`
- Caso contrário:
  - `isFull = true` (Modo padrão com delivery e salão)

## 3. Painel Administrativo (`Layout.jsx`)

Na montagem da barra lateral:
```javascript
const filteredNavigation = navigationItems.filter(item => {
  if (isVisualOnly) {
    const hiddenInShowcase = ['Orders', 'KDS', 'PDV', 'DeliveryDrivers', 'Clients', 'Coupons', 'Reports'];
    return !hiddenInShowcase.includes(item.pageKey);
  }
  if (isTableOnly) {
    const hiddenInTableOnly = ['DeliveryDrivers', 'Clients'];
    return !hiddenInTableOnly.includes(item.pageKey);
  }
  return true;
});
```

## 4. Cardápio Público (`Menu.jsx`)

- Quando `isVisualOnly`:
  - Oculta o botão flutuante de carrinho no cabeçalho e rodapé.
  - No `ProductCard`, não renderiza o botão `+ Adicionar`. O clique no produto abre o modal com foto e descrição ampliada, mas sem fluxo de compra.
  - Exibe banner informativo no topo: *"🍽️ Cardápio Digital • Faça seu pedido diretamente com a nossa equipe no salão."*
- Quando `isTableOnly`:
  - Se a URL contiver `?mesa=X`:
    - Libera o carrinho exclusivo para a mesa.
    - O modal de pedido (`OrderModal.jsx`) trava no tipo `dine_in`, não cobra taxa de entrega e não solicita endereço/CEP.
    - O pedido cai com som de campainha na tela de Pedidos e imprime a comanda térmica com `PARA MESA (Mesa X)`.
  - Se não contiver `?mesa=X`:
    - Mostra aviso amigável orientando o cliente a escanear o QR Code impresso na sua mesa.

## 5. Configurações da Loja (`Settings.jsx`)

Novo bloco "Modo de Atendimento do Cardápio":
- Dropdown/Radio estilizado com 3 opções:
  1. 📱 **Cardápio 100% Visual** (Sem carrinho. Cliente apenas lê os pratos e chama o garçom)
  2. 🍽️ **Autoatendimento na Mesa via QR Code** (Cliente pede pelo QR Code da mesa e a comanda imprime no caixa)
  3. 🛵 **Atendimento Completo: Mesas + Delivery + Retirada** (Padrão com motoboys e frete)
