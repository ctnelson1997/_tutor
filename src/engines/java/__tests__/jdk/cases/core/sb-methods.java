public class Main {
  public static void main(String[] args) {
    StringBuilder sb = new StringBuilder("hello");
    sb.setCharAt(0, 'J');
    sb.delete(1, 3);
    sb.replace(0, 1, "Y");
    System.out.println(sb + " " + sb.indexOf("l"));
  }
}
