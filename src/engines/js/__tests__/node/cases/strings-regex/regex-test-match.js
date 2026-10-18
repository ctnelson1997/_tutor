// RegExp test(), match() without g (groups, index) and with g (all matches), flags i/m, and null when nothing matches
const emailRe = /^[\w.]+@[\w]+\.[a-z]{2,}$/i;
const emails = ["ada@lovelace.org", "bad@", "Grace.Hopper@NAVY.MIL", "no spaces@x.com"];
const valid = emails.filter(e => emailRe.test(e));
console.log(valid);

const dateText = "Due 2024-03-15, paid 2024-04-01";
const first = dateText.match(/(\d{4})-(\d{2})-(\d{2})/);
console.log(first[0], first[1], first[2], first[3], first.index, first.length);
const allDates = dateText.match(/\d{4}-\d{2}-\d{2}/g);
console.log(allDates);
const none = dateText.match(/\d{5}/);
const noneGlobal = dateText.match(/xyz/g);
console.log(none, noneGlobal);

const poem = "Roses are red\nviolets are blue\nsugar is sweet";
console.log(poem.match(/^\w+/gm));
console.log(poem.match(/^\w+/g));
console.log(/RED/i.test(poem), /RED/.test(poem), /blue$/m.test(poem), /blue$/.test(poem));

const phone = /^\(?(\d{3})\)?[-. ]?(\d{3})[-. ]?(\d{4})$/;
const phones = ["(608) 555-1234", "608.555.9876", "6085551", "608-555-0000"];
const normalized = phones.map(p => {
  const m = p.match(phone);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "invalid";
});
console.log(normalized);
