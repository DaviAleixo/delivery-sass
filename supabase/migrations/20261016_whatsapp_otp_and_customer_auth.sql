-- ==============================================================================
-- TABELA E FUNÇÕES PARA AUTENTICAÇÃO VIA WHATSAPP OTP E CADASTRO REAL DE CLIENTES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_otp_lookup 
    ON public.whatsapp_otp_codes(phone, verified, expires_at);

ALTER TABLE public.whatsapp_otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full otp" ON public.whatsapp_otp_codes;
CREATE POLICY "Service role full otp" 
    ON public.whatsapp_otp_codes FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- RPC 1: Solicitar Código OTP para WhatsApp
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_whatsapp_otp(
    p_phone TEXT,
    p_full_name TEXT DEFAULT '',
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_phone TEXT;
    v_tenant_id UUID;
    v_code TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    
    IF LENGTH(v_clean_phone) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Número de WhatsApp inválido (mínimo 10 dígitos com DDD).');
    END IF;

    -- Resolver tenant_id fallback se nulo
    v_tenant_id := COALESCE(p_tenant_id, 'a0000000-0000-0000-0000-000000000001'::uuid);

    -- Gera código de 6 dígitos
    v_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');
    v_expires_at := NOW() + INTERVAL '10 minutes';

    -- Invalida códigos antigos pendentes para o mesmo telefone
    UPDATE public.whatsapp_otp_codes
    SET verified = TRUE
    WHERE phone = v_clean_phone AND verified = FALSE;

    -- Insere novo código
    INSERT INTO public.whatsapp_otp_codes (
        tenant_id,
        phone,
        code,
        attempts,
        verified,
        expires_at,
        created_at
    ) VALUES (
        v_tenant_id,
        v_clean_phone,
        v_code,
        0,
        FALSE,
        v_expires_at,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'phone', v_clean_phone,
        'code', v_code,
        'expires_in_seconds', 600,
        'message', 'Código de verificação gerado com sucesso.'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- RPC 2: Validar Código OTP e Criar/Logar Cliente
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_whatsapp_otp(
    p_phone TEXT,
    p_code TEXT,
    p_full_name TEXT DEFAULT '',
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_phone TEXT;
    v_clean_code TEXT;
    v_tenant_id UUID;
    v_otp RECORD;
    v_final_name TEXT;
    v_customer RECORD;
BEGIN
    v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    v_clean_code := TRIM(COALESCE(p_code, ''));
    v_tenant_id := COALESCE(p_tenant_id, 'a0000000-0000-0000-0000-000000000001'::uuid);

    IF LENGTH(v_clean_phone) < 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Número de WhatsApp inválido.');
    END IF;

    IF LENGTH(v_clean_code) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Informe o código recebido.');
    END IF;

    -- Busca código ativo
    SELECT * INTO v_otp
    FROM public.whatsapp_otp_codes
    WHERE phone = v_clean_phone
      AND verified = FALSE
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Código expirado ou não encontrado. Solicite um novo código.');
    END IF;

    IF v_otp.attempts >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas incorretas. Solicite um novo código.');
    END IF;

    IF v_otp.code <> v_clean_code THEN
        UPDATE public.whatsapp_otp_codes
        SET attempts = attempts + 1
        WHERE id = v_otp.id;
        RETURN jsonb_build_object('success', false, 'error', 'Código incorreto. Verifique os dígitos digitados.');
    END IF;

    -- Código correto: marcar como verificado
    UPDATE public.whatsapp_otp_codes
    SET verified = TRUE
    WHERE id = v_otp.id;

    -- Resolver nome do cliente
    v_final_name := TRIM(COALESCE(p_full_name, ''));
    IF v_final_name = '' OR v_final_name = 'Cliente' THEN
        SELECT full_name INTO v_final_name
        FROM public.customers
        WHERE tenant_id = v_tenant_id AND phone = v_clean_phone
        LIMIT 1;
        
        IF v_final_name IS NULL OR v_final_name = '' THEN
            v_final_name := 'Cliente';
        END IF;
    END IF;

    -- Upsert no cadastro formal de clientes (public.customers)
    INSERT INTO public.customers (
        tenant_id,
        phone,
        full_name,
        created_date,
        updated_date
    ) VALUES (
        v_tenant_id,
        v_clean_phone,
        v_final_name,
        NOW(),
        NOW()
    )
    ON CONFLICT (tenant_id, phone) DO UPDATE
    SET full_name = CASE 
            WHEN EXCLUDED.full_name <> 'Cliente' THEN EXCLUDED.full_name 
            ELSE public.customers.full_name 
        END,
        updated_date = NOW()
    RETURNING * INTO v_customer;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Conta verificada com sucesso!',
        'customer', jsonb_build_object(
            'id', v_customer.id,
            'tenant_id', v_customer.tenant_id,
            'phone', v_customer.phone,
            'full_name', v_customer.full_name,
            'email', COALESCE(v_customer.email, ''),
            'role', 'user'
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_whatsapp_otp(TEXT, TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_whatsapp_otp(TEXT, TEXT, TEXT, UUID) TO anon, authenticated, service_role;
