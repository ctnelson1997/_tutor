public class Main {
  static long[] memo = new long[60];
  static long fib(int n) { if (n < 2) return n; if (memo[n] != 0) return memo[n]; return memo[n] = fib(n - 1) + fib(n - 2); }
  static double avg(int[] a) { int s = 0; for (int x : a) s += x; return s / a.length; }
  public static void main(String[] args) {
    long big = 3000000000L;
    System.out.println(big);
    long fact = 1;
    for (int i = 1; i <= 20; i++) fact *= i;
    System.out.println(fact);
    System.out.println(fib(50));
    long five = 5000000000L;
    long neg = -five;
    System.out.println(neg);
    System.out.println(Long.MAX_VALUE);
    System.out.println(0xFF + " " + 017 + " " + 0b101);
    char c = 'A';
    System.out.println(c);
    for (char d = 'a'; d <= 'e'; d++) System.out.print(d);
    System.out.println();
    char e = 'a'; e += 2;
    System.out.println(e);
    int x = 'a';
    System.out.println(x);
    int salary = 1000; salary *= 1.5;
    System.out.println(salary);
    int y = 5; y += 2.7;
    System.out.println(y);
    System.out.println((byte) 200 + " " + (short) 40000 + " " + (long) 3.9e10);
    System.out.println(5.0 / 0 + " " + 0.0 / 0.0);
    boolean flag = false; flag |= true;
    System.out.println((true & false) + " " + flag);
    System.out.println((1 << 4) + " " + (-16 >> 2) + " " + (-16 >>> 28));
    System.out.println(avg(new int[]{1, 2}));
    float f = 1.1f;
    System.out.println(f * 3);
    System.out.println(Math.rint(2.5));
  }
}
