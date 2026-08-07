import fs from 'fs';

let content = fs.readFileSync('src/hooks/useGeofencing.ts', 'utf8');

const targetDirections = `function directionLabel(dir: Direction, lang: string): string {
  const it = lang.toLowerCase().startsWith('it');
  const labels: Record<Direction, [string, string]> = {
    'front':        ['dritto davanti a te',           'straight ahead'],
    'front-right':  ['davanti a te sulla destra',     'ahead on your right'],
    'right':        ['alla tua destra',               'on your right'],
    'behind-right': ['dietro di te sulla destra',     'behind you on your right'],
    'behind':       ['dietro di te',                  'behind you'],
    'behind-left':  ['dietro di te sulla sinistra',   'behind you on your left'],
    'left':         ['alla tua sinistra',             'on your left'],
    'front-left':   ['davanti a te sulla sinistra',   'ahead on your left'],
  };
  return it ? labels[dir][0] : labels[dir][1];
}`;

const replacementDirections = `function directionLabel(dir: Direction, lang: string): string {
  const l = (lang || 'IT').toUpperCase();
  const dict: Record<string, Record<Direction, string>> = {
    IT: {
      'front': 'dritto davanti a te', 'front-right': 'davanti a te sulla destra', 'right': 'alla tua destra',
      'behind-right': 'dietro di te sulla destra', 'behind': 'dietro di te', 'behind-left': 'dietro di te sulla sinistra',
      'left': 'alla tua sinistra', 'front-left': 'davanti a te sulla sinistra'
    },
    EN: {
      'front': 'straight ahead', 'front-right': 'ahead on your right', 'right': 'on your right',
      'behind-right': 'behind you on your right', 'behind': 'behind you', 'behind-left': 'behind you on your left',
      'left': 'on your left', 'front-left': 'ahead on your left'
    },
    FR: {
      'front': 'droit devant vous', 'front-right': 'devant vous sur la droite', 'right': 'à votre droite',
      'behind-right': 'derrière vous sur la droite', 'behind': 'derrière vous', 'behind-left': 'derrière vous sur la gauche',
      'left': 'à votre gauche', 'front-left': 'devant vous sur la gauche'
    },
    ES: {
      'front': 'recto por delante', 'front-right': 'delante a su derecha', 'right': 'a su derecha',
      'behind-right': 'detrás a su derecha', 'behind': 'detrás de usted', 'behind-left': 'detrás a su izquierda',
      'left': 'a su izquierda', 'front-left': 'delante a su izquierda'
    },
    RU: {
      'front': 'прямо перед вами', 'front-right': 'впереди справа', 'right': 'справа от вас',
      'behind-right': 'позади справа', 'behind': 'позади вас', 'behind-left': 'позади слева',
      'left': 'слева от вас', 'front-left': 'впереди слева'
    },
    ZH: {
      'front': '正前方', 'front-right': '右前方', 'right': '在您右侧',
      'behind-right': '右后方', 'behind': '在您身后', 'behind-left': '左后方',
      'left': '在您左侧', 'front-left': '左前方'
    }
  };
  const labels = dict[l] || dict['EN'];
  return labels[dir];
}`;

const targetApproach = `function approachMessage(name: string, distMeters: number, isCar: boolean, lang: string, dir?: Direction): string {
  const it = lang.toLowerCase().startsWith('it');
  const dirText = dir ? directionLabel(dir, lang) : '';
  
  // Distanza approssimata per frasi naturali
  let distText = '';
  if (distMeters > 80) {
    distText = it ? \`Tra circa \${Math.round(distMeters / 10) * 10} metri\` : \`In about \${Math.round(distMeters / 10) * 10} meters\`;
  } else if (distMeters > 30) {
    distText = it ? 'Tra qualche metro' : 'In a few meters';
  } else {
    distText = it ? 'Molto vicino a te' : 'Very close to you';
  }

  if (isCar) {
    if (dirText) {
      return it
        ? \`\${distText}, \${dirText}, passerai vicino a \${name}\`
        : \`\${distText}, \${dirText}, you will pass near \${name}\`;
    }
    return it ? \`\${distText} passerai vicino a \${name}\` : \`\${distText} you will pass near \${name}\`;
  }

  if (dirText) {
    return it
      ? \`\${distText}, \${dirText}, troverai \${name}\`
      : \`\${distText}, \${dirText}, you will find \${name}\`;
  }
  return it ? \`\${distText} arriverai a \${name}\` : \`\${distText} you will arrive at \${name}\`;
}`;

