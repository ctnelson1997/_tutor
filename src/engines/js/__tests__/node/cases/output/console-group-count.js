// console.group/groupCollapsed/groupEnd indentation (multi-line output, one extra groupEnd), console.count/countReset with and without labels
const tree = { name: "root", children: [{ name: "a", children: [{ name: "a1", children: [] }] }, { name: "b", children: [] }] };
function show(node) {
  console.group(node.name);
  console.count("visit");
  for (const child of node.children) show(child);
  console.groupEnd();
}
show(tree);
console.group();
console.log("unlabeled group");
console.log({ multi: "line object that is long enough", to: ["wrap", "across", "several", "lines", "here"] });
console.groupCollapsed("collapsed");
console.log("inside collapsed");
console.log();
console.groupEnd();
console.groupEnd();
console.groupEnd();
console.count();
console.count();
console.count("visit");
console.countReset("visit");
console.count("visit");
console.log("back at top level");
