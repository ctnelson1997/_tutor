public class Main {
  public static void main(String[] args) {
    int day = 3;
    switch (day) {
      case 1 -> System.out.println("Mon");
      case 3 -> System.out.println("Wed");
      default -> System.out.println("Other");
    }
  }
}
