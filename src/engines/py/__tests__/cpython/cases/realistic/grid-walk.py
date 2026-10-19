# Moves a robot around a grid with walls following a string of commands and marks its path
GRID = [
    "#######",
    "#.....#",
    "#.##..#",
    "#..#..#",
    "#.....#",
    "#######",
]
MOVES = {"N": (-1, 0), "S": (1, 0), "E": (0, 1), "W": (0, -1)}


def walk(start, commands):
    row, col = start
    path = [start]
    bumps = 0
    for cmd in commands:
        dr, dc = MOVES[cmd]
        nr, nc = row + dr, col + dc
        if GRID[nr][nc] == "#":
            bumps += 1
            continue
        row, col = nr, nc
        path.append((row, col))
    return (row, col), path, bumps


def draw(path):
    canvas = [list(line) for line in GRID]
    for r, c in path:
        canvas[r][c] = "*"
    sr, sc = path[0]
    canvas[sr][sc] = "S"
    er, ec = path[-1]
    canvas[er][ec] = "E"
    return ["".join(row) for row in canvas]


end, path, bumps = walk((1, 1), "SSSEEENNWNEEE")
print("End position:", end)
print("Steps taken:", len(path) - 1, "Bumps:", bumps)
for line in draw(path):
    print(line)

visited = set(path)
open_cells = sum(row.count(".") for row in GRID)
print(f"Visited {len(visited)} of {open_cells} open cells")
