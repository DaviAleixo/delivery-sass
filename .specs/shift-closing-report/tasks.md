# shift-closing-report - Task List

## Implementation Tasks

- [x] 1. **Cálculo Puro e Determinístico de Fechamento de Turno (`shiftClosingCalculator.js`)**
    - [x] 1.1. Implementar resolução de intervalo de turno noturno (Brasília) e agregação de vendas e formas de pagamento.
        - *Goal*: Calcular totais brutos/líquidos, ticket médio, cancelados e divisão exata por dinheiro, pix online, crédito, débito e vale refeição.
        - *Details*: Garantir tratamento seguro para virada de meia-noite (turnos das 18h às 02h) e sanitização numérica contra valores nulos.
        - *Requirements*: Ref Requisito 1 e 2.
    - [x] 1.2. Implementar reconciliação financeira de entregadores e acerto de caixa.
        - *Goal*: Calcular viagens agrupadas (`trip_id`), comandas entregues, taxa devida conforme modelo (comanda/viagem/nenhum) e dinheiro em mãos a devolver ao caixa.
        - *Details*: Apurar o saldo líquido (se a loja paga taxa via Pix ou se o motoboy devolve dinheiro vivo ao caixa).
        - *Requirements*: Ref Requisito 3.
    - [x] 1.3. Implementar modo adaptativo sem entregadores.
        - *Goal*: Omitir completamente o bloco de motoboys e focar exclusivamente no caixa da loja quando não houver entregadores cadastrados.
        - *Details*: `driverSettlements.hasDrivers = false` limpando qualquer menção a taxas terceirizadas.
        - *Requirements*: Ref Requisito 3.

- [ ] 2. **Formatador de Resumo para WhatsApp (`shiftClosingWhatsAppFormatter.js`)**
    - [x] 2.1. Criar gerador de texto formatado com emojis para compartilhamento rápido.
        - *Goal*: Permitir que o operador copie em 1 clique um resumo limpo e profissional para colar no WhatsApp do proprietário.
        - *Details*: Incluir cabeçalho da loja, faturamento por meio de pagamento, conferência da gaveta de dinheiro e extrato de motoboys (quando houver).
        - *Requirements*: Ref Requisito 5.

- [ ] 3. **Componente de Impressão Térmica em Bobina 80mm & 58mm (`ShiftClosingThermalSlip.jsx`)**
    - [x] 3.1. Desenvolver o cupom de fechamento térmico monocromático preto puro `#000`.
        - *Goal*: Permitir imprimir uma via física na impressora térmica da gaveta de dinheiro para arquivo físico do restaurante.
        - *Details*: Reaproveitar a infraestrutura e padrões térmicos de `PrintOrder.jsx` com divisórias pontilhadas, totais em negrito e linhas para assinatura do operador e gerente.
        - *Requirements*: Ref Requisito 4.

- [ ] 4. **Modal Interativo de Fechamento de Caixa (`ShiftClosingModal.jsx`)**
    - [x] 4.1. Construir interface rica com KPIs de vendas, tabela de formas de pagamento e cartões de motoboys com cópia de chave Pix.
        - *Goal*: Apresentar o raio-x financeiro de forma visual, responsiva e agradável no navegador ou celular.
        - *Details*: Cartões adaptativos que mostram ou escondem entregadores dinamicamente, e botões de ação ("🖨️ Imprimir na Térmica" e "📲 Copiar para WhatsApp").
        - *Requirements*: Ref Requisitos 1, 2, 3, 4 e 5.

- [x] 5. **Integração na Tela de Pedidos (`Orders.jsx`) e Relatórios (`Reports.jsx`)**
    - [x] 5.1. Adicionar botão fixo "🧾 Fechar Caixa" na barra de ações superior de `Orders.jsx`.
        - *Goal*: Permitir acesso imediato a qualquer momento do turno (para prévia ou encerramento).
        - *Details*: Posicionado de forma visível ao lado dos botões de status da loja e som.
        - *Requirements*: Ref Requisito 1.
    - [x] 5.2. Adicionar sugestão opcional ao alterar status da loja para "Fechada".
        - *Goal*: Facilitar o fluxo de fim de expediente: ao fechar a loja, sugerir a visualização do fechamento de caixa.
        - *Details*: Toast interativo ou confirmação suave com botão de abrir fechamento.
        - *Requirements*: Ref Requisito 1.
    - [x] 5.3. Disponibilizar atalho na tela de `Reports.jsx` para histórico e consulta de turnos anteriores.
        - *Goal*: Permitir que o dono consulte dados de dias anteriores mesmo após encerrado o turno.
        - *Details*: Botão de consulta de fechamentos com seleção de data.
        - *Requirements*: Ref Requisito 1.

## Task Dependencies

- Tarefa 1 deve ser concluída antes das Tarefas 2, 3 e 4.
- Tarefas 2, 3 e 4 podem ser desenvolvidas em paralelo com base nas estruturas de dados da Tarefa 1.
- Tarefa 5 conecta os componentes finais à aplicação.

## Estimated Timeline

- Tarefa 1 (Motor de Cálculo): 2 horas
- Tarefa 2 (Formatador WhatsApp): 1 hora
- Tarefa 3 (Cupom Térmico): 2 horas
- Tarefa 4 (Modal Interativo): 3 horas
- Tarefa 5 (Integração nas Telas & Testes): 2 horas
- **Total: 10 horas**
