import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import {
  Youtube, Instagram, Facebook, Music2, Globe2, RefreshCw, ExternalLink,
  KeyRound, AlertTriangle, Save, Share2, Euro, Activity, Smartphone, TrendingUp,
  Headphones, Star, MapPin, Megaphone, Target
} from 'lucide-react';

// ── SCHEDA "SOCIAL": cruscotto del lancio ───────────────────────────────
// Canali social, visite sito, ricavi, uso dell'app e install in un'unica
// vista. I profili sono appena nati: il caso "tutto a zero" è la norma e
// deve sembrare un cruscotto pronto, non un errore. Le fonti senza chiave
// mostrano la nota su come ottenerla, mai un allarme rosso.

const adminAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const numeroIt = (n: any) => Number(n ?? 0).toLocaleString('it-IT');
const euroIt = (n: any, valuta = 'EUR') =>
  Number(n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: valuta || 'EUR' });

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-black uppercase tracking-wider text-primary/50">{titolo}</h3>
      {children}
    </div>
  );
}

function CardBox({ icona, titolo, colore, children }: { icona: React.ReactNode; titolo: string; colore: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl p-4 border border-outline-variant space-y-3 min-w-0">
      <div className="flex items-center gap-2">
        <span className={colore}>{icona}</span>
        <h4 className="font-black text-primary text-sm">{titolo}</h4>
      </div>
      {children}
    </div>
  );
}

// Fonte non configurata: istruzioni, non allarme.
function ChiaveMancante({ nota }: { nota?: string }) {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
      <KeyRound className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-[11px] text-amber-800 font-medium leading-relaxed">{nota || 'Chiave API non configurata.'}</p>
    </div>
  );
}

function Errore({ errore }: { errore?: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
      <p className="text-[11px] text-red-700 font-bold break-words">{errore || 'Errore sconosciuto'}</p>
    </div>
  );
}

function Metrica({ etichetta, valore, sub }: { etichetta: string; valore: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-surface-variant/40 rounded-xl px-3 py-2 min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-primary/50">{etichetta}</p>
      <p className="text-lg font-black text-primary truncate">{valore}</p>
      {sub && <p className="text-[10px] font-medium text-on-surface-variant truncate">{sub}</p>}
    </div>
  );
}

// Confronto 7gg vs 30gg affiancato, il pattern ricorrente del cruscotto.
function Confronto({ etichetta, v7, v30 }: { etichetta: string; v7: React.ReactNode; v30: React.ReactNode }) {
  return (
    <div className="bg-surface-variant/40 rounded-xl px-3 py-2 min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-primary/50">{etichetta}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-black text-primary">{v7}</span>
        <span className="text-[10px] font-bold text-on-surface-variant">7gg</span>
        <span className="text-sm font-black text-primary/60 ml-auto">{v30}</span>
        <span className="text-[10px] font-bold text-on-surface-variant">30gg</span>
      </div>
    </div>
  );
}

function LinkProfilo({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary/60 hover:text-primary underline">
      Apri il profilo <ExternalLink className="w-3 h-3" />
    </a>
  );
}

// Stelline recensioni (1-5), piene + vuote.
function Stelle({ n }: { n: number }) {
  const piene = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0" aria-label={`${piene} stelle su 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3.5 h-3.5 ${i <= piene ? 'text-amber-400 fill-amber-400' : 'text-outline-variant'}`} />
      ))}
    </span>
  );
}

// Sezione predisposta ma non ancora attiva: riquadro grigio tratteggiato,
// dichiaratamente "in arrivo" — né errore né chiave mancante.
function RiquadroFuturo({ icona, titolo, testo }: { icona: React.ReactNode; titolo: string; testo: string }) {
  return (
    <div className="bg-surface-variant/30 border border-dashed border-outline-variant rounded-2xl p-4 space-y-1.5 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-on-surface-variant/60">{icona}</span>
        <h4 className="font-black text-sm text-on-surface-variant">{titolo}</h4>
        <span className="ml-auto text-[9px] font-black uppercase tracking-wider bg-surface-variant/70 text-on-surface-variant/70 rounded-full px-2 py-0.5">In arrivo</span>
      </div>
      <p className="text-[11px] font-medium text-on-surface-variant/80 leading-relaxed">{testo}</p>
    </div>
  );
}

