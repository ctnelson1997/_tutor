// node tagnotes.cjs <py|js> <tag> [max]  — every case with the tag, with its notes
const [lang, tag, max = 40] = process.argv.slice(2);
const all = require(`./results/${lang}-report.json`);
let n = 0;
for (const r of all) if (r.tags.includes(tag) && n++ < max) { console.log(`${r.id} [${r.group}] ${r.tags.join(',')}`); for (const x of r.notes) console.log('    ' + x.slice(0, 260)); }
