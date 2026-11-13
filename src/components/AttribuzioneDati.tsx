/**
 * DA DOVE VENGONO QUESTI DATI
 * ===========================
 * La riga di provenienza in fondo alla scheda del POI. Gemella di
 * `AttribuzioneFoto`, ma per il DATO e non per l'immagine: nome del luogo,
 * coordinate, profondita', sviluppo — le cose che non abbiamo rilevato noi.
 *
 * Perche' esiste (02/09/2026). Wikicaves, l'associazione che gestisce
 * Grottocenter, ci ha scritto contestando l'uso dei loro dati sulle grotte
 * (129.508 POI con `source='grottocenter'`, presi dalle loro API pubbliche).
 * Citare la fonte e' il minimo che qualunque licenza aperta chiede, e mancava.
 *
 * ATTENZIONE, pero': l'obiezione di Wikicaves NON era l'attribuzione, era che
 * il nostro sito richiede il login per accedere. Questa riga e' necessaria ma
 * NON sufficiente a chiudere quella contestazione — vedi la memoria di
 * sessione. Non considerare il caso risolto solo perche' il credito c'e'.
 *
 * Regola di composizione: si cita SOLO cio' che sappiamo. Nessun nome di
 * licenza viene scritto qui se non e' stato verificato sulla fonte: una
 * licenza sbagliata in calce e' peggio di nessuna licenza, perche' afferma un
 * diritto che non abbiamo controllato.
 */
import { memo } from 'react';

/**
 * Fonti riconosciute. La chiave e' il valore di `shared_pois.source`.
 * `etichetta`: cosa viene dalla fonte ("Dati della cavita'", "Scheda e foto"...).
 * `licenza`: SOLO se verificata sulla fonte, vedi regola qui sopra.
 */
const FONTI: Record<string, {
  nome: string; url: string; nota?: string; etichetta?: string; licenza?: string;
}> = {
  grottocenter: {
    nome: 'Grottocenter',
    url: 'https://www.grottocenter.org',
    nota: 'Associazione Wikicaves',
    etichetta: 'Dati della cavita\' da',
  },
  // Rijksdienst voor het Cultureel Erfgoed: registro nazionale olandese dei
  // monumenti. Licenza VERIFICATA il 03/09/2026 su beeldbank.cultureelerfgoed.nl
  // — CC-BY-SA 4.0, che l'attribuzione la richiede esplicitamente.
  rce_nl: {
    nome: 'Rijksdienst voor het Cultureel Erfgoed',
    url: 'https://www.cultureelerfgoed.nl',
    etichetta: 'Scheda e foto da',
    licenza: 'CC BY-SA 4.0',
  },
  // National Register of Historic Places, National Park Service. Licenza
  // VERIFICATA il 03/09/2026: i metadati del servizio danno access constraints
  // "None" e non rivendicano copyright (opera del governo federale USA, 17
  // U.S.C. 105). ATTENZIONE: nps.gov/aboutus/disclaimer.htm chiede che «when
  // such information is published or republished COMMERCIALLY [...] the
  // copyright notice must include a reference to the original U.S. Government
  // work» — per un'app a pagamento come la nostra il credito qui sotto non e'
  // cortesia, e' la condizione d'uso.
  nps_nrhp: {
    nome: 'National Register of Historic Places',
    url: 'https://www.nps.gov/subjects/nationalregister/',
    nota: 'National Park Service, opera del governo federale USA',
    etichetta: 'Dati del vincolo da',
    licenza: 'pubblico dominio',
  },
  // National Heritage List for England, Historic England. Licenza VERIFICATA
  // il 03/09/2026 nel campo `copyrightText` del FeatureServer ufficiale
  // (owner gis_historicengland): «© Crown Copyright 2026. Contains Ordnance
  // Survey data © Crown copyright and database right 2026. Released under
  // OGL.» La OGL v3 impone la citazione della fonte e la conservazione
  // dell'avviso di copyright: il credito qui sotto e' una CONDIZIONE d'uso.
  // Il riferimento a Ordnance Survey va tenuto perche' riguarda le coordinate,
  // che sono esattamente cio' che importiamo.
  he_nhle: {
    nome: 'Historic England — National Heritage List for England',
    url: 'https://historicengland.org.uk/listing/the-list/',
    nota: '© Crown Copyright. Contains Ordnance Survey data © Crown copyright and database right',
    etichetta: 'Dati del vincolo da',
    licenza: 'OGL v3',
  },
  // SPAGNA. Non esiste un registro BIC nazionale scaricabile (il ministero
  // pubblica solo un motore di ricerca), quindi il dato viene dalle comunita'
  // autonome: due fonti, due crediti distinti. Entrambe CC BY, che
  // l'attribuzione la impone.
  //
  // Instituto Andaluz del Patrimonio Historico — "Localizador Cartografico
  // del Patrimonio Cultural Andaluz". Licenza VERIFICATA il 03/09/2026 sulla
  // scheda del dataset nel portale open data della Junta de Andalucia.
  iaph_es: {
    nome: 'Instituto Andaluz del Patrimonio Histórico',
    url: 'https://www.iaph.es',
    nota: 'Junta de Andalucía',
    etichetta: 'Dati del vincolo da',
    licenza: 'CC BY',
  },
  // Gobierno de Aragon — "Bienes de Interes Cultural: informacion geografica".
  // Licenza VERIFICATA il 03/09/2026 su datos.gob.es (CC BY 4.0). Le coordinate
  // native sono UTM ETRS89 fuso 30N, convertite in WGS84 in fase di import.
  aragon_es: {
    nome: 'Gobierno de Aragón',
    url: 'https://opendata.aragon.es',
    nota: 'IDEAragón',
    etichetta: 'Dati del vincolo da',
    licenza: 'CC BY 4.0',
  },
};

interface Props {
  /** shared_pois.source */
  source?: string | null;
  className?: string;
}

function AttribuzioneDati({ source, className = '' }: Props) {
  const chiave = String(source || '').trim().toLowerCase();
  const f = FONTI[chiave];
  // Fonte non in tabella (o assente): nessuna riga. Non si inventa un credito
  // generico tipo "fonti aperte": non direbbe niente a nessuno.
  if (!f) return null;

  return (
    <p className={`text-[10px] leading-snug text-[#1e3a8a]/50 mb-6 px-1 ${className}`}>
      {f.etichetta || 'Dati da'}{' '}
      <a
        href={f.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-bold text-[#1e3a8a]/70"
      >
        {f.nome}
      </a>
      {f.nota ? ` (${f.nota})` : ''}
      {f.licenza ? ` — ${f.licenza}` : ''}
    </p>
  );
}

export default memo(AttribuzioneDati);
