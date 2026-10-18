# enumerate with a start, zip of several lists (stops at the shortest), zip(*) to unzip, dict(zip())
names = ["Ann", "Bo", "Cy"]
scores = [88, 92, 75, 60]
for i, name in enumerate(names, start=1):
    print(i, name)
pairs = list(zip(names, scores))
print(pairs)
for rank, (name, score) in enumerate(sorted(pairs, key=lambda p: -p[1])):
    print(rank, name, score)
gradebook = dict(zip(names, scores))
print(gradebook)
who, pts = zip(*pairs)
print(who, pts)
matrix = [[1, 2, 3], [4, 5, 6]]
print([list(col) for col in zip(*matrix)])
z = zip("ab", [1, 2])
print(list(z), list(z))
