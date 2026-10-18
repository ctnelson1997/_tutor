# ends uncaught: a custom exception class with attributes is raised and never caught
class InvalidMoveError(Exception):
    def __init__(self, row, col, reason):
        super().__init__(f"cannot play ({row}, {col}): {reason}")
        self.row = row
        self.col = col

board = [[" "] * 3 for _ in range(3)]

def play(row, col, mark):
    if not (0 <= row < 3 and 0 <= col < 3):
        raise InvalidMoveError(row, col, "off the board")
    if board[row][col] != " ":
        raise InvalidMoveError(row, col, "square taken")
    board[row][col] = mark

play(1, 1, "X")
play(0, 2, "O")
print(["".join(r) for r in board])
play(1, 1, "O")
print("never printed")
