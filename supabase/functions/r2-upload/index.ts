import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.540.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Configurações do Cloudflare R2
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") || "eeb3a4e1bf264227d2ea7419ec833f80";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") || "b4cfbd9041e298754df958859021f65b";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") || "c2eb33f38697b08e38d65623d32f5d7d806ad87e6a7cec85daebf79b9c55388a";
const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME") || "pedemuleke-media";
const R2_PUBLIC_URL = (Deno.env.get("R2_PUBLIC_URL") || "https://pub-90fee729d11445a3b3a6aa0958f66fc8.r2.dev").replace(/\/+$/, "");

// Cliente S3 configurado para a Cloudflare R2
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let fileBuffer: Uint8Array | null = null;
    let fileName = "upload.webp";
    let mimeType = "image/webp";
    let tenantId = "global";

    // Suporte 1: multipart/form-data
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const fileEntry = formData.get("file");
      tenantId = (formData.get("tenantId") as string) || "global";

      if (fileEntry && typeof fileEntry === "object" && "arrayBuffer" in fileEntry) {
        const file = fileEntry as File;
        fileName = file.name || "upload.webp";
        mimeType = file.type || "image/webp";
        const buffer = await file.arrayBuffer();
        fileBuffer = new Uint8Array(buffer);
      }
    } 
    // Suporte 2: JSON payload (com dataUrl ou base64)
    else if (contentType.includes("application/json")) {
      const body = await req.json();
      tenantId = body.tenantId || "global";
      fileName = body.fileName || "upload.webp";
      mimeType = body.mimeType || "image/webp";

      if (body.dataUrl) {
        const matches = body.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          mimeType = matches[1];
          const binaryStr = atob(matches[2]);
          fileBuffer = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            fileBuffer[i] = binaryStr.charCodeAt(i);
          }
        }
      } else if (body.base64) {
        const binaryStr = atob(body.base64);
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

    // Organização de pastas no R2 por tenant
    const cleanTenant = sanitizeName(tenantId);
    const cleanFileName = sanitizeName(fileName.replace(/\.[^/.]+$/, ""));
    const isWebP = mimeType.includes("webp") || fileName.endsWith(".webp");
    const ext = isWebP ? "webp" : (fileName.includes(".") ? fileName.split(".").pop() : "webp");
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const filePath = `tenants/${cleanTenant}/uploads/${Date.now()}_${uniqueId}_${cleanFileName}.${ext}`;

    // Upload direto para o Cloudflare R2
    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: filePath,
      Body: fileBuffer,
      ContentType: isWebP ? "image/webp" : mimeType,
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
      JSON.stringify({
        error: error.message || "Erro interno ao enviar para o Cloudflare R2",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
