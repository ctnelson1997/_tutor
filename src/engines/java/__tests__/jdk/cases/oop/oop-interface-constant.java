public class Main {
  interface Config { int LIMIT = 3; }
  static class Worker implements Config {
    int run() { return LIMIT * 2; }
  }
  public static void main(String[] args) {
    System.out.println(new Worker().run() + " " + Config.LIMIT);
  }
}
