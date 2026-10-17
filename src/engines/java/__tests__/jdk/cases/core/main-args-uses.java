public class Main {
  static int count(String[] items) { return items.length; }

  public static void main(String[] args) {
    System.out.println("count " + count(args));
    for (String a : args) System.out.println("arg " + a);
    if (args.length > 0) System.out.println("first " + args[0]);
    else System.out.println("no arguments");
  }
}
