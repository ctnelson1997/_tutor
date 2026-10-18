# [[0]*3]*3 repeats one row object, so setting one cell changes every row; the comprehension fix makes separate rows
grid = [[0] * 3] * 3
grid[0][0] = 1
print(grid)
print(grid[0] is grid[1], grid[1] is grid[2])
good = [[0] * 3 for _ in range(3)]
good[0][0] = 1
print(good)
print(good[0] is good[1])
row = [0, 0]
board = [row, row]
board[1][1] = 5
print(board, row)
board[0] = [9, 9]
board[1][0] = 7
print(board, row)
flat = [0] * 3
flat[0] = 1
print(flat)
objs = [[]] * 2
objs[0].append("x")
print(objs)
