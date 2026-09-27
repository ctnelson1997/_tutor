public class Main {
  public static void main(String[] args) {
    boolean a = true & false;
    boolean b = true | false;
    boolean c = true ^ true;
    System.out.println(a + " " + b + " " + c);
    boolean flag = false;
    flag |= true;
    System.out.println(flag);
  }
}
