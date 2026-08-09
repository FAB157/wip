import { supabase } from './supabase';

/**
 * Risolve la foto di una scheda Vision in un URL visualizzabile.
 * Il server salva in vision_cards.photo_url un PATH del bucket privato
 * vision-photos ("<uid>/<card>.jpg"): qui si firma (1h) con la policy
 * "vision_photos_owner_read". Fallback: URL pubblico (bucket non ancora
 * privato, prima della migration fase 2) o URL legacy completo.
 */
export async function resolveVisionPhotoUrl(photoUrl: string | null | undefined): Promise<string | null> {
  if (!photoUrl) return null;
  if (/^data:/i.test(photoUrl)) return photoUrl;

  let path = photoUrl;
  if (/^https?:\/\//i.test(photoUrl)) {
    const m = photoUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/vision-photos\/([^?]+)/);
    if (!m) return photoUrl; // URL esterno o di un altro bucket: usalo com'è
    path = decodeURIComponent(m[1]);
  }

  try {
    const { data } = await supabase.storage.from('vision-photos').createSignedUrl(path, 3600);
    if (data?.signedUrl) return data.signedUrl;
  } catch { /* firma non disponibile: prova il pubblico */ }
  try {
    return supabase.storage.from('vision-photos').getPublicUrl(path).data.publicUrl;
  } catch {
    return /^https?:\/\//i.test(photoUrl) ? photoUrl : null;
  }
}
