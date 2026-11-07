-- LINGUA E PAESE DI OGNI RISCATTO (12/10/2026, committente: statistica per coupon da mandare all'hotel con
-- «nome e iniziale, lingua e paese»).
--
-- /api/coupon/redeem scrive qui la lingua della pagina da cui si riscatta e il paese dell'indirizzo di rete.
-- Due colonne nullable su una tabella piccola: nessuna riscrittura, nessun indice. Finché non ci sono, la rotta
-- registra il riscatto come prima (senza i due valori) e la statistica mostra «—».
-- Ritorno indietro: alter table public.coupon_redemptions drop column lingua, drop column paese;

alter table public.coupon_redemptions add column if not exists lingua text;
alter table public.coupon_redemptions add column if not exists paese text;

comment on column public.coupon_redemptions.lingua is 'Lingua della pagina al momento del riscatto (IT, EN…).';
comment on column public.coupon_redemptions.paese is 'Paese dell''indirizzo di rete al riscatto (ISO a due lettere, da x-vercel-ip-country).';
