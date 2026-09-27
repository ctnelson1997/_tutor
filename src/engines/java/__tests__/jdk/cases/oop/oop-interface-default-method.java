public class Main {
  interface Named {
    String name();
    default String shout() { return name().toUpperCase() + "!"; }
  }
  static class Person implements Named {
    public String name() { return "ada"; }
  }
  public static void main(String[] args) {
    System.out.println(new Person().shout());
  }
}
