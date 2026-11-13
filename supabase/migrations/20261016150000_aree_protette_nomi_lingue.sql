-- AREE PROTETTE: IL NOME NELLA LINGUA DELL'UTENTE (16/10/2026, committente: «finalizza le aree protette e le specie»).
--
-- Verifica del 16/10 su 9 punti del mondo: il Serengeti si chiamava «Serengečio nacionalinis parkas» (l'etichetta
-- `name:it` di OpenStreetMap era lituana), il Baikal in cirillico e Pechino in cinese per tutti. Una riga aveva UN
-- nome solo, scelto all'import.
--
--  1. `nomi` jsonb: {"IT": "...", "EN": "...", "FR": ..., "ES", "DE", "RU", "ZH"} — dalle etichette di Wikidata
--     (il `codice` delle righe OSM è il QID) e, per la Russia, dal NAME_EN della fonte. Null = si usa `nome`.
--  2. RPC NUOVA `aree_protette_mondo_v2`: la stessa di `aree_protette_mondo` più `nomi`. La vecchia resta com'è
--     (le build installate la chiamano e un cambio del tipo di ritorno richiederebbe DROP).
-- Ritorno indietro: il client torna alla RPC vecchia; alter table … drop column nomi.

alter table public.aree_protette_cache add column if not exists nomi jsonb;
comment on column public.aree_protette_cache.nomi is
  'Nome per lingua dell''app (IT EN FR ES DE RU ZH), da Wikidata / fonte. Null = si usa nome.';

create or replace function public.aree_protette_mondo_v2(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_semplifica_m float8 default 0, p_min_kmq float8 default 0, p_limit integer default 240
)
returns table(id text, tipo text, codice text, nome text, nomi jsonb, kmq numeric, iucn text, designazione text, paese text, fonte text, geometria text)
language sql stable
set statement_timeout to '10s'
as $$
  with scelte as (
    select a.id
    from public.aree_protette_cache a
    where a.geom && st_makeenvelope(p_west, p_south, p_east, p_north, 4326)
      and (coalesce(p_min_kmq, 0) <= 0 or a.kmq is null or a.kmq >= p_min_kmq)
    order by coalesce(a.kmq, 0) desc
    limit greatest(coalesce(p_limit, 240), 1)
  )
  select a.id, a.tipo, a.codice, a.nome, a.nomi, a.kmq, a.iucn, a.designazione, a.paese, a.fonte,
    st_asgeojson(
      case
        when p_semplifica_m >= 800 and a.geom_lontano is not null
          then st_simplifypreservetopology(a.geom_lontano, p_semplifica_m / 111320.0)
        when p_semplifica_m > 0
          then st_simplifypreservetopology(a.geom, p_semplifica_m / 111320.0)
        else a.geom
      end, 5
    ) as geometria
  from scelte s join public.aree_protette_cache a on a.id = s.id
  order by coalesce(a.kmq, 0) desc;
$$;
grant execute on function public.aree_protette_mondo_v2(float8, float8, float8, float8, float8, float8, integer) to anon, authenticated;
