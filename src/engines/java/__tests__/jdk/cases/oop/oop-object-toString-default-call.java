public class Main {
  static class Thing {}
  public static void main(String[] args) {
    Thing t = new Thing();
    String s = t.toString();
    System.out.println(s.startsWith("Main$Thing@") || s.startsWith("Thing@"));
  }
}
