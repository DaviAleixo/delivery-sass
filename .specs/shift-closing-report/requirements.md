# shift-closing-report - Requirements Document

Fechamento de Caixa do Turno e Relatório do Dia em 1 Clique com impressão térmica adaptativa (com ou sem motoboys).

## Core Features

1. **Fechamento de Turno Inteligente em 1 Clique**:
   - Cálculo automático dos pedidos do turno atual da loja com base no horário oficial de abertura da loja (com tolerância para turnos noturnos que ultrapassam a meia-noite em fuso América/São Paulo).
   - Total bruto faturado, quantidade total de pedidos, ticket médio e contagem de cancelados.
   - Separação precisa por canal de venda: Delivery vs Retirada / Balcão (PDV).

2. **Detalhamento Financeiro por Forma de Pagamento**:
   - Total recebido em Dinheiro (conferência do que deve estar fisicamente na gaveta do caixa).
   - Total recebido via PIX Online (confirmado em conta).
   - Total em Cartão de Crédito (maquininha).
   - Total em Cartão de Débito (maquininha).
   - Total em Vale Refeição / Alimentação.
   - Destaque para troco devolvido e divergências de caixa.

3. **Modo Adaptativo: COM Entregadores vs SEM Entregadores**:
   - **Quando a loja possui entregadores cadastrados e utilizados no turno**:
     - Extrato individual de cada motoboy que trabalhou na noite.
     - Quantidade de Viagens / Saídas agrupadas (`trip_id`).
     - Quantidade de Comandas / Pedidos entregues.
     - Modelo de taxa aplicado (Por Comanda, Por Viagem ou Fixo/Diária).
     - Total de taxa devida a pagar ao motoboy.
     - **Dinheiro a Devolver ao Caixa**: soma dos pedidos com pagamento em dinheiro na entrega recebidos pelo motoboy.
     - **Saldo Líquido do Motoboy**: (Taxa que o motoboy tem a receber) menos (Dinheiro que ele recolheu e deve devolver ao caixa), indicando se o restaurante deve pagar o motoboy (com chave Pix pronta para copiar) ou se o motoboy deve devolver troco/dinheiro ao restaurante.
   - **Quando a loja NÃO possui entregadores cadastrados (ou sem entregas terceirizadas)**:
     - O bloco de motoboys é completamente omitido da visualização e da impressão.
     - Exibição limpa e objetiva: faturamento da loja, formas de pagamento, total de taxas de entrega recolhidas pela loja como receita própria e dinheiro em gaveta.

4. **Impressão Térmica Padronizada (80mm & 58mm)**:
   - Reaproveitamento do motor de impressão de cupom existente (`PrintOrder.jsx` / `@media print` monocromático preto puro `#000`).
   - Layout compacto de cupom não fiscal com corte de fechamento:
     - Cabeçalho: Nome do Restaurante, Título "FECHAMENTO DE CAIXA", Data, Hora e Intervalo do Turno.
     - Tabela de Vendas & Faturamento.
     - Resumo de Formas de Pagamento.
     - Se houver motoboys: Extrato individual por motoboy (comandas, viagens, taxa, dinheiro a devolver e saldo).
     - Se não houver: Totalização pura do caixa.
     - Linhas pontilhadas para assinatura do operador/caixa e conferente.

5. **Compartilhamento Rápido via WhatsApp**:
   - Botão de 1 clique para formatar o resumo do fechamento em texto com emojis pronto para envio ao WhatsApp do dono/sócio.

## User Stories

- As a **Operador de Caixa / Lojista**, I want to clicar em um botão no final da noite e obter o resumo completo do caixa sem precisar somar pedidos na calculadora, so that eu economize tempo e feche o restaurante sem erros financeiros.
- As a **Restaurante com Motoboys**, I want to ver exatamente quantas viagens e entregas cada motoboy fez, quanto ele tem a receber de taxa e quanto dinheiro em espécie ele tem que me entregar, so that o acerto de contas seja 100% transparente e sem brigas.
- As a **Restaurante sem Motoboys (ou equipe própria fixa)**, I want to ver o fechamento focado exclusivamente nas entradas do caixa e formas de pagamento, so that o relatório não fique poluído com dados desnecessários de entregadores.
- As a **Dono do Restaurante**, I want to imprimir uma via física na impressora térmica da gaveta e receber uma mensagem no WhatsApp com o resumo da noite, so that eu tenha o controle guardado e na palma da mão.

## Acceptance Criteria

- [ ] O relatório calcula o turno considerando horários após a meia-noite (ex: 18h de um dia até 03h da manhã do dia seguinte) sem misturar com turnos anteriores.
- [ ] O total geral por formas de pagamento bate exatamente com a soma dos pedidos entregues e confirmados do turno.
- [ ] No cenário COM entregador: cada motoboy com saídas no turno é listado com viagens, comandas, taxas a receber, dinheiro a devolver ao caixa e saldo final.
- [ ] No cenário SEM entregador: o relatório oculta totalmente a seção de motoboys tanto na tela quanto no cupom impresso.
- [ ] A impressão térmica se adapta a bobinas de 80mm e 58mm com fontes de alto contraste e sem cortes laterais.
- [ ] O botão "Copiar para WhatsApp" gera mensagem organizada, legível e formatada com quebras de linha e emojis.
- [ ] O acesso ao fechamento está disponível de forma imediata na tela de Pedidos (botão no topo) e na tela de Relatórios.

## Non-functional Requirements

- **Performance**: O fechamento do turno deve processar até 500 pedidos do turno em menos de 500ms no cliente.
- **Segurança**: Respeito estrito ao isolamento `tenant_id` e permissões de acesso da loja.
- **Compatibilidade**: Layout térmico compatível com impressoras EPSON, Bematech, Elgin e navegadores Chrome/Edge.
- **Timezone**: Todos os cálculos de data e virada de turno baseados no horário oficial de Brasília (`America/Sao_Paulo`).
