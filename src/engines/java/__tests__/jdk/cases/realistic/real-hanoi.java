public class Main {
  static int moves = 0;
  public static void hanoi(int n, char from, char to, char via) {
    if (n == 0) return;
    hanoi(n - 1, from, via, to);
    System.out.println("Move disk " + n + " from " + from + " to " + to);
    moves++;
    hanoi(n - 1, via, to, from);
  }
  public static void main(String[] args) {
    hanoi(3, 'A', 'C', 'B');
    System.out.println("Total moves: " + moves);
  }
}
