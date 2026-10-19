# Dicts with tuple and int keys: grid coordinates, 1/True/1.0 are one key, negative and big int keys
grid = {}
for r in range(2):
    for c in range(3):
        grid[(r, c)] = r * 3 + c
print(grid)
print(grid[1, 2], (0, 0) in grid, (2, 0) in grid)
grid[0, 1] = "x"
corner = grid.get((1, 0))
print(corner, grid[(0, 1)])
mixed = {1: "int"}
mixed[True] = "bool"
mixed[1.0] = "float"
print(mixed, len(mixed))
codes = {404: "not found", -1: "error", 0: "ok", 10**20: "huge"}
print(codes[-1], codes[10**20], sorted(codes))
codes[-2] = "other"
print(codes)
nested_key = {((1, 2), (3,)): "tuple of tuples"}
print(nested_key[((1, 2), (3,))])
try:
    bad = {[1, 2]: "list"}
except TypeError as e:
    print("TypeError:", e)
moves = {(0, 1): "right", (0, -1): "left", (1, 0): "down"}
pos = (0, 0)
for step in [(0, 1), (1, 0), (0, 1)]:
    pos = (pos[0] + step[0], pos[1] + step[1])
    print(moves[step], pos)
visited = {pos: True, (0, 0): False}
print(visited)
