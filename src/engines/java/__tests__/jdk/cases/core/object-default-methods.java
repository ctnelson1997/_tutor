public class Main {
  static class Dog { String name; Dog(String n) { name = n; } }
  public static void main(String[] args) {
    Dog a = new Dog("Rex");
    Dog b = a;
    Dog c = new Dog("Rex");
    System.out.println(a.equals(b) + " " + a.equals(c));
  }
}
