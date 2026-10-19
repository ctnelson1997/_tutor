# Solves the Towers of Hanoi for three disks, moving disks between three peg lists
def hanoi(n, source, target, spare, pegs, moves):
    if n == 0:
        return
    hanoi(n - 1, source, spare, target, pegs, moves)
    disk = pegs[source].pop()
    pegs[target].append(disk)
    moves.append((disk, source, target))
    print(f"Move disk {disk} from {source} to {target}: {pegs}")
    hanoi(n - 1, spare, target, source, pegs, moves)


n = 3
pegs = {"A": list(range(n, 0, -1)), "B": [], "C": []}
moves = []
print("Start:", pegs)
hanoi(n, "A", "C", "B", pegs, moves)
print("Finished in", len(moves), "moves; expected", 2 ** n - 1)
print("Final pegs:", pegs)
largest_moves = [m for m in moves if m[0] == n]
print("Largest disk moved", len(largest_moves), "time(s)")
