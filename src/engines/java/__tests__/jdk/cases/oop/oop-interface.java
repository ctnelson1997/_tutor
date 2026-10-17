public class Main {
  public static void main(String[] args) {
    Greeter[] gs = { new Formal(), new Casual() };
    for (Greeter g : gs) System.out.println(g.greet("Sam"));
    System.out.println(gs[0] instanceof Greeter);
  }
}
interface Greeter {
  String greet(String name);
}
class Formal implements Greeter {
  public String greet(String name) { return "Good day, " + name; }
}
class Casual implements Greeter {
  public String greet(String name) { return "Hey " + name; }
}
