// Template literals: expressions, calls, ternaries, nested templates, multi-line text spanning source lines
const user = { first: "Grace", last: "Hopper", langs: ["COBOL", "FLOW-MATIC"] };
const score = 87;

const greeting = `Hello, ${user.first} ${user.last}!`;
console.log(greeting);
console.log(`Score: ${score} (${score >= 90 ? "A" : score >= 80 ? "B" : "C"})`);
console.log(`Sum: ${1 + 2 * 3}, upper: ${user.last.toUpperCase()}`);

const list = `Languages:
${user.langs.map((lang, i) => `  ${i + 1}. ${lang}`).join("\n")}
Total: ${user.langs.length}`;
console.log(list);

const card = `
  +----------+
  | ${String(score).padStart(8)} |
  +----------+`;
console.log(card);

const nested = `outer ${`inner ${`deepest ${score % 10}`}`}`;
console.log(nested);
const escaped = `backtick \` dollar \${not} and \\ slash`;
console.log(escaped, escaped.length);
const empty = `${""}${null}${undefined}${[1, 2]}${{}}`;
console.log(empty);
