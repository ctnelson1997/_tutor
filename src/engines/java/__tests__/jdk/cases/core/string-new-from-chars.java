public class Main {
  public static void main(String[] args) {
    char[] cs = "hello".toCharArray();
    char tmp = cs[0]; cs[0] = cs[4]; cs[4] = tmp;
    String s = new String(cs);
    System.out.println(s);
    System.out.println(String.valueOf(cs));
  }
}
