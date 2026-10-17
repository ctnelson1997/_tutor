public class Main {
  public static void main(String[] args) {
    String word = "a1b";
    for (char c : word.toCharArray()) {
      switch (c) {
        case 'a': System.out.print("A"); break;
        case '1': System.out.print("one"); break;
        default: System.out.print("?");
      }
    }
    System.out.println();
  }
}
