public class Main {
  static int firstNegative(int[] xs) {
    for (int i = 0; i < xs.length; i++) {
      int x = xs[i];
      if (x < 0) {
        int found = i;
        return found;
      }
    }
    return -1;
  }

  static int risky(int d) {
    int[] box = new int[1];
    box[0] = 10 / d;
    return box[0];
  }

  static class Risky {
    int[] data = new int[2];
    { data[5] = 1; }
  }

  public static void main(String[] args) {
    int[] xs = {3, -1, 4};
    int total = 0;
    outer:
    for (int i = 0; i < 3; i++) {
      for (int j = 0; j < 3; j++) {
        int prod = i * j;
        if (prod == 2) continue outer;
        if (prod > 3) break outer;
        total += prod;
      }
    }
    System.out.println("total " + total);
    System.out.println("negative at " + firstNegative(xs));
    for (int x : xs) {
      int sq = x * x;
      if (sq == 1) {
        int flag = 1;
        continue;
      }
      System.out.println("sq " + sq);
    }
    try {
      int before = 1;
      System.out.println(risky(0) + before);
    } catch (ArithmeticException e) {
      int handled = 2;
      System.out.println("caught " + e.getMessage() + " " + handled);
    } finally {
      int cleanup = 3;
      System.out.println("finally " + cleanup);
    }
    switch (xs.length) {
      case 3: {
        int inCase = 7;
        try {
          int[] tiny = new int[inCase - 7];
          tiny[0] = inCase;
        } catch (ArrayIndexOutOfBoundsException e) {
          System.out.println("switch caught " + inCase);
        }
        break;
      }
      default:
        System.out.println("other");
    }
    try {
      new Risky();
    } catch (ArrayIndexOutOfBoundsException e) {
      System.out.println("init failed: " + e.getMessage());
    }
    int k = 0;
    do {
      int step = k * 2;
      k++;
      if (step == 2) continue;
      System.out.println("step " + step);
    } while (k < 3);
    System.out.println("end " + k);
  }
}
