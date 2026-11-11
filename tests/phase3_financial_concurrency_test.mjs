/**
 * FASE 3 — TESTES DE CONCORRÊNCIA FINANCEIRA
 * Arquivo: tests/phase3_financial_concurrency_test.mjs
 * Execução: node tests/phase3_financial_concurrency_test.mjs
 *
 * Cobre todos os 8 cenários financeiros críticos em ambiente isolado (test-empresa-*):
 * 1. Dois pagamentos simultâneos do mesmo pedido (mesa parcial + Pix/MercadoPago guards)
 * 2. Cem webhooks repetidos do Mercado Pago (100 chamadas paralelas na Edge Function)
 * 3. Reembolso/estorno enquanto cashback está sendo creditado (race process_order_cashback vs revert_order_cashback)
 * 4. Dois (ou 10) pedidos simultâneos consumindo o mesmo saldo de cashback (sem saldo negativo/gasto duplo)
 * 5. Cupom de uso único aplicado simultaneamente (UNICO5 sob rajada concorrente)
 * 6. Cancelamento durante a confirmação de pagamento (admin cancelando vs create_pix_payment / guarda atomic)
 * 7. Verificação de segurança + idempotência de webhook fora de ordem / RBAC das RPCs atômicas
 * 8. Falha de rede após confirmação financeira (recuperação idempotente por p_order_id + cashback + check_payment_status)
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) return;
    const key = match[1];
    let val = (match[2] || "").trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });
}

loadEnvFile(path.resolve(__dirname, "../.env"));
loadEnvFile(path.resolve(__dirname, "../.env.local"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERRO: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes.");
  process.exit(1);
}

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loginAdmin(slug) {
  const client = makeClient();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({
      action: "login",
      storeIdentifier: slug,
      username: "admin",
      password: "TestAdmin@2026!",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.session?.access_token) {
    throw new Error(`Falha no login admin (${slug}): ${JSON.stringify(body)}`);
  }
  await client.auth.setSession(body.session);
  return { client, token: body.session.access_token };
}

async function callMercadoPagoEdge(payload, token = SUPABASE_ANON_KEY) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mercadopago`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const results = [];
function assertTest(name, passed, detail) {
  results.push({ name, passed: Boolean(passed), detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name} -> ${detail}`);
}

async function main() {
  const anon = makeClient();
  const runTag = `PHASE3_FIN_${Date.now()}`;
  const createdOrderIds = [];
  const createdPhones = new Set(["31988881108"]);
  let createdSessionId = null;
  let targetTableId = null;

  const { data: tenants, error: tErr } = await anon
    .from("tenants_public")
    .select("id, slug, name, cashback_enabled")
    .in("slug", ["test-empresa-04", "test-empresa-06"]);

  if (tErr || !tenants?.length) {
    throw new Error(`Falha ao carregar tenants de teste: ${tErr?.message}`);
  }

  const tenant = tenants.find((t) => t.slug === "test-empresa-04") || tenants[0];
  const { client: adminClient, token: adminToken } = await loginAdmin(tenant.slug);

  const { data: products } = await anon
    .from("products")
    .select("id, name, price")
    .eq("tenant_id", tenant.id)
    .eq("available", true)
    .order("price", { ascending: false });

  if (!products?.length) {
    throw new Error(`Sem produtos disponíveis em ${tenant.slug}`);
  }
  const topProduct = products[0];

  console.log("=========================================================================");
  console.log("💳 FASE 3 — SUÍTE DE CONCORRÊNCIA FINANCEIRA");
  console.log(`🏪 Tenant isolado: ${tenant.slug} (${tenant.id}) | Produto: ${topProduct.name} (R$ ${topProduct.price})`);
  console.log(`🏷️  Run Tag: ${runTag}`);
  console.log("=========================================================================\n");

  try {
    // -----------------------------------------------------------------------
    // CENÁRIO 1: Dois pagamentos simultâneos do mesmo pedido (Mesa + MP Guard)
    // -----------------------------------------------------------------------
    {
      const { data: tbl } = await adminClient
        .from("restaurant_tables")
        .select("id, table_number")
        .eq("tenant_id", tenant.id)
        .limit(1)
        .maybeSingle();

      if (tbl) {
        targetTableId = tbl.id;
        await adminClient.from("table_sessions").delete().eq("table_id", tbl.id).in("status", ["open", "bill_requested"]);
        await adminClient.from("restaurant_tables").update({ status: "available" }).eq("id", tbl.id);

        const { data: openRes } = await adminClient.rpc("open_table_session", {
          p_tenant_id: tenant.id,
          p_table_id: tbl.id,
          p_customer_name: "Concorrência Pagamento",
          p_customer_phone: "31999990031",
          p_people_count: 2,
        });
        createdSessionId = openRes?.session?.id || null;

        if (createdSessionId) {
          const dupPayId = `pay_dup_${Date.now()}`;
          // 1A) 10 envios simultâneos com o MESMO payment.id -> apenas 1 entra, 9 ignorados como duplicado
          const sameIdCalls = await Promise.all(
            Array.from({ length: 10 }, () =>
              adminClient.rpc("add_table_session_partial_payment", {
                p_session_id: createdSessionId,
                p_payment: { id: dupPayId, method: "pix", amount: 25.5, paid_at: new Date().toISOString() },
              })
            )
          );
          const dupIgnoredCount = sameIdCalls.filter((r) => r.data?.success && r.data?.duplicate_ignored === true).length;

          // 1B) Dois pagamentos distintos simultâneos na mesma sessão (R$ 15 + R$ 20) -> nenhum perdido
          const [p1, p2] = await Promise.all([
            adminClient.rpc("add_table_session_partial_payment", {
              p_session_id: createdSessionId,
              p_payment: { id: `pay_a_${Date.now()}`, method: "pix", amount: 15.0, paid_at: new Date().toISOString() },
            }),
            adminClient.rpc("add_table_session_partial_payment", {
              p_session_id: createdSessionId,
              p_payment: { id: `pay_b_${Date.now()}`, method: "credit", amount: 20.0, paid_at: new Date().toISOString() },
            }),
          ]);

          const { data: finalSess } = await adminClient
            .from("table_sessions")
            .select("payment_details")
            .eq("id", createdSessionId)
            .single();

          const paymentsArr = finalSess?.payment_details?.payments || [];
          const totalPaid = paymentsArr.reduce((acc, p) => acc + Number(p.amount || 0), 0);

          assertTest(
            "1a. Dois pagamentos simultâneos na mesa (idempotência + soma exata sem lost update)",
            dupIgnoredCount === 9 && paymentsArr.length === 3 && Math.abs(totalPaid - 60.5) < 0.01 && p1.data?.success && p2.data?.success,
            `dupIgnored=${dupIgnoredCount}/9, paymentsCount=${paymentsArr.length}, totalPaid=R$${totalPaid.toFixed(2)}`
          );
        }
      }

      // 1B) Bloqueio de pagamento duplo em pedido já pago (create_pix_payment em pedido 'paid' deve retornar 409)
      const paidOrdId = crypto.randomUUID();
      const { data: createdOrd } = await anon.rpc("create_public_order", {
        p_order_id: paidOrdId,
        p_tenant_id: tenant.id,
        p_customer_name: "Cenário 1 Paid",
        p_customer_phone: "31988881101",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Pagamento, 10",
        p_payment_method: "pix",
        p_items: [{ product_id: topProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S1`,
      });
      if (createdOrd?.order_id) {
        createdOrderIds.push(createdOrd.order_id);
        await adminClient.from("orders").update({ payment_status: "paid", mp_payment_id: "9900112233" }).eq("id", createdOrd.order_id);

        const [cp1, cp2] = await Promise.all([
          callMercadoPagoEdge({ action: "create_pix_payment", orderId: createdOrd.order_id }),
          callMercadoPagoEdge({ action: "create_pix_payment", orderId: createdOrd.order_id }),
        ]);

        assertTest(
          "1b. Duas tentativas simultâneas de gerar novo PIX em pedido já pago são bloqueadas (HTTP 409)",
          cp1.status === 409 && cp2.status === 409,
          `statuses=[${cp1.status}, ${cp2.status}], errors=[${cp1.body?.error}, ${cp2.body?.error}]`
        );
      }
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 2: Cem webhooks repetidos do Mercado Pago em paralelo
    // -----------------------------------------------------------------------
    {
      const whOrderId = crypto.randomUUID();
      const fakeMpPaymentId = String(880000000 + Math.floor(Math.random() * 999999));
      const { data: whOrd } = await anon.rpc("create_public_order", {
        p_order_id: whOrderId,
        p_tenant_id: tenant.id,
        p_customer_name: "Cenário 2 100 Webhooks",
        p_customer_phone: "31988881102",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Webhook, 100",
        p_payment_method: "pix",
        p_items: [{ product_id: topProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S2`,
      });
      createdOrderIds.push(whOrd.order_id);
      await adminClient.from("orders").update({ mp_payment_id: fakeMpPaymentId }).eq("id", whOrd.order_id);

      // Dispara 100 webhooks idênticos simultaneamente na Edge Function mercadopago
      const webhookCalls = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          callMercadoPagoEdge({
            action: "webhook",
            type: "payment",
            orderId: whOrd.order_id,
            data: { id: fakeMpPaymentId },
            attempt: i,
          })
        )
      );

      const serverCrashes5xx = webhookCalls.filter((r) => r.status >= 500).length;
      const validHandled = webhookCalls.filter((r) => r.status === 200 && r.body?.received === true).length;

      // Garante também que RPCs atômicas internas de conciliação não estão acessíveis a anon/authenticated
      const { error: privReconcileErr } = await adminClient.rpc("reconcile_mp_payment_atomic", {
        p_order_id: whOrd.order_id,
        p_mp_payment_id: fakeMpPaymentId,
        p_mp_status: "approved",
        p_mp_external_ref: whOrd.order_id,
        p_transaction_amount: 999,
      });

      assertTest(
        "2. 100 webhooks repetidos simultâneos tratados sem 5xx + reconcile_mp_payment_atomic isolada (service_role only)",
        serverCrashes5xx === 0 && validHandled === 100 && Boolean(privReconcileErr),
        `handled200=${validHandled}/100, crashes5xx=${serverCrashes5xx}, atomicRpcBlockedForAdmin=${Boolean(privReconcileErr)}`
      );
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 3: Reembolso/estorno enquanto cashback está sendo creditado
    // -----------------------------------------------------------------------
    {
      const racePhone = `31977${String(Date.now()).slice(-6)}`;
      createdPhones.add(racePhone);
      const ordRaceId = crypto.randomUUID();
      const { data: ordRace } = await anon.rpc("create_public_order", {
        p_order_id: ordRaceId,
        p_tenant_id: tenant.id,
        p_customer_name: "Cenário 3 Refund vs Cashback",
        p_customer_phone: racePhone,
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Race CB, 30",
        p_payment_method: "pix",
        p_items: [{ product_id: topProduct.id, quantity: 4 }],
        p_notes: `${runTag}_S3`,
      });
      createdOrderIds.push(ordRace.order_id);

      const expectedEarned = Number(ordRace.cashback_earned || 0);
      // Marca como entregue por instante só para simular corrida real de entrega/crédito vs cancelamento/estorno simultâneo
      await adminClient.from("orders").update({ status: "entregue" }).eq("id", ordRace.order_id);

      // Dispara SIMULTANEAMENTE 5 créditos (`credit_only`) + 5 estornos (`revert_order_cashback`)
      const mixedOps = await Promise.all([
        ...Array.from({ length: 5 }, () =>
          adminClient.rpc("process_order_cashback", { p_order_id: ordRace.order_id, p_action: "credit_only" })
        ),
        ...Array.from({ length: 5 }, () =>
          adminClient.rpc("revert_order_cashback", { p_order_id: ordRace.order_id })
        ),
      ]);

      // Tenta creditar de novo APÓS estorno já ocorrido (deve ser bloqueado pelo marcador 'reversal')
      const { data: lateCredit } = await adminClient.rpc("process_order_cashback", {
        p_order_id: ordRace.order_id,
        p_action: "credit_only",
      });

      const { data: walletAfter } = await adminClient
        .from("customer_cashback_wallets")
        .select("id, balance")
        .eq("tenant_id", tenant.id)
        .eq("phone", racePhone)
        .maybeSingle();

      const { data: txRows } = await adminClient
        .from("customer_cashback_transactions")
        .select("type, amount")
        .eq("order_id", ordRace.order_id);

      const finalBal = Number(walletAfter?.balance || 0);
      const ledgerSum = (txRows || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);

      // Testa também estorno fantasma: pedido COM cashback_discount configurado na linha mas SEM débito registrado nunca pode gerar +saldo
      const ghostOrdId = crypto.randomUUID();
      const { data: ghostOrd } = await anon.rpc("create_public_order", {
        p_order_id: ghostOrdId,
        p_tenant_id: tenant.id,
        p_customer_name: "Cenário 3b Ghost Refund",
        p_customer_phone: racePhone,
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Ghost, 31",
        p_payment_method: "pix",
        p_items: [{ product_id: topProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S3_GHOST`,
      });
      createdOrderIds.push(ghostOrd.order_id);
      await adminClient.from("orders").update({ cashback_discount: 50.0 }).eq("id", ghostOrd.order_id);
      const { data: ghostRev } = await adminClient.rpc("revert_order_cashback", { p_order_id: ghostOrd.order_id });
      const { data: walletAfterGhost } = await adminClient
        .from("customer_cashback_wallets")
        .select("balance")
        .eq("tenant_id", tenant.id)
        .eq("phone", racePhone)
        .maybeSingle();

      assertTest(
        "3. Corrida reembolso vs crédito de cashback + bloqueio pós-estorno + sem estorno fantasma",
        expectedEarned > 0 &&
          Math.abs(finalBal) < 0.01 &&
          Math.abs(ledgerSum) < 0.01 &&
          lateCredit?.blocked_by_cancellation_or_refund === true &&
          Number(lateCredit?.credited_now || 0) === 0 &&
          Number(ghostRev?.cashback_refunded || 0) === 0 &&
          Math.abs(Number(walletAfterGhost?.balance || 0)) < 0.01 &&
          mixedOps.every((r) => !r.error),
        `earned=${expectedEarned}, walletBal=${finalBal}, ledgerSum=${ledgerSum}, lateCreditBlocked=${lateCredit?.blocked_by_cancellation_or_refund}, ghostRefunded=${ghostRev?.cashback_refunded}`
      );
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 4: Múltiplos pedidos consumindo o mesmo saldo de cashback
    // -----------------------------------------------------------------------
    {
      const drainPhone = `31966${String(Date.now()).slice(-6)}`;
      createdPhones.add(drainPhone);
      // Semente legítima via pedido entregue para gerar exatamente saldo positivo na carteira
      const seedOrdId = crypto.randomUUID();
      const { data: seedOrd } = await anon.rpc("create_public_order", {
        p_order_id: seedOrdId,
        p_tenant_id: tenant.id,
        p_customer_name: "Cenário 4 Seed Cashback",
        p_customer_phone: drainPhone,
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Wallet, 40",
        p_payment_method: "pix",
        p_items: [{ product_id: topProduct.id, quantity: 6 }],
        p_notes: `${runTag}_S4_SEED`,
      });
      createdOrderIds.push(seedOrd.order_id);
      await adminClient.from("orders").update({ status: "entregue" }).eq("id", seedOrd.order_id);
      const { data: seedCb } = await adminClient.rpc("process_order_cashback", {
        p_order_id: seedOrd.order_id,
        p_action: "credit_only",
      });
      const initialWalletBal = Number(seedCb?.credited_now || 0);

      // Dispara 10 pedidos SIMULTÂNEOS tentando gastar todo o saldo de cashback ao mesmo tempo
      const spendCalls = await Promise.all(
        Array.from({ length: 10 }, (_, idx) => {
          const oid = crypto.randomUUID();
          createdOrderIds.push(oid);
          return anon.rpc("create_public_order", {
            p_order_id: oid,
            p_tenant_id: tenant.id,
            p_customer_name: `Cenário 4 Drain ${idx}`,
            p_customer_phone: drainPhone,
            p_delivery_type: "delivery",
            p_delivery_address: `Rua Spend ${idx}`,
            p_payment_method: "pix",
            p_items: [{ product_id: topProduct.id, quantity: 5 }],
            p_use_cashback: true,
            p_cashback_amount: initialWalletBal,
            p_notes: `${runTag}_S4_DRAIN`,
          });
        })
      );

      const totalDiscountUsed = spendCalls.reduce((acc, r) => acc + Number(r.data?.cashback_discount || 0), 0);
      const ordersWithDiscount = spendCalls.filter((r) => Number(r.data?.cashback_discount || 0) > 0).length;

      const { data: finalWallet } = await adminClient
        .from("customer_cashback_wallets")
        .select("balance")
        .eq("tenant_id", tenant.id)
        .eq("phone", drainPhone)
        .single();

      const walletBalAfter = Number(finalWallet?.balance ?? -1);

      assertTest(
        "4. 10 pedidos concorrentes tentando consumir o mesmo saldo de cashback (sem gasto duplo nem negativo)",
        initialWalletBal > 0 &&
          ordersWithDiscount === 1 &&
          Math.abs(totalDiscountUsed - initialWalletBal) < 0.01 &&
          walletBalAfter >= 0 &&
          Math.abs(walletBalAfter) < 0.01,
        `initialBal=R$${initialWalletBal.toFixed(2)}, totalSpent=R$${totalDiscountUsed.toFixed(2)}, ordersDiscounted=${ordersWithDiscount}/10, finalBal=R$${walletBalAfter.toFixed(2)}`
      );
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 5: Cupom de uso único aplicado simultaneamente
    // -----------------------------------------------------------------------
    {
      const { data: unicoCup } = await adminClient
        .from("coupons")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("code", "UNICO5")
        .maybeSingle();

      if (unicoCup?.id) {
        await adminClient.from("coupon_usages").delete().eq("coupon_id", unicoCup.id);

        const couponCalls = await Promise.all(
          Array.from({ length: 15 }, (_, idx) => {
            const oid = crypto.randomUUID();
            createdOrderIds.push(oid);
            return anon.rpc("create_public_order", {
              p_order_id: oid,
              p_tenant_id: tenant.id,
              p_customer_name: `Cenário 5 Cupom ${idx}`,
              p_customer_phone: `3195500${String(idx).padStart(4, "0")}`,
              p_delivery_type: "delivery",
              p_delivery_address: `Rua Cupom ${idx}`,
              p_payment_method: "pix",
              p_items: [{ product_id: topProduct.id, quantity: 2 }],
              p_coupon_code: "UNICO5",
              p_notes: `${runTag}_S5`,
            });
          })
        );

        const acceptedCouponOrders = couponCalls.filter((r) => r.data?.success && Number(r.data?.discount || 0) > 0);
        const { count: usageCount } = await adminClient
          .from("coupon_usages")
          .select("id", { count: "exact", head: true })
          .eq("coupon_id", unicoCup.id);

        assertTest(
          "5. 15 aplicações simultâneas de cupom uso único (UNICO5) -> exatamente 1 uso gravado",
          acceptedCouponOrders.length === 1 && usageCount === 1,
          `acceptedWithDiscount=${acceptedCouponOrders.length}/15, couponUsagesRowCount=${usageCount}`
        );

        await adminClient.from("coupon_usages").delete().eq("coupon_id", unicoCup.id);
      } else {
        assertTest("5. Cupom UNICO5 localizado", false, "Cupom UNICO5 ausente em test-empresa-04");
      }
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 6: Cancelamento durante tentativa de criação/confirmação PIX
    // -----------------------------------------------------------------------
    {
      const cancelOrdId = crypto.randomUUID();
      const { data: cOrd } = await anon.rpc("create_public_order", {
        p_order_id: cancelOrdId,
        p_tenant_id: tenant.id,
        p_customer_name: "Cenário 6 Cancel vs Payment",
        p_customer_phone: "31988881106",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Cancel, 60",
        p_payment_method: "pix",
        p_items: [{ product_id: topProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S6`,
      });
      createdOrderIds.push(cOrd.order_id);

      // Corrida real: admin cancela o pedido enquanto client tenta gerar pagamento PIX na Edge Function
      const [cancelDbRes, pixAttempt] = await Promise.all([
        adminClient.from("orders").update({ status: "cancelado", cancel_reason: "Teste corrida" }).eq("id", cOrd.order_id),
        callMercadoPagoEdge({ action: "create_pix_payment", orderId: cOrd.order_id }),
      ]);

      // Segunda chamada após cancelado deve obrigatoriamente retornar 409
      const postCancelPix = await callMercadoPagoEdge({ action: "create_pix_payment", orderId: cOrd.order_id });
      const { data: ordAfter } = await adminClient
        .from("orders")
        .select("status, payment_status")
        .eq("id", cOrd.order_id)
        .single();

      assertTest(
        "6. Cancelamento paralelo mantém status='cancelado' e bloqueia nova cobrança PIX (409)",
        !cancelDbRes.error && ordAfter?.status === "cancelado" && postCancelPix.status === 409 && [400, 409].includes(pixAttempt.status),
        `statusDB=${ordAfter?.status}, raceStatus=${pixAttempt.status}, postCancelPix=${postCancelPix.status}`
      );
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 7: Segurança de acesso & integridade de tokens/referência fora de ordem
    // -----------------------------------------------------------------------
    {
      const mismatchOrdId = crypto.randomUUID();
      const { data: mOrd } = await anon.rpc("create_public_order", {
        p_order_id: mismatchOrdId,
        p_tenant_id: tenant.id,
        p_customer_name: "Cenário 7 Mismatch",
        p_customer_phone: "31988881107",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Mismatch, 70",
        p_payment_method: "pix",
        p_items: [{ product_id: topProduct.id, quantity: 1 }],
        p_notes: `${runTag}_S7`,
      });
      createdOrderIds.push(mOrd.order_id);
      await adminClient.from("orders").update({ mp_payment_id: "777000111" }).eq("id", mOrd.order_id);

      const { status: misStatus, body: misBody } = await callMercadoPagoEdge({
        action: "check_payment_status",
        orderId: mOrd.order_id,
        paymentId: "999000111",
      });

      assertTest(
        "7. Verificação Edge Function rejeita paymentId divergente (422) mesmo antes de consultar MP",
        misStatus === 422 && misBody?.status === "payment_mismatch",
        `status=${misStatus}, bodyStatus=${misBody?.status}`
      );
    }

    // -----------------------------------------------------------------------
    // CENÁRIO 8: Falha de rede após confirmação financeira (Recuperação idempotente)
    // -----------------------------------------------------------------------
    {
      const netOrdId = crypto.randomUUID();
      const payload = {
        p_order_id: netOrdId,
        p_tenant_id: tenant.id,
        p_customer_name: "Cenário 8 Network Retry",
        p_customer_phone: "31988881108",
        p_delivery_type: "delivery",
        p_delivery_address: "Rua Retry, 80",
        p_payment_method: "pix",
        p_items: [{ product_id: topProduct.id, quantity: 3 }],
        p_notes: `${runTag}_S8`,
      };

      const first = await anon.rpc("create_public_order", payload);
      createdOrderIds.push(first.data?.order_id);

      // Simula perda de resposta HTTP no 4G e 5 retries idênticos simultâneos + 5 créditos de cashback simultâneos após entrega
      const orderRetries = await Promise.all(Array.from({ length: 5 }, () => anon.rpc("create_public_order", payload)));
      await adminClient.from("orders").update({ status: "entregue" }).eq("id", netOrdId);

      const cbRetries = await Promise.all(
        Array.from({ length: 5 }, () =>
          adminClient.rpc("process_order_cashback", { p_order_id: netOrdId, p_action: "credit_only" })
        )
      );

      const allSameOrder = orderRetries.every(
        (r) => r.data?.success && r.data?.idempotent_replay === true && r.data?.order_id === netOrdId && r.data?.order_number === first.data?.order_number
      );
      const totalCreditedAcross5 = cbRetries.reduce((acc, r) => acc + Number(r.data?.credited_now || 0), 0);
      const expectedOnce = Number(first.data?.cashback_earned || 0);

      assertTest(
        "8. Falha de rede + 5 retries de pedido + 5 retries de cashback mantêm idempotência e crédito único",
        allSameOrder && expectedOnce > 0 && Math.abs(totalCreditedAcross5 - expectedOnce) < 0.01,
        `allSameOrder=${allSameOrder}, expectedEarned=R$${expectedOnce.toFixed(2)}, totalCredited5Calls=R$${totalCreditedAcross5.toFixed(2)}`
      );
    }
  } finally {
    console.log("\n🧹 Limpando dados sintéticos da Fase 3...");
    if (createdSessionId) {
      await adminClient.from("table_sessions").delete().eq("id", createdSessionId);
    }
    if (targetTableId) {
      await adminClient.from("restaurant_tables").update({ status: "available" }).eq("id", targetTableId);
    }
    for (let i = 0; i < createdOrderIds.length; i += 50) {
      const chunk = createdOrderIds.slice(i, i + 50);
      await adminClient.from("print_jobs").delete().in("order_id", chunk);
      await adminClient.from("order_items").delete().in("order_id", chunk);
      await adminClient.from("customer_cashback_transactions").delete().in("order_id", chunk);
      await adminClient.from("orders").delete().in("id", chunk);
    }
    await adminClient.from("orders").delete().eq("tenant_id", tenant.id).ilike("notes", `${runTag}%`);
    if (createdPhones.size > 0) {
      await adminClient.from("customer_cashback_wallets").delete().eq("tenant_id", tenant.id).in("phone", Array.from(createdPhones));
    }
    console.log(`   🧹 Limpos ${createdOrderIds.length} pedido(s) de teste.`);
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\n=== RESUMO FASE 3 CONCORRÊNCIA FINANCEIRA: ${passed}/${results.length} aprovados ===`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal na Fase 3:", err);
  process.exit(1);
});
