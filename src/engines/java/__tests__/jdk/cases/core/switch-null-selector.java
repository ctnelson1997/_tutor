public class Main {
  public static void main(String[] args) {
    String s = null;
    try {
      switch (s) {
        case "a" -> System.out.println("a");
        default -> System.out.println("default");
      }
    } catch (NullPointerException e) {
      System.out.println("NPE");
    }
    String t = null;
    switch (t) {
      case "x":
        System.out.println("x");
        break;
      default:
        System.out.println("never");
    }
  }
}
