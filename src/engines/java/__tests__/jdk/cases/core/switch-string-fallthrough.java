public class Main {
  public static void main(String[] args) {
    String cmd = "b";
    switch (cmd) {
      case "a":
        System.out.println("A");
      case "b":
        System.out.println("B");
      case "c":
        System.out.println("C");
        break;
      default:
        System.out.println("D");
    }
  }
}
