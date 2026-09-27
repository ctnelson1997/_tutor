public class Main {
  public static void main(String[] args) {
    Object o = "hello";
    if (o instanceof String s) {
      System.out.println(s.length());
    }
  }
}
