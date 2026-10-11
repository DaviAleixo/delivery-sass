import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Image compressor: resizes image on canvas and converts to WebP format.
 * Target size: 50-150KB, max dimension: 800px (or 1400px for banners).
 */
async function compressImageToWebP(file, maxDimension = 800, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, dataUrl: canvas.toDataURL("image/webp", quality) });
            } else {
              resolve({ blob: file, dataUrl: e.target.result });
            }
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => resolve({ blob: file, dataUrl: e.target.result });
      img.src = e.target.result;
    };
    reader.onerror = () => resolve({ blob: file, dataUrl: "" });
    reader.readAsDataURL(file);
  });
}

/**
 * UploadFile:
 * 1. Resizes & compresses image to WebP format.
 * 2. Uploads to Supabase Storage 'restaurant-images' public bucket.
 * 3. Returns the public CDN URL with long cache-control header.
 */
export async function UploadFile({ file, maxDimension = 800, tenantId = null }) {
  if (!file) {
    throw new Error("No file provided");
  }

  const { blob, dataUrl } = await compressImageToWebP(file, maxDimension);

  if (isSupabaseConfigured() && supabase && blob) {
    try {
      const ext = "webp";
      const cleanName = file.name ? file.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20) : "image";
      const activeTenant = tenantId || (typeof window !== "undefined" ? localStorage.getItem("current_tenant_id") : null) || "global";
      const cleanTenant = String(activeTenant).replace(/[^a-zA-Z0-9_-]/g, "");
      const filePath = `tenants/${cleanTenant}/uploads/${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${cleanName}.${ext}`;

      const { data, error } = await supabase.storage
        .from("restaurant-images")
        .upload(filePath, blob, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: true,
        });

      if (!error && data?.path) {
        const { data: publicData } = supabase.storage
          .from("restaurant-images")
          .getPublicUrl(data.path);

        if (publicData?.publicUrl) {
          return { file_url: publicData.publicUrl };
        }
      } else if (error) {
        console.warn("[Supabase Storage] Erro no upload para restaurant-images:", error.message || error);
      }
    } catch (err) {
      console.warn("[Storage Upload] Fallback para local após erro:", err);
    }
  }

  return { file_url: dataUrl };
}