const replacementApproach = `function approachMessage(name: string, distMeters: number, isCar: boolean, lang: string, dir?: Direction): string {
  const l = (lang || 'IT').toUpperCase();
  const dirText = dir ? directionLabel(dir, lang) : '';
  let distText = '';
  let msg = '';
  const d = Math.round(distMeters / 10) * 10;
  
  if (l === 'IT') {
    distText = distMeters > 80 ? \`Tra circa \${d} metri\` : (distMeters > 30 ? 'Tra qualche metro' : 'Molto vicino a te');
    msg = isCar ? (dirText ? \`\${distText}, \${dirText}, passerai vicino a \${name}\` : \`\${distText} passerai vicino a \${name}\`) : (dirText ? \`\${distText}, \${dirText}, troverai \${name}\` : \`\${distText} arriverai a \${name}\`);
  } else if (l === 'FR') {
    distText = distMeters > 80 ? \`Dans environ \${d} mètres\` : (distMeters > 30 ? 'Dans quelques mètres' : 'Très proche de vous');
    msg = isCar ? (dirText ? \`\${distText}, \${dirText}, vous passerez près de \${name}\` : \`\${distText} vous passerez près de \${name}\`) : (dirText ? \`\${distText}, \${dirText}, vous trouverez \${name}\` : \`\${distText} vous arriverez à \${name}\`);
  } else if (l === 'ES') {
    distText = distMeters > 80 ? \`En unos \${d} metros\` : (distMeters > 30 ? 'En unos pocos metros' : 'Muy cerca de usted');
    msg = isCar ? (dirText ? \`\${distText}, \${dirText}, pasará cerca de \${name}\` : \`\${distText} pasará cerca de \${name}\`) : (dirText ? \`\${distText}, \${dirText}, encontrará \${name}\` : \`\${distText} llegará a \${name}\`);
  } else if (l === 'RU') {
    distText = distMeters > 80 ? \`Примерно через \${d} метров\` : (distMeters > 30 ? 'Через несколько метров' : 'Совсем рядом с вами');
    msg = isCar ? (dirText ? \`\${distText}, \${dirText}, вы проедете мимо \${name}\` : \`\${distText} вы проедете мимо \${name}\`) : (dirText ? \`\${distText}, \${dirText}, вы найдете \${name}\` : \`\${distText} вы прибудете к \${name}\`);
  } else if (l === 'ZH') {
    distText = distMeters > 80 ? \`大约 \${d} 米后\` : (distMeters > 30 ? '几米后' : '离您非常近');
    msg = isCar ? (dirText ? \`\${distText}，\${dirText}，您将经过 \${name}\` : \`\${distText} 您将经过 \${name}\`) : (dirText ? \`\${distText}，\${dirText}，您将看到 \${name}\` : \`\${distText} 您将到达 \${name}\`);
  } else {
    // EN default
    distText = distMeters > 80 ? \`In about \${d} meters\` : (distMeters > 30 ? 'In a few meters' : 'Very close to you');
    msg = isCar ? (dirText ? \`\${distText}, \${dirText}, you will pass near \${name}\` : \`\${distText} you will pass near \${name}\`) : (dirText ? \`\${distText}, \${dirText}, you will find \${name}\` : \`\${distText} you will arrive at \${name}\`);
  }
  return msg;
}`;

const targetArrival = `function arrivalMessage(name: string, lang: string, dir?: Direction): string {
  const it = lang.toLowerCase().startsWith('it');
  const dirText = dir ? directionLabel(dir, lang) : '';
  
  if (dirText) {
    return it
      ? \`Sei arrivato. \${name} si trova \${dirText}\`
      : \`You have arrived. \${name} is \${dirText}\`;
  }
  return it ? \`Sei arrivato a \${name}\` : \`You have arrived at \${name}\`;
}`;

const replacementArrival = `function arrivalMessage(name: string, lang: string, dir?: Direction): string {
  const l = (lang || 'IT').toUpperCase();
  const dirText = dir ? directionLabel(dir, lang) : '';
  if (l === 'IT') return dirText ? \`Sei arrivato. \${name} si trova \${dirText}\` : \`Sei arrivato a \${name}\`;
  if (l === 'FR') return dirText ? \`Vous êtes arrivé. \${name} est \${dirText}\` : \`Vous êtes arrivé à \${name}\`;
  if (l === 'ES') return dirText ? \`Ha llegado. \${name} está \${dirText}\` : \`Ha llegado a \${name}\`;
  if (l === 'RU') return dirText ? \`Вы прибыли. \${name} находится \${dirText}\` : \`Вы прибыли к \${name}\`;
  if (l === 'ZH') return dirText ? \`您已到达。\${name} 位于 \${dirText}\` : \`您已到达 \${name}\`;
  return dirText ? \`You have arrived. \${name} is \${dirText}\` : \`You have arrived at \${name}\`;
}`;

function replaceSafe(original, target, replacement) {
  let modified = original.split(target).join(replacement);
  const targetCRLF = target.replace(/\n/g, '\r\n');
  modified = modified.split(targetCRLF).join(replacement.replace(/\n/g, '\r\n'));
  return modified;
}

content = replaceSafe(content, targetDirections, replacementDirections);
content = replaceSafe(content, targetApproach, replacementApproach);
content = replaceSafe(content, targetArrival, replacementArrival);

fs.writeFileSync('src/hooks/useGeofencing.ts', content, 'utf8');
console.log('useGeofencing patched with full multilingual support');
