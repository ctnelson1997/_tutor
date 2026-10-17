public class Main {
  public static void main(String[] args) {
    String a = "hi";
    String b = new StringBuilder("hi").toString();
    System.out.println(a == b);
  }
}
