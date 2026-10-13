# reports-and-closing-history - Requirements Document

Relatórios de Vendas Diários com Faturamento/Lucro por Dia em Barras, Gráfico Donut de Categorias Resiliente a Exclusão, Mapa de Horários de Pico de Clientes e Histórico Persistido de Fechamentos de Caixa por Dia/Turno.

## Core Features

1. **Gráfico de Barras Diário (Faturamento e Vendas dos Dias)**:
   - Substituição do gráfico de barras de categoria por um gráfico temporal com as vendas/faturamento dia a dia ao longo do período selecionado (7 dias, 30 dias, mês, ano ou personalizado).
   - Apresenta faturamento bruto e volume de pedidos por dia, permitindo ao lojista enxergar os melhores dias da semana.
   - Livre de dependência de categorias para garantir estabilidade e clareza.

2. **Gráfico Redondo de Categorias Resiliente com Preservação do Nome Original (Snapshot de Categoria)**:
   - Manutenção do gráfico em Donut/Pizza para a distribuição percentual das categorias.
   - **Preservação Histórica do Nome da Categoria**: Se uma categoria for excluída do cardápio, o relatório **não perde o nome e não transforma em 'Outros'**, mas preserva o **nome original da categoria** que existia quando a venda foi feita (via snapshot de `category_name` no item do pedido e mapeamento histórico).
   - Blindagem total contra quebras: elimina erros de renderização, valores `null`, fatias fantasmas ou falhas no Recharts.

3. **Análise de Horários de Pico de Clientes (Peak Hours)**:
   - Gráfico de distribuição do volume de pedidos agrupados por hora do dia (das 00h às 23h, considerando o fuso oficial de Brasília).
   - Indicador em destaque (Card / Badge) apontando o horário de pico (ex: *"🔥 Horário de Maior Movimento: 20h às 21h com 38 pedidos"*), auxiliando na escala de motoboys e equipe de cozinha.

4. **Histórico Persistido de Fechamentos de Caixa (Salvar por Dias/Turnos)**:
   - Botão no modal de fechamento: `"💾 Salvar Fechamento"` (ou *"Concluir e Salvar"*), registrando o fechamento com data civil, turno, faturamento, conferência de gaveta e acerto de entregadores.
   - Seção / Aba em Relatórios com o histórico completo de caixas fechados no período.
   - Cada registro permite: Visualizar Raio-X, Reimprimir Cupom Térmico (80mm/58mm) e Reenviar Resumo formatado no WhatsApp.
   - Persistência estruturada: tabela `shift_closings` no Supabase com `tenant_id` e fallback transparente local.

## User Stories

- Como proprietário de restaurante, quero ver o faturamento diário em um gráfico de barras cronológico, para identificar quais dias da semana vendem mais sem poluição visual de categorias.
- Como lojista, quero que o gráfico redondo de categorias continue funcionando perfeitamente mesmo que eu exclua ou edite uma categoria no cardápio, para nunca ver telas quebradas ou relatórios bugados.
- Como gestor operacional, quero visualizar um gráfico de horários de pico, para saber exatamente em quais horários os clientes mais pedem e planejar melhor meus motoboys e equipe.
- Como operador de caixa ou gerente, quero salvar formalmente o fechamento de caixa do dia/turno e poder consultar o histórico de dias anteriores quando precisar, reimprimindo ou reenviando no WhatsApp.

## Acceptance Criteria

- [ ] O gráfico de barras principal exibe a evolução dia a dia do período selecionado, sem quebras e formatado em moeda brasileira (R$).
- [ ] O gráfico circular (Donut) preserva e exibe o nome original da categoria mesmo que a categoria seja excluída do cardápio posteriormente, mantendo a integridade histórica dos relatórios sem quebras.
- [ ] O painel de relatórios inclui uma visualização de "Horários de Pico" com contagem de pedidos por faixa horária e destaque do horário de pico.
- [ ] O modal de Fechamento de Caixa possui a ação de Salvar Fechamento, impedindo fechamentos duplicados com confirmação visual.
- [ ] A tela de Relatórios possui navegação intuitiva entre "Visão Geral de Vendas" e "Histórico de Fechamentos de Caixa".
- [ ] Os fechamentos salvos podem ser reabertos em modo de leitura/detalhes, reimpressos na impressora térmica e reenviados no WhatsApp.
- [ ] Todo o fuso horário obedece estritamente o horário oficial de Brasília (`America/Sao_Paulo`).

## Non-functional Requirements

- **Performance**: Cálculos e agregações em tempo de carregamento inferior a 300ms, com fallback offline caso a conexão falhe.
- **Resiliência & Zero-Crash**: Tratar valores nulos, produtos deletados e pedidos cancelados de maneira defensiva em todas as agregações.
- **Segurança Multi-Tenant**: Fechamentos de caixa e métricas filtrados estritamente pelo `tenant_id` ativo.
- **Compatibilidade**: Design responsivo compatível com mobile, tablet e desktop, e suporte de impressão térmica padrão 80mm/58mm.
