import { supabase } from "@/integrations/supabase/client";

export const PHOTO_BUCKET = "student-photos";
const SIGNED_TTL = 60 * 60 * 24 * 7; // 7 days (max for signed URLs)

/** Extract the storage path from a stored selfie_url value (path, public URL, or signed URL). */
export function extractPhotoPath(v?: string | null): string {
  if (!v) return "";
  if (v.startsWith("data:")) return "";
  if (v.startsWith("http")) {
    const m = v.match(/student-photos\/(.+?)(?:\?|$)/);
    return m ? decodeURIComponent(m[1]) : "";
  }
  return v;
}

/** Resolve a stored selfie_url (path or legacy URL) into a fresh, viewable signed URL. */
export async function resolvePhotoUrl(v?: string | null): Promise<string> {
  if (!v) return "";
  if (v.startsWith("data:")) return v;
  const path = extractPhotoPath(v);
  if (!path) return v.startsWith("http") ? v : "";
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_TTL);
  return error ? "" : data.signedUrl;
}
