# Assignment vs copy.copy (shallow) vs copy.deepcopy on nested lists and on objects
import copy

grid = [[1, 2], [3, 4]]
alias = grid
shallow = copy.copy(grid)
deep = copy.deepcopy(grid)
grid[0][0] = 99
grid.append([5, 6])
print(alias)
print(shallow)
print(deep)
print(alias is grid, shallow is grid, shallow[0] is grid[0], deep[0] is grid[0])

class Team:
    def __init__(self, name, members):
        self.name = name
        self.members = members

a = Team("A", ["Ann", "Bo"])
b = copy.copy(a)
c = copy.deepcopy(a)
b.name = "B"
b.members.append("Cy")
print(a.name, a.members)
print(b.name, b.members)
print(c.name, c.members)
row = [0] * 3
board = [row] * 3          # three references to one row
board[1][1] = "X"
print(board)
