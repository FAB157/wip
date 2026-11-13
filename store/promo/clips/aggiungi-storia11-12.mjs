// Aggiunge storia11 (Firenze) e storia12 (Roma) a fumetti.json, solo IT+EN (regola 27), senza toccare le altre.
import fs from 'fs';
const p = 'C:/progetti/itainta/store/promo/clips/fumetti.json';
const J = JSON.parse(fs.readFileSync(p, 'utf8'));
J.storia11 = {
  it: ["Firenze, Ponte Vecchio...\nche meraviglia!", "Mamma, sentiamo\ncosa dice Nicky...", "Un tempo qui c'erano\ni macellai. Poi gli orafi!", "Scegli tu le tappe.\nWIP fa il percorso.", "Ora la prossima tappa\nla scelgo io!", "Ai bambini lo racconta Nicky.\nWIP, la voce dei luoghi.|Scoprilo su"],
  en: ["Florence, Ponte Vecchio...\nwhat a view!", "Mom, let's hear\nwhat Nicky says...", "Butchers once worked\nhere. Then, goldsmiths!", "You pick the stops.\nWIP builds the route.", "Now I pick\nthe next stop!", "Nicky tells it to the kids.\nWIP, the voice of places.|Discover it at"],
};
J.storia12 = {
  it: ["Roma, la Bocca della Verità...\nche fila!", "Ascoltiamo Nicky,\nmamma...", "Dicono che morda\nla mano ai bugiardi!", "Qui hanno girato\nun film famoso!", "Io dico sempre\nla verità!", "Le location dei film, mappate.\nWIP, la voce dei luoghi.|Scoprile su"],
  en: ["Rome, the Mouth of Truth...\nwhat a queue!", "Let's hear Nicky,\nmom...", "They say it bites\nliars' hands!", "A famous movie\nwas shot right here!", "I always tell\nthe truth!", "Movie locations, mapped.\nWIP, the voice of places.|Discover them at"],
};
fs.writeFileSync(p, JSON.stringify(J, null, 2) + '\n', 'utf8');
console.log('aggiunte:', Object.keys(J.storia11).join(','), '|', Object.keys(J.storia12).join(','));
