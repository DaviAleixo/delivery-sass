# 🚀 Especificação do SaaS Delivery & Cardápio Digital

> **Status Atual**: Fase 1 — Multi-Tenant e Supabase First  
> **Links**: [[00 - 🏠 Inicio]] | [[01 - 🗺️ Roadmap & Backlog]] | [[04 - 🗄️ Modelagem & Supabase]]

---

## 1. Visão Geral e Proposta de Valor

Plataforma SaaS multi-tenant de cardápio digital, delivery e PDV para restaurantes locais (hamburguerias, pizzarias, sushis, lanchonetes).

### 🎯 O Grande Diferencial Competitivo (Pitch Comercial)
* **ZERO taxa por pedido**: Enquanto o iFood cobra entre **12% e 27%** do faturamento bruto do restaurante, nosso SaaS cobra apenas uma **assinatura mensal fixa**.
* **Retenção de Clientes Fiéis**: O restaurante direciona seus clientes do Instagram, WhatsApp e balcão para seu próprio canal direto, mantendo 100% da margem das vendas.
* **Operação 100% no Painel (Sem dependência de WhatsApp manual)**: Os pedidos caem direto no **Painel Administrativo / KDS em tempo real** com alerta sonoro e gestão Kanban.

---

## 2. Estrutura Oficial de Planos & Faixas de Pedidos (Estilo Anota AI + Goomer)

> 💡 **Modelo Comercial**: Cobrança por assinatura mensal fixa escalonada por **faixas de volume de pedidos** (sem comissões picadas e sem amarras de contrato de 12 meses).

| Recurso / Modalidade | 1. Visual / Catálogo | 2. Autoatendimento Presencial (Salão & Mesas) | 3. Full Delivery + Salão Completo (Carro-Chefe) |
| :--- | :--- | :--- | :--- |
| **Público-Alvo** | Confeitarias, docerias e lojas que só precisam de cardápio na bio do Instagram. | Bares, choperias, cafeterias e restaurantes que **não fazem delivery**, mas sofrem com fila e falta de garçom. | Pizzarias, hamburguerias e restaurantes completos com delivery, salão e balcão integrados. |
| **Faixa 1: Até 150 pedidos/mês** | **R$ 49,90 / mês** *(Fixo)* | **R$ 119,90 / mês** | **R$ 159,90 / mês** |
| **Faixa 2: Até 350 pedidos/mês** | — | **R$ 169,90 / mês** | **R$ 219,90 / mês** |
| **Faixa 3: Ilimitado (+350 pedidos)** | — | **R$ 229,90 / mês** | **R$ 299,90 / mês** |
| **Módulos Inclusos** | Cardápio WebP, Banners, Pizza Builder, Cupons. | QR Code individual por mesa, Pedidos de Mesa/Balcão via celular, KDS Cozinha, Spooler Térmico (.exe), Comanda ao vivo. | Tudo da modalidade 2 + Despacho de Motoboys (3 modelos de remuneração), Rastreio ao vivo, Caixa/Fechamento de Turno e Relatórios. |
| **Comissão por Pedido** | **R$ 0,00 (ZERO)** | **R$ 0,00 (ZERO)** | **R$ 0,00 (ZERO)** |
| **Concorrente Direto Superado** | OlaClick (limitações pesadas) | Goomer (cobra o dobro + tablets caros) | Anota AI (cobra R$ 299 a R$ 349 + fidelidade de 1 ano) |

### 🎯 Argumentos de Vendas Principais:
1. **Autoatendimento Presencial**: *"Economize o salário de 1 garçom (R$ 2.500/mês). O cliente pede no celular e a cozinha recebe na hora."*
2. **Full Delivery**: *"0% de taxa por pedido. Se você vende R$ 30.000, o iFood come R$ 6.000. No PedeMuleke você paga no máximo R$ 299 e o lucro é 100% seu."*
3. **Sem Fidelidade**: *"Cancele quando quiser, sem multas contratuais abusivas."*

---

## 3. Credenciais de Demonstração & Acessos

| Perfil                        | Usuário              | Senha Inicial        | Destino após Login | O que enxerga                                                  |
| :---------------------------- | :------------------- | :------------------- | :----------------- | :------------------------------------------------------------- |
| **👑 Super Admin (Davi)**     | `davi`               | `davi123`            | `/SuperAdmin`      | Todas as empresas, faturamento MRR, criar lojas, pausar lojas  |
| **🍔 Vruum Burguer (Piloto)** | `vrumm`              | `vrumm123`           | `/vrumm/Dashboard` | Somente a operação da Vruum Burguer (pedidos, lanches, vendas) |
| **✨ Novas Lojas Criadas**     | Definido no cadastro | Definida no cadastro | `/:slug/Dashboard` | **100% Zerada**: loja limpa para cadastro inicial              |

---

## 4. Fluxo Operacional de Pedidos
```
[Cliente Final] 
       │ Acessa cardápio (/:slug)
       │ Monta carrinho (adicionais, observações)
       │ Preenche entrega/retirada e forma de pagamento
       ▼
[Supabase: INSERT INTO orders (tenant_id, ...)]
       │
       ▼ (Evento Realtime: INSERT filtrado por tenant_id)
[Painel Admin do Restaurante]
       ├── Toca alerta sonoro contínuo 🔔
       ├── Notificação visual no topo da tela
       ├── Card surge na coluna "Pendente" do Kanban
       └── Operador aceita: Status muda para "Confirmado" -> "Em Preparo" -> "Enviado" -> "Entregue"
```
