public class Main {
  public static void main(String[] args) {
    String a = null;
    String b = a != null ? a : "default";
    System.out.println(b);
    int[] x = null;
    System.out.println(x == null ? "null array" : "len " + x.length);
  }
}
