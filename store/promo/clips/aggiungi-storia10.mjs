// Aggiunge storia10 (San Pietro) a fumetti.json in 7 lingue, senza toccare le altre.
import fs from 'fs';
const p = 'C:/progetti/itainta/store/promo/clips/fumetti.json';
const J = JSON.parse(fs.readFileSync(p, 'utf8'));
J.storia10 = {
  it: ["Roma, San Pietro...\nquante colonne!", "Mamma, sentiamo\ncosa dice Nicky...", "Sali sul disco:\nle colonne diventano una!", "Un trucco del Bernini.\nNessuno te lo dice.", "Ora lo faccio\nvedere a tutti!", "Ai bambini lo racconta Nicky.\nWIP, la voce dei luoghi.|Provala gratis"],
  en: ["Rome, St. Peter's...\nso many columns!", "Mom, let's hear\nwhat Nicky says...", "Stand on the disc:\nthe columns become one!", "A trick by Bernini.\nNobody tells you that.", "Now I'll show\neveryone!", "Nicky tells it to the kids.\nWIP, the voice of places.|Try it free"],
  fr: ["Rome, Saint-Pierre...\nque de colonnes !", "Maman, écoutons\nce que dit Nicky...", "Monte sur le disque :\nles colonnes n'en font qu'une !", "Une astuce du Bernin.\nPersonne ne te le dit.", "Maintenant je le montre\nà tout le monde !", "Nicky le raconte aux enfants.\nWIP, la voix des lieux.|Essaie gratuitement"],
  es: ["Roma, San Pedro...\n¡cuántas columnas!", "Mamá, escuchemos\nqué dice Nicky...", "Súbete al disco:\n¡las columnas se vuelven una!", "Un truco de Bernini.\nNadie te lo cuenta.", "¡Ahora se lo enseño\na todos!", "A los niños se lo cuenta Nicky.\nWIP, la voz de los lugares.|Pruébala gratis"],
  de: ["Rom, Petersplatz...\nso viele Säulen!", "Mama, hören wir,\nwas Nicky sagt...", "Stell dich auf die Scheibe:\ndie Säulen werden eine!", "Ein Trick von Bernini.\nNiemand sagt dir das.", "Jetzt zeige ich\nes allen!", "Kindern erzählt es Nicky.\nWIP, die Stimme der Orte.|Gratis testen"],
  ru: ["Рим, собор Святого Петра...\nсколько колонн!", "Мама, послушаем,\nчто скажет Ники...", "Встань на диск:\nколонны становятся одной!", "Хитрость Бернини.\nНикто тебе не скажет.", "Теперь я покажу\nэто всем!", "Детям рассказывает Ники.\nWIP — голос мест.|Попробуйте бесплатно"],
  zh: ["罗马，圣彼得广场……\n好多柱子！", "妈妈，听听\nNicky 怎么说……", "站到圆盘上：\n柱子变成一排！", "贝尼尼的小机关。\n没人会告诉你。", "现在我要\n讲给大家听！", "Nicky 讲给孩子们听。\nWIP，地点的声音。|免费试用"],
};
fs.writeFileSync(p, JSON.stringify(J, null, 2) + '\n', 'utf8');
console.log('storia10 aggiunta:', Object.keys(J.storia10).join(','));
