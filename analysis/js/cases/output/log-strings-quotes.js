// strings with quotes, backslashes, newlines and tabs: printed bare at the top level, quoted inside arrays and objects
const plain = "hello";
const single = "it's";
const double = 'say "hi"';
const both = `it's "both"`;
const all = `it's "all" \`three\``;
const escapes = "tab\there\nnew line\\backslash";
const unicode = "caf\u00e9 \u{1F600}";
console.log(plain, single, double, both, all);
console.log([plain, single, double, both, all]);
console.log({ single, double, both });
console.log(escapes);
console.log([escapes]);
console.log(unicode, [unicode], unicode.length);
console.log("", [""], { empty: "" });
console.log("   padded   ", ["   padded   "]);
console.log(JSON.stringify({ q: double }));
const quotes = { [single]: 1, "key with space": 2 };
console.log(quotes);
