// Named capture groups with exec() and match(): .groups, destructuring groups, an optional group that is undefined
const logLine = "2024-05-06 14:32:07 ERROR [db] connection refused";
const logRe = /^(?<date>\d{4}-\d{2}-\d{2}) (?<time>[\d:]+) (?<level>[A-Z]+) \[(?<module>\w+)\] (?<msg>.*)$/;

const m = logRe.exec(logLine);
console.log(m.groups.level, m.groups.module, m.groups.msg);
const { date, time } = m.groups;
console.log(date, time, m.index, m[3]);

const versionRe = /v(?<major>\d+)\.(?<minor>\d+)(?:\.(?<patch>\d+))?/;
const versions = ["v1.2.3", "release v10.0", "none here"];
const parsed = [];
for (const text of versions) {
  const match = text.match(versionRe);
  if (match === null) {
    parsed.push(null);
    continue;
  }
  const { major, minor, patch } = match.groups;
  parsed.push({ major: Number(major), minor: Number(minor), patch: patch ?? "none" });
}
console.log(JSON.stringify(parsed));

const swapped = "Lovelace, Ada".replace(/(?<last>\w+), (?<first>\w+)/, "$<first> $<last>");
console.log(swapped);
const repeatedWord = /\b(?<word>\w+) \k<word>\b/;
console.log(repeatedWord.exec("this is is a test").groups.word, repeatedWord.test("no repeats"));
