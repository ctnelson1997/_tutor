# a partial line (end='') and earlier output are kept when an f-string format spec raises; ends with uncaught ValueError
values = [1, 2, 3.5, "x"]
total = 0
for v in values[:3]:
    total += v
    print(f"{v:>5}", end="")
print()
print("total:", total)
print("formatting float as int:", end=" ")
bad = f"{total:d}"
print("never printed", bad)
