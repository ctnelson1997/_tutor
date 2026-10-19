# Plays a scripted game of tic-tac-toe on a 2D list board and detects the winner
def new_board():
    return [[" "] * 3 for _ in range(3)]


def print_board(board):
    for i, row in enumerate(board):
        print(" " + " | ".join(row))
        if i < 2:
            print("---+---+---")


def winner(board):
    lines = []
    for i in range(3):
        lines.append(board[i])
        lines.append([board[r][i] for r in range(3)])
    lines.append([board[i][i] for i in range(3)])
    lines.append([board[i][2 - i] for i in range(3)])
    for line in lines:
        if line[0] != " " and line.count(line[0]) == 3:
            return line[0]
    return None


def play(moves):
    board = new_board()
    player = "X"
    for turn, (r, c) in enumerate(moves, start=1):
        if board[r][c] != " ":
            print(f"Turn {turn}: square {r},{c} taken, skipping")
            continue
        board[r][c] = player
        w = winner(board)
        if w:
            print(f"Turn {turn}: {w} wins!")
            return board, w
        player = "O" if player == "X" else "X"
    return board, None


moves = [(1, 1), (0, 0), (0, 2), (1, 1), (2, 2), (2, 0), (0, 1), (2, 1)]
final_board, result = play(moves)
print_board(final_board)
empty = sum(row.count(" ") for row in final_board)
print("Result:", result, "| empty squares:", empty)
