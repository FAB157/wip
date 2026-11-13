const fs = require('fs');
const path = require('path');
const dir = __dirname;
const J = JSON.parse(fs.readFileSync(path.join(dir, 'spot2.json'), 'utf8'));
const names = ['s2ov1', 's2ov2', 's2ov3', 's2ov4', 's2ec1', 's2ec2'];
for (const L of Object.keys(J)) {
  J[L].forEach((t, i) => fs.writeFileSync(path.join(dir, `${names[i]}_${L}.txt`), t, 'utf8'));
  console.log('scritti', L);
}
