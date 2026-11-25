// Genera public/guida/*.html dal file contenuti.mjs.   Uso:  node scripts/guida/build.mjs
// - Nessuna rete, nessun database. I numeri sono letti da public/guida/numeri.json se esiste (altrimenti non compaiono).
// - Foto/screenshot/video compaiono SOLO se il file esiste in public/guida/img | video (nessun segnaposto finto).
//   Convenzione:  img/<slug>-<n>.webp|jpg|png (n=1..)  con didascalia in media.json;  video/<slug>.mp4 + video/<slug>.jpg (poster) + .vtt
// - Scrive anche indice.json (ricerca «Chiedi a WIP come fare») e un rapporto dei media mancanti.
import fs from 'fs';
import path from 'path';
import * as C0 from './contenuti.mjs';
import { LINGUE, mappaTesti, ui } from './i18n.mjs';

// 7 LINGUE (16/11/2026): l'italiano in /guida/, le altre in /guida/<lingua>/. Foto, video ed esempi sono condivisi
// (public/guida/img|video|esempi). Le variabili qui sotto sono riassegnate per ogni lingua dal ciclo in fondo.
const STORE = C0.STORE;
let PAGINE, MACRO, OBIETTIVI, ETICHETTE_STAT, TUTORIAL_PRINCIPALI, FAMIGLIE_CATEGORIE;
let LANG = 'it', LOCALE = 'it-IT', BASE = '/guida', T = s => s;
const OUT = path.join('public', 'guida');
// www: il dominio nudo risponde 308 verso www, e canonical/sitemap devono puntare all'indirizzo finale (= SEO_SITO di server.ts).
const SITO = 'https://www.wip.guide';
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'video'), { recursive: true });

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const hrefIn = (base, slug) => (slug ? `${base}/${slug}` : `${base}/`);
const href = slug => hrefIn(BASE, slug);
let byslug = {};
let numeri = null;
try { numeri = JSON.parse(fs.readFileSync(path.join(OUT, 'numeri.json'), 'utf8')); } catch { /* nessun numero: nessuna cifra */ }
let mediaIt = {};
try { mediaIt = JSON.parse(fs.readFileSync(path.join(OUT, 'media.json'), 'utf8')); } catch { /* nessuna didascalia */ }
let media = mediaIt;
const mancanti = [];
const dataLunga = d => new Date(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

const fmt = n => n.toLocaleString(LOCALE);
function statHtml(keys) {
  if (!keys?.length || !numeri) return '';
  const celle = keys.map(k => {
    const v = numeri.numeri?.[k];
    if (!v) return '';
    return `<div class="stat"><span class="num" data-n="${v.n}" data-c="${v.stima ? esc(ui('circa', LANG)) : ''}">${v.stima ? esc(ui('circa', LANG)) : ''}${fmt(v.n)}</span><span class="et">${esc(ETICHETTE_STAT[k] || k)}</span></div>`;
  }).filter(Boolean).join('');
  if (!celle) return '';
  const data = numeri.aggiornato ? dataLunga(numeri.aggiornato) : '';
  return `<section class="stats" aria-label="${esc(ui('numeriReali', LANG))}">${celle}<p class="nota-stat">${esc(ui('aggiornatiAl', LANG, { d: data }))} ${esc(T(numeri.perimetro || ''))}</p></section>`;
}
function trovaMedia(slug) {
  const out = [];
  for (let i = 1; i <= 12; i++) {
    for (const ext of ['webp', 'jpg', 'png']) {
      const f = `${slug || 'home'}-${i}.${ext}`;
      if (fs.existsSync(path.join(OUT, 'img', f))) {
        const d = media[f] || {};
        out.push(`<figure><img src="/guida/img/${f}" alt="${esc(d.alt || d.didascalia || '')}" loading="lazy" decoding="async"${d.w ? ` width="${d.w}" height="${d.h}"` : ''}><figcaption>${esc(d.didascalia || '')}${d.fonte ? ` <span class="fonte">${esc(d.fonte)}</span>` : ''}</figcaption></figure>`);
        break;
      }
    }
  }
  return out;
}
function videoHtml(slug) {
  const f = `${slug || 'home'}.mp4`;
  if (!fs.existsSync(path.join(OUT, 'video', f))) return '';
  const base = slug || 'home';
  const poster = fs.existsSync(path.join(OUT, 'video', base + '.jpg')) ? ` poster="/guida/video/${base}.jpg"` : '';
  const vtt = fs.existsSync(path.join(OUT, 'video', base + '.vtt')) ? `<track kind="subtitles" src="/guida/video/${base}.vtt" srclang="it" label="Italiano"${LANG === 'it' ? ' default' : ''}>` : '';
  return `<figure class="video"><video controls preload="none" playsinline${poster}><source src="/guida/video/${f}" type="video/mp4">${vtt}</video><figcaption>${esc(ui('videoReale', LANG))}</figcaption></figure>`;
}
// «Ecco cosa ricevi» (16/11/2026, committente: «per ogni funzione un esempio esattamente come viene per un user,
// una grande città e un centro più piccolo»): file VERI in public/guida/esempi/, elencati in esempi.json.
let esempi = {};
try { esempi = JSON.parse(fs.readFileSync(path.join(OUT, 'esempi.json'), 'utf8')); } catch { /* nessun esempio */ }
function esempiHtml(slug) {
  const lista = (esempi[slug] || []).filter(e => fs.existsSync(path.join(OUT, 'esempi', e.file)));
  if (!lista.length) return '';
  const kb = f => Math.round(fs.statSync(path.join(OUT, 'esempi', f)).size / 1024);
  const voce = e => {
    const src = `/guida/esempi/${e.file}`;
    const titolo = T(e.titolo);
    const nota = e.nota ? `<p class="es-nota">${md(T(e.nota))}</p>` : '';
    if (e.tipo === 'img') return `<figure class="es"><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${esc(titolo)}" loading="lazy" decoding="async"></a><figcaption><strong>${esc(titolo)}</strong>${nota}</figcaption></figure>`;
    const testo = e.testo && fs.existsSync(path.join(OUT, 'esempi', e.testo)) ? ` <a href="/guida/esempi/${e.testo}" target="_blank" rel="noopener">${esc(ui('leggiTesto', LANG))}</a>` : '';
    if (e.tipo === 'audio') return `<div class="es"><strong>${esc(titolo)}</strong><audio controls preload="none" src="${src}"></audio>${nota}${testo}</div>`;
    const peso = kb(e.file), mis = peso > 1024 ? `${(peso / 1024).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} MB` : `${peso} KB`;
    return `<div class="es es-pdf"><a class="btn" href="${src}" target="_blank" rel="noopener">${esc(ui('apriPdf', LANG))}</a> <strong>${esc(titolo)}</strong> <span class="fonte">${mis}</span>${nota}</div>`;
  };
  return `<section class="esempi"><h2>${esc(ui('esempiTitolo', LANG))}</h2><p>${esc(ui('esempiTesto', LANG))}</p><div class="es-griglia">${lista.map(voce).join('')}</div></section>`;
}
function corpoHtml(blocchi) {
  return blocchi.map(([t, v]) => {
    if (t === 'p') return `<p>${md(v)}</p>`;
    if (t === 'lista') return `<ul>${v.map(x => `<li>${md(x)}</li>`).join('')}</ul>`;
    if (t === 'passi') return `<ol class="passi">${v.map(x => `<li>${md(x)}</li>`).join('')}</ol>`;
    if (t === 'nota') return `<aside class="nota"><strong>${esc(ui('daSapere', LANG))}</strong> ${md(v)}</aside>`;
    if (t === 'costo') return `<aside class="costo"><strong>${esc(ui('costo', LANG))}</strong> ${md(v)}</aside>`;
    if (t === 'tabella') return `<div class="tw"><table><thead><tr>${v[0].map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${v.slice(1).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    if (t === 'store') return `<p class="store"><a class="btn" href="${STORE.ios}" rel="noopener">App Store (iPhone)</a> <a class="btn" href="${STORE.android}" rel="noopener">Google Play (Android)</a> <a class="btn sec" href="${STORE.web}" rel="noopener">${esc(ui('apriWeb', LANG))}</a></p>`;
    return '';
  }).join('\n');
}

const CSS = `
:root{--bg:#fff;--fg:#14213d;--mut:#4b5568;--brand:#1e3a8a;--brand2:#2f56c9;--card:#f4f6fb;--line:#d9dfec;--ok:#0f6b3a;--warn:#8a4b00;--warnbg:#fff4e0;--costbg:#e8f0ff;--on:#fff}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0e1424;--fg:#e8ecf7;--mut:#a9b3c9;--brand:#8fb0ff;--brand2:#b5ccff;--card:#172038;--line:#2a3555;--ok:#6fdc9c;--warn:#ffcf8a;--warnbg:#2a2014;--costbg:#16264a;--on:#0e1424}}
*{box-sizing:border-box}html{scroll-behavior:smooth}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{animation:none!important;transition:none!important}}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--brand)}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--brand2);outline-offset:2px}
header.top{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line)}
.bar{max-width:1040px;margin:0 auto;padding:10px 16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.logo{font-weight:800;color:var(--brand);text-decoration:none;font-size:1.15rem}
nav.menu{display:flex;gap:4px 14px;flex-wrap:wrap;font-size:.92rem}nav.menu a{text-decoration:none;color:var(--fg);padding:6px 2px}nav.menu a:hover{color:var(--brand)}
.apri{margin-left:auto}
main{max-width:1040px;margin:0 auto;padding:20px 16px 56px}
h1{font-size:clamp(1.7rem,4.5vw,2.6rem);line-height:1.15;margin:.2em 0 .4em;color:var(--brand)}
h2{font-size:1.45rem;margin:2em 0 .5em;line-height:1.25}h3{font-size:1.1rem}
.lead{font-size:1.2rem;color:var(--mut);max-width:62ch}
.crumb{font-size:.9rem;color:var(--mut)}.crumb a{color:var(--mut)}
.btn{display:inline-block;background:var(--brand);color:var(--on);padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:700;margin:4px 6px 4px 0}
.btn.sec{background:transparent;color:var(--brand);border:2px solid var(--brand)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:22px 0;padding:16px;background:var(--card);border-radius:14px}
.stat{display:flex;flex-direction:column}.num{font-size:1.9rem;font-weight:800;color:var(--brand);font-variant-numeric:tabular-nums}.et{font-size:.88rem;color:var(--mut)}
.nota-stat{grid-column:1/-1;font-size:.82rem;color:var(--mut);margin:4px 0 0}
ol.passi{counter-reset:p;list-style:none;padding:0}ol.passi li{counter-increment:p;position:relative;padding:10px 12px 10px 52px;margin:8px 0;background:var(--card);border-radius:10px}
ol.passi li::before{content:counter(p);position:absolute;left:12px;top:9px;width:30px;height:30px;border-radius:50%;background:var(--brand);color:var(--on);display:grid;place-items:center;font-weight:800}
.nota,.costo,.manca{border-radius:10px;padding:12px 14px;margin:14px 0}.nota{background:var(--warnbg);color:var(--warn)}.costo{background:var(--costbg)}
.manca{border:2px dashed var(--line)}.manca h2{margin-top:0;font-size:1.1rem}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:420px}th,td{border:1px solid var(--line);padding:8px 10px;text-align:left}th{background:var(--card)}
figure{margin:18px 0}figure img,figure video{max-width:100%;height:auto;border-radius:12px;border:1px solid var(--line)}.esempi{margin:28px 0}.es-griglia{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}.es{border:1px solid var(--linea,#ddd);border-radius:12px;padding:12px;margin:0}.es img{max-height:360px;width:100%;object-fit:contain}.es audio{width:100%;margin-top:8px}.es-nota{font-size:.9em;margin:6px 0 0;opacity:.85}.es-pdf .btn{display:inline-block;margin-bottom:6px}
figure img{max-height:640px;width:auto;display:block}figcaption{font-size:.85rem;color:var(--mut)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin:18px 0}
.card{display:block;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;text-decoration:none;color:var(--fg)}
.card:hover{border-color:var(--brand)}.card .em{font-size:1.8rem}.card h3{margin:.3em 0}.card p{margin:.2em 0;color:var(--mut);font-size:.95rem}.card .cn{font-weight:700;color:var(--brand);font-size:.95rem}
.ricerca{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.ricerca input{flex:1;min-width:220px;padding:12px 14px;border-radius:10px;border:2px solid var(--line);font:inherit;background:var(--bg);color:var(--fg)}
.ris{list-style:none;padding:0}.ris li{margin:6px 0}.ris a{display:block;padding:10px 12px;background:var(--card);border-radius:10px;text-decoration:none}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{border:1px solid var(--brand);background:transparent;color:var(--brand);border-radius:999px;padding:8px 14px;font:inherit;cursor:pointer}.chip:hover{background:var(--brand);color:var(--on)}
details{border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:8px 0}summary{cursor:pointer;font-weight:700}
.letto{display:flex;align-items:center;gap:8px;margin:28px 0}.progress{font-size:.9rem;color:var(--mut)}
.fonte{opacity:.8}.agg{font-size:.85rem;color:var(--mut);margin-top:32px}
footer{border-top:1px solid var(--line);padding:22px 16px;text-align:center;font-size:.9rem;color:var(--mut)}
.lingue{max-width:1040px;margin:0 auto;padding:0 16px 8px;font-size:.85rem;color:var(--mut)}.lingue a{color:var(--mut)}.lingue strong{color:var(--fg)}footer .lingue{padding-top:10px}
@media(max-width:600px){body{font-size:16px}nav.menu{display:none}.apri{margin-left:auto}}
`;

// Lo script delle pagine cambia per lingua: indice di ricerca, parole da ignorare, formati e frasi.
const PAROLE_VUOTE = {
  it: 'come trovo trovare dove voglio vorrei posso fare uso usare una uno sul per con nel della delle degli anche cosa cerco cercare sono sapere vedere vedo vicino vicina vicini',
  en: 'how can find where want would like use the and for with near what are see look into from',
  fr: 'comment trouver trouve veux voudrais peux faire utiliser une pour avec dans des les près quoi sont voir',
  es: 'como cómo encontrar encuentro donde dónde quiero querría puedo hacer usar una uno para con del las los cerca qué son ver',
  de: 'wie finde finden kann ich will möchte machen nutzen eine einen für mit dem den der die das nahe was sind sehen',
  ru: 'как найти где хочу могу сделать использовать для это что рядом есть',
  zh: '',
};
const jsPer = L => JS.replace('__INDICE__', `${BASE}/indice.json`).replace('__LOCALE__', LOCALE).replace('__SW__', ' ' + (PAROLE_VUOTE[L] || '') + ' ')
  .replace('__NESSUNO__', ui('nessunRisultato', L).replace(/'/g, "\\'")).replace('__LETTA__', ui('lezLetta', L)).replace('__LEZIONI__', ui('lezioni', L).replace(/'/g, "\\'"));
const JS = `(function(){
function ready(f){document.readyState!='loading'?f():document.addEventListener('DOMContentLoaded',f)}
ready(function(){
 var red=matchMedia('(prefers-reduced-motion: reduce)').matches;
 var els=document.querySelectorAll('.num[data-n]');
 if('IntersectionObserver' in window&&!red&&els.length){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;io.unobserve(e.target);var el=e.target,n=+el.dataset.n,pre=el.dataset.c||'',t0=null;function st(t){t0=t0||t;var p=Math.min((t-t0)/900,1);el.textContent=pre+Math.round(n*p).toLocaleString('__LOCALE__');if(p<1)requestAnimationFrame(st)}requestAnimationFrame(st)})},{threshold:.4});els.forEach(function(e){io.observe(e)})}
 var inp=document.getElementById('q'),out=document.getElementById('ris');
 if(inp&&out){var idx=null;fetch('__INDICE__').then(function(r){return r.json()}).then(function(j){idx=j}).catch(function(){});
  var norm=function(s){return s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^\\p{L}\\p{N} ]+/gu,' ')};
  var cerca=function(q){q=norm(q).trim();if(!q||!idx){out.innerHTML='';return}var SW='__SW__';var w=/[\\u4e00-\\u9fff]/.test(q)?Array.from(q.replace(/\\s+/g,'')).reduce(function(a,c,i,s){if(i<s.length-1)a.push(c+s[i+1]);return a},[]):q.split(/\\s+/).filter(function(x){return x.length>2&&SW.indexOf(' '+x+' ')<0});
   var r=idx.map(function(d){var ks=norm(d.k),h=norm(d.t+' '+(d.r||'')+' '+(d.f||'')),s=0;w.forEach(function(x){if(ks.indexOf(x)>-1)s+=5;else if(h.indexOf(x)>-1)s+=1});for(var i=0;i<w.length-1;i++)if(ks.indexOf(w[i]+' '+w[i+1])>-1)s+=8;return {d:d,s:s}}).filter(function(x){return x.s>0}).sort(function(a,b){return b.s-a.s}).slice(0,6);
   out.innerHTML=r.length?r.map(function(x){return '<li><a href="'+x.d.u+'"><strong>'+x.d.t+'</strong>'+(x.d.r?'<br><span class="et">'+x.d.r+'</span>':'')+'</a></li>'}).join(''):'<li>__NESSUNO__</li>'};
  inp.addEventListener('input',function(){cerca(inp.value)});
  document.querySelectorAll('[data-q]').forEach(function(b){b.addEventListener('click',function(){inp.value=b.dataset.q;cerca(b.dataset.q);inp.focus()})})}
 var K='wip-guida-letti';function get(){try{return JSON.parse(localStorage.getItem(K)||'[]')}catch(e){return[]}}function set(a){try{localStorage.setItem(K,JSON.stringify(a))}catch(e){}}
 var cb=document.getElementById('letto');if(cb){var a=get();cb.checked=a.indexOf(cb.dataset.s)>-1;cb.addEventListener('change',function(){var l=get().filter(function(x){return x!==cb.dataset.s});if(cb.checked)l.push(cb.dataset.s);set(l)})}
 document.querySelectorAll('[data-lez]').forEach(function(el){var l=get();el.textContent=l.indexOf(el.dataset.lez)>-1?'__LETTA__':''});
 document.querySelectorAll('[data-perc]').forEach(function(el){var l=get(),s=el.dataset.perc.split(','),n=s.filter(function(x){return l.indexOf(x)>-1}).length;el.textContent='__LEZIONI__'.replace('{n}',n).replace('{t}',s.length)});
});})();`;

function layout({ p, corpo, extra = '' }) {
  const canon = SITO + href(p.slug);
  const crumbs = [{ n: 'WIP', u: SITO + '/' }, { n: ui('guida', LANG), u: SITO + href('') }];
  if (p.padre) crumbs.push({ n: byslug[p.padre].breve, u: SITO + href(p.padre) });
  if (p.slug) crumbs.push({ n: p.breve, u: canon });
  const faq = p.faqTutte ? PAGINE.flatMap(x => x.faq || []) : (p.faq || []);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.n, item: c.u })) },
    ...(faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] : []),
  ];
  const menu = [['', 'guida'], ['categorie', 'categorie'], ['audioguide', 'audioguide'], ['itinerari', 'itinerari'], ['tutorial', 'tutorial'], ['domande-frequenti', 'faq']].map(([s, k]) => `<a href="${href(s)}">${esc(ui(k, LANG))}</a>`).join('');
  const crumbHtml = crumbs.map((c, i) => (i < crumbs.length - 1 ? `<a href="${c.u.replace(SITO, '')}">${esc(c.n)}</a>` : esc(c.n))).join(' › ');
  // La stessa pagina nelle altre lingue: per Google (hreflang) e per chi legge (selettore).
  const baseDi = c => (c === 'it' ? '/guida' : `/guida/${c}`);
  const alternate = LINGUE.map(l => `<link rel="alternate" hreflang="${l.c === 'zh' ? 'zh-Hans' : l.c}" href="${SITO}${hrefIn(baseDi(l.c), p.slug)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${SITO}${hrefIn('/guida', p.slug)}">`;
  const selettore = `<nav class="lingue" aria-label="${esc(ui('lingua', LANG))}">${LINGUE.map(l => (l.c === LANG ? `<strong lang="${l.c}">${esc(l.nome)}</strong>` : `<a lang="${l.c}" hreflang="${l.c}" href="${hrefIn(baseDi(l.c), p.slug)}">${esc(l.nome)}</a>`)).join(' · ')}</nav>`;
  return `<!doctype html>
