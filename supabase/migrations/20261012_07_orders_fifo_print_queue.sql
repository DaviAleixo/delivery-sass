-- ==============================================================================
-- Migration: 20261012_07_orders_fifo_print_queue.sql
-- Descrição: Adiciona controle de fila FIFO de impressão, status e carimbo de impressão
-- para garantir ordenação e tolerância a quedas de internet.
-- ==============================================================================

-- 1. Adicionar colunas de controle de impressão na tabela orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS print_status TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS print_count INTEGER NOT NULL DEFAULT 0;

-- 2. Restrição de valores válidos para print_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_print_status_check'
    ) THEN
        ALTER TABLE public.orders 
        ADD CONSTRAINT orders_print_status_check 
        CHECK (print_status IN ('pending', 'printing', 'printed', 'failed'));
    END IF;
END $$;

-- 3. Atualizar pedidos já existentes antigos para 'printed' para não tentar imprimir histórico antigo
UPDATE public.orders 
SET print_status = 'printed', 
    printed_at = COALESCE(created_date, NOW()) 
WHERE print_status = 'pending' AND created_date < (NOW() - INTERVAL '6 hours');

-- 4. Índice de alto desempenho para consulta de fila FIFO (tenant_id, print_status, created_date ASC)
CREATE INDEX IF NOT EXISTS idx_orders_fifo_print_queue 
ON public.orders (tenant_id, print_status, created_date ASC);

COMMENT ON COLUMN public.orders.print_status IS 'Status da impressão da comanda: pending, printing, printed, failed';
COMMENT ON COLUMN public.orders.printed_at IS 'Data/hora exata em que o cupom foi impresso fisicamente';
COMMENT ON COLUMN public.orders.print_count IS 'Número de vezes que o cupom deste pedido foi impresso';
