// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.540.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Sem credenciais hardcoded no código-fonte: configurar exclusivamente via Supabase Edge Function Secrets
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") || "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") || "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME") || "pedemuleke-media";
const R2_PUBLIC_URL = (Deno.env.get("R2_PUBLIC_URL") || "https://pub-90fee729d11445a3b3a6aa0958f66fc8.r2.dev").replace(/\/+$/, "");

const ALLOWED_IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

function sanitizeName(name: string): string {
  return String(name || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método não permitido." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Autenticação JWT obrigatória (bloqueia anônimos)
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Autenticação obrigatória para enviar imagens." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userRes, error: authErr } = await supabaseAdmin.auth.getUser(jwt);
    if (authErr || !userRes?.user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida ou expirada." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: adminProfile } = await supabaseAdmin
      .from("tenant_admins")
      .select("tenant_id, role, is_active")
      .eq("user_id", userRes.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminProfile) {
      return new Response(
        JSON.stringify({ error: "Apenas usuários administrativos autorizados podem fazer upload." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let fileBuffer: Uint8Array | null = null;
    let fileName = "upload.webp";
    let mimeType = "image/webp";
    let requestedTenantId = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const fileEntry = formData.get("file");
      requestedTenantId = String(formData.get("tenantId") || "");

      if (fileEntry && typeof fileEntry === "object" && "arrayBuffer" in fileEntry) {
        const file = fileEntry as File;
        fileName = file.name || "upload.webp";
        mimeType = String(file.type || "").toLowerCase();
        fileBuffer = new Uint8Array(await file.arrayBuffer());
      }
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      requestedTenantId = String(body.tenantId || "");
      fileName = String(body.fileName || "upload.webp");
      mimeType = String(body.mimeType || "image/webp").toLowerCase();

      if (body.dataUrl) {
        const matches = String(body.dataUrl).match(/^data:([A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1].toLowerCase();
          const binaryStr = atob(matches[2]);
          fileBuffer = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            fileBuffer[i] = binaryStr.charCodeAt(i);
          }
        }
      } else if (body.base64) {
        const binaryStr = atob(String(body.base64));
        fileBuffer = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          fileBuffer[i] = binaryStr.charCodeAt(i);
        }
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum arquivo válido fornecido para upload." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (fileBuffer.length > MAX_UPLOAD_BYTES) {
      return new Response(
        JSON.stringify({ error: "Imagem excede o limite máximo de 5 MB." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Whitelist estrita de imagens (bloqueia .html, .svg, .js, etc.)
    const safeExt = ALLOWED_IMAGE_MIME_TO_EXT[mimeType];
    if (!safeExt) {
      return new Response(
        JSON.stringify({ error: "Formato não permitido. Apenas imagens WEBP, PNG e JPG são aceitas." }),
        { status: 415, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Isolamento cross-tenant no diretório de destino
    const effectiveTenantId = adminProfile.role === "super_admin"
      ? (requestedTenantId || "global")
      : String(adminProfile.tenant_id || "");

    if (adminProfile.role !== "super_admin" && requestedTenantId && requestedTenantId !== adminProfile.tenant_id) {
      return new Response(
        JSON.stringify({ error: "Acesso negado: upload para outra empresa não permitido." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      return new Response(
        JSON.stringify({ error: "Credenciais Cloudflare R2 não configuradas nos Secrets do servidor." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    const cleanTenant = sanitizeName(effectiveTenantId || "global");
    const cleanFileName = sanitizeName(fileName.replace(/\.[^/.]+$/, ""));
    const uniqueId = crypto.randomUUID().slice(0, 8);
    const filePath = `tenants/${cleanTenant}/uploads/${Date.now()}_${uniqueId}_${cleanFileName}.${safeExt}`;

    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: filePath,
      Body: fileBuffer,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    });

    await r2Client.send(putCommand);

    const publicUrl = `${R2_PUBLIC_URL}/${filePath}`;
    return new Response(
      JSON.stringify({
        success: true,
        file_url: publicUrl,
        key: filePath,
        size: fileBuffer.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Cloudflare R2 Upload Error]:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao enviar imagem." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
