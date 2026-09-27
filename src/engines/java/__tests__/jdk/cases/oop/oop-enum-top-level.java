public class Main {
  public static void main(String[] args) {
    Suit s = Suit.SPADES;
    System.out.println(s == Suit.SPADES);
    System.out.println(s.name());
  }
}
enum Suit { HEARTS, SPADES }
