# end='' across several calls and loop iterations builds lines piece by piece; stdout must not gain extra newlines
row = 0
for row in range(1, 4):
    for col in range(1, 6):
        print(row * col, end="")
        if col < 5:
            print("\t", end="")
    print()
stars = ""
for i in range(5):
    print("*", end="")
    stars += "*"
print(" <- five stars")
print("[", end="")
for n in [3, 1, 4, 1, 5]:
    print(n, end=", " if n != 5 else "")
print("]")
print("partial", end="")
print(" and", end=" ")
print("final")
last = row
