public class Main {
  static int calls = 0;
  static boolean sideEffect() { calls++; return false; }

  public static void main(String[] args) {
    // Assertions are off unless java runs with -ea, so the condition isn't even evaluated.
    assert sideEffect() : "never checked";
    assert false;
    System.out.println("calls " + calls);

    Object lock = new Object();
    int n = 0;
    synchronized (lock) {
      n++;
    }
    System.out.println("n " + n);

    Object nothing = null;
    try {
      synchronized (nothing) {
        System.out.println("not reached");
      }
    } catch (NullPointerException e) {
      System.out.println("NPE");
    }

    ;;
    for (int i = 0; i < 3; i++);
    System.out.println("done");
  }
}
