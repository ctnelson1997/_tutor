public class Main {
  public static void main(String[] args) {
    String a = "hi";
    String b = new String("hi");
    System.out.println(a == b);
    System.out.println(a.equals(b));
  }
}
