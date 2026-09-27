public class Main {
  public static void printBoard(char[][] board) {
    for (int r = 0; r < 3; r++) {
      for (int c = 0; c < 3; c++) {
        System.out.print(board[r][c]);
        if (c < 2) System.out.print("|");
      }
      System.out.println();
      if (r < 2) System.out.println("-+-+-");
    }
  }

  public static boolean hasWon(char[][] b, char p) {
    for (int i = 0; i < 3; i++) {
      if (b[i][0] == p && b[i][1] == p && b[i][2] == p) return true;
      if (b[0][i] == p && b[1][i] == p && b[2][i] == p) return true;
    }
    return (b[0][0] == p && b[1][1] == p && b[2][2] == p)
        || (b[0][2] == p && b[1][1] == p && b[2][0] == p);
  }

  public static void main(String[] args) {
    char[][] board = new char[3][3];
    for (int r = 0; r < 3; r++) {
      for (int c = 0; c < 3; c++) {
        board[r][c] = ' ';
      }
    }
    board[0][0] = 'X';
    board[1][1] = 'X';
    board[2][2] = 'X';
    board[0][2] = 'O';
    printBoard(board);
    System.out.println("X wins? " + hasWon(board, 'X'));
    System.out.println("O wins? " + hasWon(board, 'O'));
  }
}
