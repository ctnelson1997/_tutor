public class Main {
  public static void main(String[] args) {
    // break out of two loops from a while nested in a for
    int found = -1;
    search:
    for (int i = 0; i < 4; i++) {
      int j = 0;
      while (j < 4) {
        if (i + j == 5) { found = i * 10 + j; break search; }
        j++;
      }
    }
    System.out.println("found " + found);

    // continue an outer do-while: its condition still runs
    int n = 0, visits = 0;
    outer:
    do {
      n++;
      for (int k = 0; k < 3; k++) {
        if (k == 1) continue outer;
        visits++;
      }
    } while (n < 3);
    System.out.println("n " + n + " visits " + visits);

    // break out of a labeled block
    String status = "start";
    check: {
      if (n == 3) { status = "early"; break check; }
      status = "late";
    }
    System.out.println(status);

    // a labeled switch, left by name from inside a loop
    int total = 0;
    sw:
    switch (n) {
      case 3:
        for (int i = 0; i < 10; i++) {
          if (i == 4) break sw;
          total += i;
        }
        total = -1;
        break;
      default:
        total = -2;
    }
    System.out.println("total " + total);

    // two labels on one loop, and an unlabeled break inside a switch inside a loop
    int count = 0;
    a: b: for (int i = 0; i < 5; i++) {
      switch (i) {
        case 1: continue b;
        case 3: break;
        default: count += 10;
      }
      if (i == 4) break a;
      count++;
    }
    System.out.println("count " + count);
  }
}