const ETICHETTE_FUNNEL: Record<string, string> = {
  audioguide_generated: 'Audioguide generate',
  credits_purchased: 'Acquisti crediti',
  quota_exceeded: 'Quote esaurite (429)',
};

export default function AdminSocialStats() {
  const [dati, setDati] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  // Form manuale TikTok
  const [tkForm, setTkForm] = useState({ follower: '', miPiace: '', video: '' });
  const [salvandoTk, setSalvandoTk] = useState(false);

  const load = useCallback(async (fresh: boolean) => {
    if (fresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/admin/social-stats${fresh ? '?fresh=1' : ''}`), { headers: await adminAuthHeaders() });
      if (res.ok) {
        const d = await res.json();
        setDati(d);
        const tk = d?.tiktok;
        setTkForm({
          follower: String(tk?.follower ?? 0),
          miPiace: String(tk?.miPiace ?? 0),
          video: String(tk?.video ?? 0),
        });
      }
    } catch { /* rete giù: resta l'ultimo stato */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(false); }, [load]);

  const salvaTikTok = async () => {
    setSalvandoTk(true);
    setMessaggio(null);
    try {
      const res = await fetch(getApiUrl('/api/admin/social-stats/manual'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await adminAuthHeaders()) },
        body: JSON.stringify({ tiktok: { follower: Number(tkForm.follower) || 0, miPiace: Number(tkForm.miPiace) || 0, video: Number(tkForm.video) || 0 } }),
      });
      if (res.ok) {
        setMessaggio('Numeri TikTok salvati.');
        await load(true);
      } else {
        setMessaggio('Salvataggio fallito, riprova.');
      }
    } catch {
      setMessaggio('Salvataggio fallito, riprova.');
    }
    setSalvandoTk(false);
  };

  const yt = dati?.youtube;
  const meta = dati?.meta;
  const ig = meta?.instagram;
  const tk = dati?.tiktok;
  const sito = dati?.sito;
  const ricavi = dati?.ricavi;
  const usoApp = dati?.usoApp;
  const funnel = dati?.funnel;
  const instAndroid = dati?.installAndroid;
  const instIos = dati?.installIos;
  const ascolti = dati?.ascolti;
  const recensioni = dati?.recensioni;

  const tuttoAZero = yt?.stato === 'ok' && Number(yt.iscritti) === 0 && Number(yt.numeroVideo) === 0
    && (meta?.stato !== 'ok' || Number(meta.follower) === 0)
    && Number(tk?.follower ?? 0) === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-primary flex items-center gap-2">
            <Share2 className="w-6 h-6 text-secondary" />
            Social & Lancio
          </h2>
          <p className="text-sm text-on-surface-variant font-medium mt-1">
            Canali social, visite, ricavi, uso dell'app e install in un colpo d'occhio. Dati in cache per 1 ora.
            {dati?.generatoIl && (
              <span className="opacity-70"> Aggiornati alle {new Date(dati.generatoIl).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{dati.dallaCache ? ' (cache)' : ''}.</span>
            )}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="self-start px-5 py-2.5 rounded-xl bg-primary text-white font-black text-sm uppercase tracking-wider flex items-center gap-2 shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Aggiorna
        </button>
      </div>

      {messaggio && (
        <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-100 text-sm font-bold">{messaggio}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm font-bold text-on-surface-variant/70">Carico il cruscotto del lancio…</div>
      ) : !dati ? (
        <div className="py-16 text-center text-sm font-bold text-on-surface-variant/70">Statistiche non raggiungibili: controlla la connessione e riprova.</div>
      ) : (
        <>
          {tuttoAZero && (
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 text-sm font-medium text-blue-900">
              🌱 I profili sono appena nati: normale che sia tutto a zero. Il cruscotto si popolerà da solo man mano che arrivano follower, visite e acquisti.
            </div>
          )}

          {/* ── CANALI SOCIAL ─────────────────────────────────────────── */}
          <Sezione titolo="Canali social">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* YOUTUBE */}
              <CardBox icona={<Youtube className="w-5 h-5" />} titolo="YouTube — @wipguide" colore="text-red-600">
                {yt?.stato === 'chiave_mancante' ? (
                  <ChiaveMancante nota={yt.nota} />
                ) : yt?.stato === 'errore' ? (
                  <Errore errore={yt.errore} />
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Metrica etichetta="Iscritti" valore={numeroIt(yt?.iscritti)} />
                      <Metrica etichetta="Views totali" valore={numeroIt(yt?.viewsTotali)} />
                      <Metrica etichetta="Video" valore={numeroIt(yt?.numeroVideo)} />
                    </div>
                    {(yt?.video || []).length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-primary/50">Ultimi video</p>
                        {(yt.video || []).map((v: any) => (
                          <a key={v.id} href={v.url} target="_blank" rel="noreferrer"
                            className="flex items-center justify-between gap-2 text-[11px] font-bold text-primary bg-surface-variant/40 rounded-lg px-2.5 py-1.5 hover:bg-surface-variant/70 transition-colors">
                            <span className="truncate">{v.titolo}</span>
                            <span className="shrink-0 text-primary/60 font-medium">{numeroIt(v.views)} views</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-on-surface-variant italic">Nessun video pubblicato ancora.</p>
                    )}
                  </>
                )}
                <LinkProfilo url={yt?.profilo || 'https://www.youtube.com/@wipguide'} />
              </CardBox>

              {/* INSTAGRAM (dall'account business collegato alla pagina FB) */}
              <CardBox icona={<Instagram className="w-5 h-5" />} titolo="Instagram — @wipguide" colore="text-pink-600">
                {meta?.stato === 'chiave_mancante' ? (
                  <ChiaveMancante nota={meta.nota} />
                ) : meta?.stato === 'errore' ? (
                  <Errore errore={meta.errore} />
                ) : ig?.stato === 'chiave_mancante' ? (
                  <ChiaveMancante nota={ig.nota} />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Metrica etichetta="Follower" valore={numeroIt(ig?.follower)} />
                    <Metrica etichetta="Post" valore={numeroIt(ig?.post)} />
                  </div>
                )}
                <LinkProfilo url={ig?.profilo || meta?.profiloInstagram || 'https://www.instagram.com/wipguide'} />
              </CardBox>

              {/* FACEBOOK */}
              <CardBox icona={<Facebook className="w-5 h-5" />} titolo="Facebook — WIP.guide" colore="text-blue-600">
                {meta?.stato === 'chiave_mancante' ? (
                  <ChiaveMancante nota={meta.nota} />
                ) : meta?.stato === 'errore' ? (
                  <Errore errore={meta.errore} />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Metrica etichetta="Follower" valore={numeroIt(meta?.follower)} />
                    <Metrica etichetta="Mi piace (fan)" valore={numeroIt(meta?.fan)} />
                  </div>
                )}
                <LinkProfilo url={meta?.profilo || 'https://www.facebook.com/61594265810569'} />
              </CardBox>

              {/* TIKTOK (numeri a mano) */}
              <CardBox icona={<Music2 className="w-5 h-5" />} titolo="TikTok — @wipguide" colore="text-primary">
                <div className="grid grid-cols-3 gap-2">
                  <Metrica etichetta="Follower" valore={numeroIt(tk?.follower)} />
                  <Metrica etichetta="Mi piace" valore={numeroIt(tk?.miPiace)} />
                  <Metrica etichetta="Video" valore={numeroIt(tk?.video)} />
                </div>
                <p className="text-[11px] text-on-surface-variant italic">
                  {tk?.nota || 'TikTok non ha una API pubblica: aggiorna i numeri a mano.'}
                  {tk?.aggiornatoIl && ` Ultimo aggiornamento manuale: ${new Date(tk.aggiornatoIl).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  {([['follower', 'Follower'], ['miPiace', 'Mi piace'], ['video', 'Video']] as const).map(([campo, etichetta]) => (
                    <label key={campo} className="flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-primary/50">{etichetta}</span>
                      <input
                        type="number"
                        min={0}
                        value={tkForm[campo]}
                        onChange={e => setTkForm(f => ({ ...f, [campo]: e.target.value }))}
                        className="w-24 bg-[#f8f5f0] px-3 py-2 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-[#1e3a8a]/20"
                      />
                    </label>
                  ))}
                  <button
                    onClick={salvaTikTok}
                    disabled={salvandoTk}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {salvandoTk ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Salva
                  </button>
                </div>
                <LinkProfilo url={tk?.profilo || 'https://www.tiktok.com/@wipguide'} />
              </CardBox>
            </div>
          </Sezione>

          {/* ── SITO ──────────────────────────────────────────────────── */}
          <Sezione titolo="Sito">
            <CardBox icona={<Globe2 className="w-5 h-5" />} titolo="wip.guide — visite (PostHog)" colore="text-emerald-600">
              {sito?.stato === 'chiave_mancante' ? (
                <ChiaveMancante nota={sito.nota} />
              ) : sito?.stato === 'errore' ? (
                <Errore errore={sito.errore} />
              ) : (
                <>
                  <div className="max-w-md">
                    <Confronto etichetta="Pageview" v7={numeroIt(sito?.pageview7gg)} v30={numeroIt(sito?.pageview30gg)} />
                  </div>
                  {Number(sito?.pageview30gg ?? 0) === 0 && (
                    <p className="text-[11px] text-on-surface-variant italic">
                      Zero pageview può anche significare che il tracciamento $pageview lato client non è attivo (per scelta PostHog registra solo eventi server selezionati).
                    </p>
                  )}
                </>
              )}
            </CardBox>
          </Sezione>

          {/* ── RICAVI ────────────────────────────────────────────────── */}
          <Sezione titolo="Ricavi">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CardBox icona={<Euro className="w-5 h-5" />} titolo="Stripe — incassi" colore="text-violet-600">
                {ricavi?.stripe?.stato === 'chiave_mancante' ? (
                  <ChiaveMancante nota={ricavi.stripe.nota} />
                ) : ricavi?.stripe?.stato === 'errore' ? (
                  <Errore errore={ricavi.stripe.errore} />
                ) : ricavi?.stripe ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Confronto etichetta="Incassato" v7={euroIt(ricavi.stripe.incassato7gg, ricavi.stripe.valuta)} v30={euroIt(ricavi.stripe.incassato30gg, ricavi.stripe.valuta)} />
                      <Confronto etichetta="Pagamenti" v7={numeroIt(ricavi.stripe.pagamenti7gg)} v30={numeroIt(ricavi.stripe.pagamenti30gg)} />
                    </div>
                    {(ricavi.stripe.ultimiPagamenti || []).length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-primary/50">Ultimi pagamenti</p>
                        {(ricavi.stripe.ultimiPagamenti || []).map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-[11px] font-bold text-primary bg-surface-variant/40 rounded-lg px-2.5 py-1.5">
                            <span className="truncate">{p.descrizione || 'Pagamento'}</span>
                            <span className="shrink-0 text-primary/60 font-medium">
                              {euroIt(p.importo, p.valuta)} — {new Date(p.quando).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-on-surface-variant italic">Nessun pagamento negli ultimi 30 giorni.</p>
                    )}
                    {ricavi.stripe.approssimato && (
                      <p className="text-[11px] text-on-surface-variant italic">Più di 100 pagamenti nel periodo: i totali sono parziali.</p>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-on-surface-variant italic">Dati non disponibili.</p>
                )}
              </CardBox>

              <CardBox icona={<TrendingUp className="w-5 h-5" />} titolo="Crediti — libro mastro" colore="text-emerald-700">
                {ricavi?.crediti?.stato === 'errore' ? (
                  <Errore errore={ricavi.crediti.errore} />
                ) : ricavi?.crediti ? (
                  <div className="grid grid-cols-1 gap-2">
                    <Confronto etichetta="Crediti venduti" v7={numeroIt(ricavi.crediti.gg7?.venduti)} v30={numeroIt(ricavi.crediti.gg30?.venduti)} />
                    <Confronto etichetta="Crediti consumati" v7={numeroIt(ricavi.crediti.gg7?.consumati)} v30={numeroIt(ricavi.crediti.gg30?.consumati)} />
                    <Confronto etichetta="Acquirenti unici" v7={numeroIt(ricavi.crediti.gg7?.acquirentiUnici)} v30={numeroIt(ricavi.crediti.gg30?.acquirentiUnici)} />
                  </div>
                ) : (
                  <p className="text-[11px] text-on-surface-variant italic">Dati non disponibili.</p>
                )}
              </CardBox>
            </div>
          </Sezione>

          {/* ── USO DELL'APP ──────────────────────────────────────────── */}
          <Sezione titolo="Uso dell'app">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CardBox icona={<Activity className="w-5 h-5" />} titolo="Consumi AI/TTS e utenti" colore="text-primary">
                {usoApp?.stato === 'errore' ? (
                  <Errore errore={usoApp.errore} />
                ) : usoApp ? (
                  <>
                    <div className="grid grid-cols-1 gap-2">
                      <Confronto etichetta="Costo AI/TTS" v7={euroIt(usoApp.gg7?.costo, 'USD')} v30={euroIt(usoApp.gg30?.costo, 'USD')} />
                      <Confronto etichetta="Chiamate API" v7={numeroIt(usoApp.gg7?.chiamate)} v30={numeroIt(usoApp.gg30?.chiamate)} />
                      <Confronto etichetta="Utenti attivi" v7={numeroIt(usoApp.gg7?.utentiAttivi)} v30={numeroIt(usoApp.gg30?.utentiAttivi)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Metrica etichetta="Utenti registrati" valore={usoApp.utentiTotali == null ? '—' : numeroIt(usoApp.utentiTotali)} />
                      <Metrica etichetta="Nuovi (7gg)" valore={usoApp.utentiNuovi7gg == null ? '—' : numeroIt(usoApp.utentiNuovi7gg)} />
                    </div>
                    {Object.keys(usoApp.gg30?.perProvider || {}).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-primary/50">Costo per provider (30gg)</p>
                        {Object.entries(usoApp.gg30.perProvider).map(([prov, costo]: any) => (
                          <div key={prov} className="flex items-center justify-between gap-2 text-[11px] font-bold text-primary bg-surface-variant/40 rounded-lg px-2.5 py-1.5">
                            <span className="truncate">{prov}</span>
                            <span className="shrink-0 text-primary/60 font-medium">{euroIt(costo, 'USD')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-on-surface-variant italic">Dati non disponibili.</p>
                )}
              </CardBox>

              <CardBox icona={<TrendingUp className="w-5 h-5" />} titolo="Funnel prodotto (PostHog)" colore="text-pink-600">
                {funnel?.stato === 'chiave_mancante' ? (
                  <ChiaveMancante nota={funnel.nota} />
                ) : funnel?.stato === 'errore' ? (
                  <Errore errore={funnel.errore} />
                ) : funnel?.eventi ? (
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(funnel.eventi).map(([ev, conteggi]: [string, any]) => (
                      <div key={ev}>
                        <Confronto etichetta={ETICHETTE_FUNNEL[ev] || ev} v7={numeroIt(conteggi?.gg7)} v30={numeroIt(conteggi?.gg30)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-on-surface-variant italic">Dati non disponibili.</p>
                )}
              </CardBox>
            </div>
          </Sezione>

          {/* ── DOVE ASCOLTA IL MONDO ─────────────────────────────────── */}
          <Sezione titolo="Dove ascolta il mondo">
            <CardBox icona={<Headphones className="w-5 h-5" />} titolo="Audioguide ascoltate (30 giorni)" colore="text-indigo-600">
              {ascolti?.stato === 'errore' ? (
                <Errore errore={ascolti.errore} />
              ) : ascolti ? (
                <>
                  <div className="max-w-md">
                    <Confronto etichetta="Ascolti" v7={numeroIt(ascolti.ascolti7gg)} v30={numeroIt(ascolti.ascolti30gg)} />
                  </div>
                  {(ascolti.topPoi || []).length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-primary/50">Top 10 POI più ascoltati</p>
                        {(ascolti.topPoi || []).map((p: any, i: number) => (
                          <div key={p.poiId || i} className="flex items-center gap-2 text-[11px] font-bold text-primary bg-surface-variant/40 rounded-lg px-2.5 py-1.5">
                            <span className="shrink-0 w-5 text-center text-primary/40 font-black">{i + 1}</span>
                            <span className="truncate">
                              {p.nome}
                              {(p.citta || p.paese) && (
                                <span className="text-primary/50 font-medium"> — {[p.citta, p.paese].filter(Boolean).join(', ')}</span>
                              )}
                            </span>
                            <span className="ml-auto shrink-0 text-primary/60 font-medium">{numeroIt(p.ascolti)} ascolti</span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3">
                        {(ascolti.citta || []).length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-primary/50">Città più attive</p>
                            {(ascolti.citta || []).map((c: any, i: number) => (
                              <div key={`${c.citta}-${i}`} className="flex items-center gap-2 text-[11px] font-bold text-primary bg-surface-variant/40 rounded-lg px-2.5 py-1.5">
                                <MapPin className="w-3.5 h-3.5 shrink-0 text-primary/40" />
                                <span className="truncate">{c.citta}{c.paese && <span className="text-primary/50 font-medium"> — {c.paese}</span>}</span>
                                <span className="ml-auto shrink-0 text-primary/60 font-medium">{numeroIt(c.ascolti)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {(ascolti.paesi || []).length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-wider text-primary/50">Paesi</p>
                            <div className="flex flex-wrap gap-1">
                              {(ascolti.paesi || []).map((p: any) => (
                                <span key={p.paese} className="text-[10px] font-bold bg-surface-variant/40 rounded-lg px-2 py-1 text-primary/70">
                                  {p.paese}: {numeroIt(p.ascolti)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-on-surface-variant italic">Nessun ascolto registrato negli ultimi 30 giorni.</p>
                  )}
                  <p className="text-[11px] text-on-surface-variant italic">
                    La mappa con i pin degli ascolti arriverà in una prossima iterazione: per ora la classifica per città.
                    {ascolti.approssimato && ' Più di 5.000 ascolti nel periodo: classifica calcolata sui più recenti.'}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-on-surface-variant italic">Dati non disponibili.</p>
              )}
            </CardBox>
          </Sezione>

          {/* ── RECENSIONI ────────────────────────────────────────────── */}
          <Sezione titolo="Recensioni">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CardBox icona={<Star className="w-5 h-5" />} titolo="App Store — recensioni" colore="text-blue-500">
                {recensioni?.appStore?.stato === 'chiave_mancante' ? (
                  <ChiaveMancante nota={recensioni.appStore.nota} />
                ) : recensioni?.appStore?.stato === 'errore' ? (
                  <Errore errore={recensioni.appStore.errore} />
                ) : recensioni?.appStore ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Metrica etichetta="Media (feed)" valore={recensioni.appStore.media == null ? '—' : Number(recensioni.appStore.media).toLocaleString('it-IT', { maximumFractionDigits: 1 })} />
                      <Metrica etichetta="Nel feed" valore={numeroIt(recensioni.appStore.totaleNelFeed)} />
                    </div>
                    {(recensioni.appStore.ultime || []).length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-primary/50">Ultime recensioni</p>
                        {(recensioni.appStore.ultime || []).map((r: any, i: number) => (
                          <div key={i} className="bg-surface-variant/40 rounded-lg px-2.5 py-1.5 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Stelle n={r.stelle} />
                              <span className="truncate text-[11px] font-bold text-primary">{r.titolo || r.autore}</span>
                              {r.quando && (
                                <span className="ml-auto shrink-0 text-[10px] font-medium text-on-surface-variant">
                                  {new Date(r.quando).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                                </span>
                              )}
                            </div>
                            {r.testo && <p className="text-[11px] text-on-surface-variant leading-snug line-clamp-3">{r.testo}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-on-surface-variant italic">Nessuna recensione ancora.</p>
                    )}
                    {recensioni.appStore.nota && <p className="text-[11px] text-on-surface-variant italic">{recensioni.appStore.nota}</p>}
                  </>
                ) : (
                  <p className="text-[11px] text-on-surface-variant italic">Dati non disponibili.</p>
                )}
              </CardBox>

              <CardBox icona={<Star className="w-5 h-5" />} titolo="Google Play — recensioni" colore="text-emerald-600">
                {recensioni?.play ? (
                  <ChiaveMancante nota={recensioni.play.nota} />
                ) : (
                  <p className="text-[11px] text-on-surface-variant italic">Dati non disponibili.</p>
                )}
              </CardBox>
            </div>
          </Sezione>

          {/* ── INSTALL ───────────────────────────────────────────────── */}
          <Sezione titolo="Install">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CardBox icona={<Smartphone className="w-5 h-5" />} titolo="Android — Google Play" colore="text-emerald-600">
                {instAndroid?.stato === 'chiave_mancante' || instAndroid?.stato === 'manuale' ? (
                  <ChiaveMancante nota={instAndroid.nota} />
                ) : instAndroid?.stato === 'errore' ? (
                  <Errore errore={instAndroid.errore} />
                ) : (
                  <p className="text-[11px] text-on-surface-variant italic">Dati non disponibili.</p>
                )}
              </CardBox>

              <CardBox icona={<Smartphone className="w-5 h-5" />} titolo="iOS — App Store" colore="text-blue-500">
                {instIos?.stato === 'chiave_mancante' ? (
                  <ChiaveMancante nota={instIos.nota} />
                ) : instIos?.stato === 'errore' ? (
                  <>
                    <Errore errore={instIos.errore} />
                    {instIos.nota && <ChiaveMancante nota={instIos.nota} />}
                  </>
                ) : instIos ? (
                  <>
                    <div className="max-w-xs">
                      <Metrica etichetta="Download (finestra 7gg)" valore={numeroIt(instIos.download7gg)} />
                    </div>
                    {(instIos.perGiorno || []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(instIos.perGiorno || []).map((g: any) => (
                          <span key={g.giorno} className="text-[10px] font-bold bg-surface-variant/40 rounded-lg px-2 py-1 text-primary/70">
                            {g.giorno.slice(5)}: {numeroIt(g.unita)}
                          </span>
                        ))}
                      </div>
                    )}
                    {instIos.nota && <p className="text-[11px] text-on-surface-variant italic">{instIos.nota}</p>}
                  </>
                ) : (
                  <p className="text-[11px] text-on-surface-variant italic">Dati non disponibili.</p>
                )}
              </CardBox>
            </div>
          </Sezione>

          {/* ── PREDISPOSTE (Fase 2) ──────────────────────────────────── */}
          <Sezione titolo="In preparazione">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <RiquadroFuturo
                icona={<Target className="w-5 h-5" />}
                titolo="Attribuzione (AppsFlyer)"
                testo="Si attiva in Fase 2 col lancio delle campagne a pagamento — richiede account AppsFlyer e SDK nelle app."
              />
              <RiquadroFuturo
                icona={<Megaphone className="w-5 h-5" />}
                titolo="Campagne paid (ASA/Meta)"
                testo="In attesa delle prime campagne attive."
              />
            </div>
          </Sezione>
        </>
      )}
    </div>
  );
}
