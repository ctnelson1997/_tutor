public class Main {
  public static int gcd(int a, int b) {
    if (b == 0) return a;
    return gcd(b, a % b);
  }
  public static int lcm(int a, int b) {
    return a / gcd(a, b) * b;
  }
  public static void main(String[] args) {
    System.out.println("gcd(48, 18) = " + gcd(48, 18));
    System.out.println("lcm(4, 6) = " + lcm(4, 6));
  }
}
