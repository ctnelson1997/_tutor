public class Main {
  public static void main(String[] args) {
    try {
      System.out.println("in try");
      if (args.length == 0) System.exit(0);
      System.out.println("not reached");
    } finally {
      System.out.println("finally does not run after System.exit");
    }
  }
}
