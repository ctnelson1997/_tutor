public class Main {
  static int pick(boolean b) {
    int x;
    if (b) x = 1;
    else x = 2;
    return x;
  }

  public static void main(String[] args) {
    int a;
    a = 5;
    System.out.println(a);
    System.out.println(pick(true) + pick(false));
    int b;
    while (true) {
      b = 3;
      break;
    }
    System.out.println(b);
    int c;
    try {
      c = Integer.parseInt("x");
    } catch (NumberFormatException e) {
      c = -1;
    }
    System.out.println(c);
    int d;
    switch (a) {
      case 5: d = 50; break;
      default: d = 0;
    }
    System.out.println(d);
    int e;
    for (int i = 0; ; i++) {
      if (i == 2) {
        e = i;
        break;
      }
    }
    System.out.println(e);
    String s;
    boolean flag = a > 3;
    if (flag && (s = "yes") != null) System.out.println(s);
    int f, g = 2;
    f = g * 3;
    System.out.println(f + g);
    int h;
    do {
      h = 7;
    } while (false);
    System.out.println(h);
    final int k;
    k = 9;
    System.out.println(k);
    int m, n;
    m = n = 4;
    System.out.println(m + n);
  }
}
