# print's sep and end keywords (empty, multi-char, newline), flush=True, and print() with no arguments
a, b, c = 1, "two", 3.0
print(a, b, c)
print(a, b, c, sep="")
print(a, b, c, sep=", ")
print(a, b, c, sep=" -> ", end=" <end>\n")
print(a, b, c, sep="\n")
print("no newline here", end="")
print(" ...continued", end="!\n")
print()
print(sep="xx")
print(end="")
print("after blank lines", flush=True)
print("multi", "line", "end", end="\n\n")
print("sep none", "uses space", sep=None, end=None)
label = "done"
print(label, sep="|", end="|\n", flush=True)