<html lang="${LANG === 'zh' ? 'zh-Hans' : LANG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.titolo)} | WIP Guide</title>
<meta name="description" content="${esc(p.meta)}">
<link rel="canonical" href="${canon}">${alternate}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(p.titolo)}"><meta property="og:description" content="${esc(p.meta)}"><meta property="og:url" content="${canon}"><meta property="og:site_name" content="WIP Guide"><meta property="og:image" content="${SITO}/scopri/og-image.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icon.png">
<style>${CSS}</style>
${ld.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')}
</head><body>
<a href="#main" style="position:absolute;left:-999px" onfocus="this.style.left='8px'">${esc(ui('vaiContenuto', LANG))}</a>
<header class="top"><div class="bar"><a class="logo" href="${href('')}">${esc(ui('logo', LANG))}</a><nav class="menu" aria-label="${esc(ui('guida', LANG))}">${menu}</nav><a class="btn apri" href="${STORE.web}">${esc(ui('apri', LANG))}</a></div>${selettore}</header>
<main id="main">
<p class="crumb">${crumbHtml}</p>
<h1>${esc(p.titolo)}</h1>
<p class="lead">${md(p.lead)}</p>
${LANG !== 'it' ? `<p class="agg">${esc(ui('tradotto', LANG))}</p>` : ''}
${corpo}
${extra}
<p class="agg">${esc(ui('verificato', LANG))} <a href="mailto:support@wip.guide">support@wip.guide</a>.</p>
</main>
<footer><a href="${href('')}">${esc(ui('guida', LANG))}</a> · <a href="/privacy">${esc(ui('privacy', LANG))}</a> · <a href="/support">${esc(ui('supporto', LANG))}</a> · <a href="${STORE.web}">wip.guide</a><br>${selettore}</footer>
<script>${jsPer(LANG)}</script>
</body></html>`;
}

function paginaStandard(p) {
  let h = '';
  h += statHtml(p.stat);
  h += videoHtml(p.slug);
  const m = trovaMedia(p.slug);
  if (m.length) h += `<div class="galleria">${m.join('')}</div>`;
  else if (LANG === 'it') mancanti.push(`${p.slug || 'home'}: screenshot (img/${p.slug || 'home'}-1..n)`);
  h += esempiHtml(p.slug);
  if (LANG === 'it' && !fs.existsSync(path.join(OUT, 'video', `${p.slug || 'home'}.mp4`))) mancanti.push(`${p.slug || 'home'}: video`);
  for (const s of p.sezioni || []) h += `<h2>${esc(s.h)}</h2>\n${corpoHtml(s.corpo)}`;
  if (p.catalogo) h += catalogoHtml();
  if (p.categorieComplete) h += famiglieHtml();
  if (p.beni) h = beniHtml() + h;
  if (p.percorsi) h += percorsiHtml(p);
  if (p.manca?.length) h += `<section class="manca"><h2>${esc(ui('manca', LANG))}</h2><ul>${p.manca.map(x => `<li>${md(x)}</li>`).join('')}</ul></section>`;
  const faq = p.faqTutte ? PAGINE.filter(x => x.faq?.length).map(x => [x, x.faq]) : (p.faq?.length ? [[p, p.faq]] : []);
  if (faq.length) {
    h += `<h2>${esc(ui('domande', LANG))}</h2>`;
    for (const [pg, qs] of faq) {
      if (p.faqTutte) h += `<h3><a href="${href(pg.slug)}">${esc(pg.breve)}</a></h3>`;
      h += qs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${md(a)}</p></details>`).join('');
    }
  }
  if (p.correlate?.length) h += `<h2>${esc(ui('continua', LANG))}</h2><div class="grid">${p.correlate.map(s => `<a class="card" href="${href(s)}"><h3>${esc(byslug[s].breve)}</h3><p>${esc(byslug[s].meta.slice(0, 110))}…</p></a>`).join('')}</div>`;
  if (p.slug && !p.catalogo && !p.faqTutte) h += `<div class="letto"><input type="checkbox" id="letto" data-s="${p.slug}"><label for="letto">${esc(ui('letto', LANG))}</label></div>`;
  h += `<p><a class="btn" href="${STORE.web}">${esc(ui('apri', LANG))}</a> <a class="btn sec" href="${href('categorie')}">${esc(ui('tutteCategorie', LANG))}</a></p>`;
  return h;
}
function catalogoHtml() {
  let h = `<h2>${esc(ui('perMacro', LANG))}</h2><div class="grid">`;
  for (const m of MACRO) {
    const celle = m.stat.map(k => numeri?.numeri?.[k] ? `${numeri.numeri[k].stima ? ui('circa', LANG) : ''}${fmt(numeri.numeri[k].n)} ${ETICHETTE_STAT[k]}` : '').filter(Boolean);
    h += `<a class="card" href="${href(m.pagina)}"><span class="em" aria-hidden="true">${m.emoji}</span><h3>${esc(m.nome)}</h3><p>${esc(m.testo)}</p>${celle.length ? `<p class="cn">${esc(celle.slice(0, 2).join(' · '))}</p>` : ''}</a>`;
  }
  h += '</div>';
  h += `<h2 class="sottocat">${esc(ui('sottocategorie', LANG))}</h2><div class="grid">` + PAGINE.filter(p => p.padre).map(p => `<a class="card" href="${href(p.slug)}"><h3>${esc(p.breve)}</h3><p>${esc(p.meta.slice(0, 110))}…</p></a>`).join('') + '</div>';
  return h;
}
let numCat = null;
try { numCat = JSON.parse(fs.readFileSync(path.join(OUT, 'numeri-categorie.json'), 'utf8')); } catch { /* nessun numero per categoria */ }
const cifra = v => (v && v.n != null ? `${v.stima ? ui('circa', LANG) : ''}${fmt(v.n)}` : '—');
function beniHtml() {
  const v = numCat?.beni_culturali;
  if (!v || v.n == null) return '';
  return `<section class="stats" aria-label="${esc(ui('numeriReali', LANG))}"><div class="stat"><span class="num" data-n="${v.n}" data-c="${v.stima ? esc(ui('circa', LANG)) : ''}">${v.stima ? esc(ui('circa', LANG)) : ''}${fmt(v.n)}</span><span class="et">${esc(ui('beniAtlante', LANG))}</span></div><p class="nota-stat">${esc(ui('aggiornatiAl', LANG, { d: dataLunga(numCat.aggiornato) }))}</p></section>`;
}
function famiglieHtml() {
  const usate = new Set();
  let h = '';
  const data = numCat?.aggiornato ? dataLunga(numCat.aggiornato) : '';
  const testata = `<thead><tr><th>${esc(ui('categoria', LANG))}</th><th>${esc(ui('luoghi', LANG))}</th></tr></thead>`;
  for (const f of FAMIGLIE_CATEGORIE) {
    const righe = f.chiavi.filter(k => numCat?.categorie?.[k]).map(k => { usate.add(k); const c = numCat.categorie[k]; return `<tr><td>${esc(T(c.label || k))}</td><td>${cifra(c)}</td></tr>`; });
    const tot = f.chiavi.reduce((s, k) => s + (numCat?.categorie?.[k]?.n || 0), 0);
    h += `<h2>${f.emoji} ${esc(f.nome)}</h2><p><strong>${esc(ui('doveTrovi', LANG))}</strong> ${esc(f.dove)}<br><strong>${esc(ui('audioguida', LANG))}</strong> ${esc(f.audio)}</p>`;
    if (righe.length) h += `<div class="tw"><table>${testata}<tbody>${righe.join('')}</tbody></table></div>`;
    else h += `<p class="progress">${esc(ui('senzaNumeri', LANG))}</p>`;
    if (tot && righe.length > 1) h += `<p class="progress">${esc(ui('insieme', LANG, { n: fmt(tot) }))}</p>`;
  }
  const altre = Object.entries(numCat?.categorie || {}).filter(([k]) => !usate.has(k));
  if (altre.length) h += `<h2>${esc(ui('altreChiavi', LANG))}</h2><div class="tw"><table>${testata}<tbody>${altre.map(([k, c]) => `<tr><td>${esc(T(c.label || k))}</td><td>${cifra(c)}</td></tr>`).join('')}</tbody></table></div>`;
  if (data) h += `<p class="nota-stat">${esc(ui('aggiornatiAl', LANG, { d: data }))}</p>`;
  return h;
}
function principaliHtml() {
  return '<div class="grid">' + TUTORIAL_PRINCIPALI.map(t => `<div class="card"><h3>${esc(t.n)}</h3><ul>${t.l.map(s => `<li><a href="${href(s)}">${esc(byslug[s].breve)}</a></li>`).join('')}</ul></div>`).join('') + '</div>';
}
function percorsiHtml(p) {
  let h = `<h2>${esc(ui('principali', LANG))}</h2>` + principaliHtml() + `<h2>${esc(ui('percorsiApp', LANG))}</h2><div class="grid">`;
  for (const pc of p.percorsi) h += `<div class="card"><h3>${esc(pc.n)}</h3><p class="progress" data-perc="${pc.l.join(',')}"></p><ol>${pc.l.map(s => `<li><a href="${href(s)}">${esc(byslug[s].breve)}</a> <span class="progress" data-lez="${s}"></span></li>`).join('')}</ol></div>`;
  h += `</div><h2>${esc(ui('ogniViaggio', LANG))}</h2><div class="grid">`;
  for (const t of p.tipi) h += `<div class="card"><h3>${esc(t.n)}</h3><ul>${t.l.map(s => `<li><a href="${href(s)}">${esc(byslug[s].breve)}</a></li>`).join('')}</ul></div>`;
  return h + '</div>';
}
function homeHtml(p) {
  let h = `<p><a class="btn" href="${href('categorie')}">${esc(ui('esplora', LANG))}</a> <a class="btn sec" href="${href('tutorial')}">${esc(ui('comeFunziona', LANG))}</a> <a class="btn sec" href="${STORE.web}">${esc(ui('apri', LANG))}</a></p>`;
  h += statHtml(p.stat);
  h += videoHtml('');
  const m = trovaMedia('');
  if (m.length) h += `<div class="galleria">${m.join('')}</div>`; else if (LANG === 'it') mancanti.push('home: screenshot/hero');
  if (LANG === 'it' && !fs.existsSync(path.join(OUT, 'video', 'home.mp4'))) mancanti.push('home: video');
  h += `<h2>${esc(ui('cosaFare', LANG))}</h2><p>${esc(ui('cosaFareTesto', LANG))}</p><div class="chips">${OBIETTIVI.map(o => `<button class="chip" type="button" data-q="${esc(o.t)}">${esc(LANG === 'it' ? o.t.replace(/^Voglio /, '') : o.t)}</button>`).join('')}</div>`;
  h += `<h2>${esc(ui('chiedi', LANG))}</h2><div class="ricerca"><input id="q" type="search" placeholder="${esc(ui('esempioRicerca', LANG))}" aria-label="${esc(ui('cercaGuida', LANG))}" autocomplete="off"></div><ul class="ris" id="ris" aria-live="polite"></ul>`;
  h += `<p class="progress">${esc(ui('ricercaNota', LANG))}</p>`;
  h += `<h2>${esc(ui('principali', LANG))}</h2>` + principaliHtml();
  h += `<h2>${esc(ui('esploraTutto', LANG))}</h2>` + catalogoHtml().split('<h2 class="sottocat">')[0].replace(/^<h2>[^<]*<\/h2>/, '');
  h += `<h2>${esc(ui('guidePrincipali', LANG))}</h2><div class="grid">${['mappa-e-ricerca', 'audioguide', 'itinerari', 'navigatore', 'musei-cultura', 'eventi', 'gratis-e-crediti', 'web-iphone-android'].map(s => `<a class="card" href="${href(s)}"><h3>${esc(byslug[s].breve)}</h3><p>${esc(byslug[s].meta.slice(0, 120))}…</p></a>`).join('')}</div>`;
  h += `<h2>${esc(ui('scarica', LANG))}</h2><p class="store"><a class="btn" href="${STORE.ios}" rel="noopener">App Store (iPhone)</a> <a class="btn" href="${STORE.android}" rel="noopener">Google Play (Android)</a> <a class="btn sec" href="${STORE.web}">${esc(ui('apriWeb', LANG))}</a></p>`;
  h += `<h2>${esc(ui('domande', LANG))}</h2><p><a href="${href('domande-frequenti')}">${esc(ui('tutteRisposte', LANG))}</a></p>`;
  return h;
}

