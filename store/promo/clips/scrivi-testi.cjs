const j = require('./lingue.json');
const fs = require('fs');
const n = ['ov1', 'ov2', 'ov3', 'ov4', 'ov5', 'ov6', 'ec1', 'ec2'];
for (const L of ['ru', 'zh']) j[L].forEach((s, i) => fs.writeFileSync(`${n[i]}_${L}.txt`, s, 'utf8'));
console.log('ok');
