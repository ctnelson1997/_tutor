# literal tab characters in output, tab-separated tables, expandtabs, and repr of tabs
header = "name\tqty\tprice"
print(header)
rows = [("pen", 10, 1.5), ("notebook", 2, 3.25), ("a", 100, 0.1)]
for name, qty, price in rows:
    print(name, qty, price, sep="\t")
print("\tindented with a tab")
print("a\tb\tc".expandtabs(4))
print("ab\tc".expandtabs(8) + "|")
line = "x\ty"
print(repr(line), len(line))
print(line.split("\t"))
print("trailing tab\t")
print("\t".join(["1", "2", "3"]))
cells = "\t".join(str(q) for _, q, _ in rows)
print(cells)
