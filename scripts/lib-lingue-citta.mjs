// Le 4 lingue di pre-arricchimento di una citta' (22/09/2026, committente: «lingue 4»):
// la lingua del posto se e' una delle 7 dell'app, poi italiano, inglese, spagnolo,
// francese, tedesco in quest'ordine fino a 4. Le altre lingue dell'app (e quelle
// dei paesi che non ne parlano nessuna: Polonia, Giappone, Turchia…) si traducono
// al volo alla prima apertura. Usato da esporta-lista-citta.mjs e prearricchisci-citta.mjs.
export const LINGUA_PAESE = {
  IT: 'it', SM: 'it', VA: 'it',
  GB: 'en', IE: 'en', US: 'en', CA: 'en', AU: 'en', NZ: 'en', MT: 'en', JM: 'en', TT: 'en', BB: 'en', BS: 'en', BZ: 'en', GY: 'en', GI: 'en', IM: 'en', JE: 'en', GG: 'en', BM: 'en', KY: 'en', VG: 'en', AG: 'en', DM: 'en', GD: 'en', KN: 'en', LC: 'en', VC: 'en', SG: 'en', PH: 'en', IN: 'en', PK: 'en', BD: 'en', LK: 'en', MY: 'en', HK: 'en',
  FR: 'fr', MC: 'fr', LU: 'fr', BE: 'fr', CH: 'fr', HT: 'fr', GP: 'fr', MQ: 'fr', GF: 'fr', PM: 'fr', BL: 'fr', MF: 'fr', LB: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', PE: 'es', VE: 'es', CL: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PR: 'es', AD: 'es',
  DE: 'de', AT: 'de', LI: 'de',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru',
  CN: 'zh', TW: 'zh', MO: 'zh',
};
// (22/09/2026 sera, committente: «fallo per tutte le 7 lingue») Tutte e sette le lingue
// dell'app per ogni citta', la lingua del posto per prima (fase 0), poi le altre in ordine.
const ORDINE = ['it', 'en', 'es', 'fr', 'de', 'ru', 'zh'];
export function lingueCitta(iso) {
  const out = [];
  const locale = LINGUA_PAESE[String(iso || '').toUpperCase()];
  if (locale) out.push(locale);
  for (const l of ORDINE) { if (!out.includes(l)) out.push(l); }
  return out;
}
// Raggio in km dalla popolazione: le metropoli sono larghe, i paesi no.
export const raggioKm = (pop) => pop >= 3_000_000 ? 10 : pop >= 1_000_000 ? 7 : pop >= 300_000 ? 5 : 3;
