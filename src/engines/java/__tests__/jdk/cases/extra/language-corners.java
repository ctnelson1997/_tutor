import java.util.ArrayList;
import java.util.List;

// Corner cases of the language (#76): the most specific default method, numeric conditionals with boxes,
// final instance constants, generic inner classes, and inner classes of inner classes.
public class Main {
  interface Greeter { default String greet() { return "Greeter"; } }
  interface Polite extends Greeter { default String greet() { return "Polite"; } }
  interface Quiet extends Greeter {}
  static class Butler implements Greeter, Polite {}
  static class Valet implements Polite, Greeter {}
  static class Page implements Quiet, Polite {}
  static class Footman extends Butler implements Greeter {}

  static class Base {
    Base() { System.out.println("Base sees " + describe()); }
    String describe() { return "base"; }
  }

  static class Derived extends Base {
    private final int fixed = 7;
    private final String label = "item" + fixed;
    private final int computed = Integer.parseInt("8");
    String describe() {
      String size;
      switch (3 + 4) {
        case fixed: size = "seven"; break;
        default: size = "other";
      }
      return fixed + " " + label + " " + (label == "item7") + " " + computed + " " + size;
    }
  }

  static class Ring<T> {
    List<T> items = new ArrayList<>();
    class Cursor {
      int at;
      Cursor(int at) { this.at = at; }
      T next() { T t = items.get(at % items.size()); at++; return t; }
    }
    Cursor cursor() { return new Cursor(0); }
  }

  int base = 1;
  class Mid {
    int middle = 10;
    class Inner {
      int own = 100;
      int sum() { return base + middle + own; }
    }
  }

  public static void main(String[] args) {
    System.out.println(new Butler().greet() + " " + new Valet().greet() + " " + new Page().greet() + " " + new Footman().greet());
    Greeter g = new Butler();
    System.out.println(g.greet());

    Object o = true ? Integer.valueOf(1) : Double.valueOf(2.0);
    System.out.println(o);
    Integer i = 5;
    Long l = 7L;
    Object p = false ? i : l;
    System.out.println(p + " " + p.getClass().getSimpleName());
    Character c = 'a';
    Object q = true ? c : i;
    System.out.println(q + " " + q.getClass().getSimpleName());
    Short sh = 3;
    Byte by = 4;
    Object u = true ? sh : by;
    System.out.println(u + " " + u.getClass().getSimpleName());
    int k = 2;
    Object poly = switch (k) { case 2 -> Integer.valueOf(3); default -> Double.valueOf(2.5); };
    var standalone = switch (k) { case 2 -> Integer.valueOf(3); default -> Double.valueOf(2.5); };
    System.out.println(poly + " " + standalone);
    Integer missing = null;
    try {
      Object v = true ? missing : Double.valueOf(1);
      System.out.println(v);
    } catch (NullPointerException e) {
      System.out.println("unboxing null");
    }

    System.out.println(new Derived().describe());

    Ring<String> ring = new Ring<>();
    ring.items.add("a");
    ring.items.add("b");
    Ring<String>.Cursor cursor = ring.new Cursor(1);
    System.out.println(cursor.next().toUpperCase() + cursor.next().toUpperCase());
    System.out.println(ring.cursor().next().length());

    Main outer = new Main();
    Main.Mid mid = outer.new Mid();
    Main.Mid.Inner inner = mid.new Inner();
    Mid.Inner another = outer.new Mid().new Inner();
    outer.base = 5;
    System.out.println(inner.sum() + " " + another.sum());
  }
}
