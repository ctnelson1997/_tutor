public class Main {
  public static void main(String[] args) {
    try {
      Validator.check(-1);
    } catch (IllegalArgumentException e) {
      System.out.println("caught " + e.getMessage());
    }
  }
}
class Validator {
  static void check(int x) {
    if (x < 0) throw new IllegalArgumentException("negative: " + x);
  }
}
