public class Main {
  public static void main(String[] args) {
    Integer a = 127, b = 127;
    Integer c = 1000, d = 1000;
    System.out.println((a == b) + " " + (c == d) + " " + c.equals(d));
  }
}