// ── Una passata per lingua ──
const leggiDiz = c => { try { return JSON.parse(fs.readFileSync(path.join('scripts', 'guida', 'traduzioni', `${c}.json`), 'utf8')); } catch { return {}; } };
// Una lingua si pubblica solo se è tradotta quasi tutta (≥ 97% delle frasi): mai una pagina «English» con il testo
// in italiano. Le lingue sotto soglia non hanno pagine, non sono nel selettore, negli hreflang né nella sitemap.
const SOGLIA_LINGUA = 0.97;
const copertura = c => { const d = leggiDiz(c); let si = 0, tot = 0; for (const n of ['MACRO', 'ETICHETTE_STAT', 'OBIETTIVI', 'TUTORIAL_PRINCIPALI', 'FAMIGLIE_CATEGORIE', 'PAGINE']) mappaTesti(C0[n], s => { tot++; if (d[s]) si++; return s; }); return tot ? si / tot : 0; };
const ATTIVE = LINGUE.filter(l => l.c === 'it' || copertura(l.c) >= SOGLIA_LINGUA);
LINGUE.splice(0, LINGUE.length, ...ATTIVE); // selettore, hreflang e sitemap leggono LINGUE
for (const c of ['en', 'fr', 'es', 'de', 'ru', 'zh']) if (!ATTIVE.some(l => l.c === c)) fs.rmSync(path.join(OUT, c), { recursive: true, force: true }); // pagine di una passata precedente
const resoconto = [];
for (const L of LINGUE) {
  LANG = L.c; LOCALE = L.locale; BASE = L.c === 'it' ? '/guida' : `/guida/${L.c}`;
  const diz = L.c === 'it' ? null : leggiDiz(L.c);
  let tradotte = 0, mancano = 0;
  T = s => { if (!diz || !s) return s; const t = diz[s]; if (t) { tradotte++; return t; } mancano++; return s; };
  PAGINE = mappaTesti(C0.PAGINE, T); MACRO = mappaTesti(C0.MACRO, T); OBIETTIVI = mappaTesti(C0.OBIETTIVI, T);
  ETICHETTE_STAT = mappaTesti(C0.ETICHETTE_STAT, T); TUTORIAL_PRINCIPALI = mappaTesti(C0.TUTORIAL_PRINCIPALI, T); FAMIGLIE_CATEGORIE = mappaTesti(C0.FAMIGLIE_CATEGORIE, T);
  media = mappaTesti(mediaIt, T);
  byslug = Object.fromEntries(PAGINE.map(p => [p.slug, p]));
  const dest = L.c === 'it' ? OUT : path.join(OUT, L.c);
  const indice = [];
  for (const p of PAGINE) {
    const corpo = p.home ? homeHtml(p) : paginaStandard(p);
    const dir = p.slug ? path.join(dest, p.slug) : dest;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), layout({ p, corpo }));
    if (p.slug) indice.push({ u: href(p.slug), t: p.titolo, r: p.meta.slice(0, 120), k: [p.breve, ...(OBIETTIVI.filter(o => o.p === p.slug).map(o => o.k + ' ' + o.t))].join(' '), f: (p.faq || []).map(f => f[0]).join(' ') });
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'indice.json'), JSON.stringify(indice));
  resoconto.push(L.c === 'it' ? 'it' : `${L.c} ${tradotte + mancano ? Math.round(100 * tradotte / (tradotte + mancano)) : 0}%`);
}
// Sitemap della guida: tutte le lingue, ogni pagina con le sue alternative (dichiarata in robots.txt dal server).
const oggi = new Date().toISOString().slice(0, 10);
const righeSitemap = [];
for (const L of LINGUE) for (const p of C0.PAGINE) {
  const base = L.c === 'it' ? '/guida' : `/guida/${L.c}`;
  const alt = LINGUE.map(a => `<xhtml:link rel="alternate" hreflang="${a.c === 'zh' ? 'zh-Hans' : a.c}" href="${SITO}${hrefIn(a.c === 'it' ? '/guida' : `/guida/${a.c}`, p.slug)}"/>`).join('');
  righeSitemap.push(`<url><loc>${SITO}${hrefIn(base, p.slug)}</loc><lastmod>${oggi}</lastmod><priority>${p.slug ? '0.6' : '0.8'}</priority>${alt}</url>`);
}
fs.writeFileSync(path.join(OUT, 'sitemap-guida.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${righeSitemap.join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'media-mancanti.txt'), mancanti.join('\n') + '\n');
console.log(`Pagine generate: ${C0.PAGINE.length} × ${LINGUE.length} lingue. Tradotto: ${resoconto.join(' · ')}. Numeri: ${numeri ? 'presenti (' + numeri.aggiornato + ')' : 'ASSENTI'}. Media mancanti: ${mancanti.length}`);
