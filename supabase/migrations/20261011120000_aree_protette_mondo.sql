-- AREE PROTETTE NEL MONDO (11/10/2026, committente: «deve essere in tutto il mondo — usa quelli che funzionano,
-- Stati Uniti ecc.»; «Procedi» alla modifica della tabella).
--
-- Fino a oggi `aree_protette_cache` conteneva solo l'Europa (EEA: Natura 2000 + CDDA). Fuori Europa NON si usa
-- WDPA / Protected Planet (uso commerciale e ridistribuzione vietati senza permesso scritto di UNEP-WCMC): si
-- caricano le FONTI PRIMARIE nazionali con licenza aperta (elenco e frasi di licenza in
-- store/ricerche/aree-protette-fonti-*.md) e, dove mancano, OpenStreetMap (ODbL).
--
-- Cosa cambia:
--  1. `fonte`: da dove viene la riga ('eea' per tutto ciò che c'era). Il fumetto scrive l'attribuzione giusta.
--  2. `geom_lontano`: lo stesso confine già alleggerito a ~1 km, per le viste larghe (da un continente intero non
--     si semplifica al volo un parco dell'Alaska a ogni richiesta).
--  3. RPC NUOVA `aree_protette_mondo`: dalla più GRANDE alla più piccola (la vecchia dava le 200 più piccole: da
--     lontano spariva proprio il parco nazionale), scarta le aree troppo piccole per la vista (`p_min_kmq`), e
--     filtra sul riquadro d'ingombro (`&&`) senza aprire ogni poligono.
--  4. La RPC VECCHIA `aree_protette_vicine` resta e risponde SOLO con le righe EEA: le build già installate
--     scrivono «Fonte: Agenzia Europea dell'Ambiente» in ogni fumetto, e non devono mostrarlo su dati altrui.
-- Ritorno indietro: il client torna a chiamare la RPC vecchia; delete from aree_protette_cache where fonte <> 'eea'.

alter table public.aree_protette_cache add column if not exists fonte text not null default 'eea';
alter table public.aree_protette_cache add column if not exists geom_lontano geometry(Geometry, 4326);
create index if not exists idx_aree_protette_cache_fonte on public.aree_protette_cache (fonte);

comment on column public.aree_protette_cache.fonte is
  'Origine della riga: eea (Natura2000/CDDA), ca (CPCAD), au (CAPAD), nz (DOC), us (PAD-US), … , osm. Decide l''attribuzione nel fumetto.';
comment on column public.aree_protette_cache.geom_lontano is
  'Confine alleggerito a ~0,01° per le viste larghe (p_semplifica_m >= 800). Null = si usa geom.';

create or replace function public.aree_protette_vicine(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_semplifica_m float8 default 0, p_limit integer default 200
)
returns table(id text, tipo text, codice text, nome text, kmq numeric, iucn text, designazione text, paese text, geometria text)
language sql stable
set statement_timeout to '10s'
as $$
  select a.id, a.tipo, a.codice, a.nome, a.kmq, a.iucn, a.designazione, a.paese,
    st_asgeojson(
      case when p_semplifica_m > 0
        then st_simplifypreservetopology(a.geom, p_semplifica_m / 111320.0)
        else a.geom
      end
    ) as geometria
  from public.aree_protette_cache a
  where a.fonte = 'eea'
    and st_intersects(a.geom, st_makeenvelope(p_west, p_south, p_east, p_north, 4326))
  order by coalesce(a.kmq, 0) asc
  limit greatest(coalesce(p_limit, 200), 1);
$$;

create or replace function public.aree_protette_mondo(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_semplifica_m float8 default 0, p_min_kmq float8 default 0, p_limit integer default 240
)
returns table(id text, tipo text, codice text, nome text, kmq numeric, iucn text, designazione text, paese text, fonte text, geometria text)
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
  select a.id, a.tipo, a.codice, a.nome, a.kmq, a.iucn, a.designazione, a.paese, a.fonte,
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
grant execute on function public.aree_protette_mondo(float8, float8, float8, float8, float8, float8, integer) to anon, authenticated;
