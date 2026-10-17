public class Main {
  public static void main(String[] args) {
    String s = "abc";
    try {
      char c = s.charAt(5);
      System.out.println("got " + c);
    } catch (StringIndexOutOfBoundsException e) {
      System.out.println("caught");
    }
  }
}
