import java.util.*;
import java.util.function.*;
import java.util.stream.*;

// #16: enums, records, inner, local and anonymous classes, lambdas and method
// references, the library's functional methods, comparators, streams, Optional.
public class Main {
  enum Planet {
    MERCURY(3.303e+23, 2.4397e6), EARTH(5.976e+24, 6.37814e6);
    private final double mass, radius;
    Planet(double mass, double radius) { this.mass = mass; this.radius = radius; }
    double gravity() { return 6.67300E-11 * mass / (radius * radius); }
  }

  enum Op {
    PLUS("+") { int apply(int a, int b) { return a + b; } },
    TIMES("*") { int apply(int a, int b) { return a * b; } };
    final String symbol;
    Op(String symbol) { this.symbol = symbol; }
    abstract int apply(int a, int b);
  }

  record Point(int x, int y) implements Comparable<Point> {
    Point {
      if (x < 0) throw new IllegalArgumentException("negative x: " + x);
    }
    static Point origin() { return new Point(0, 0); }
    double dist() { return Math.sqrt(x * x + y * y); }
    public int compareTo(Point o) { return Double.compare(dist(), o.dist()); }
  }

  record Pair<A, B>(A first, B second) {}

  private int total = 100;
  class Account {
    int balance;
    Account(int b) { balance = b; total += b; }
    int bankTotal() { return Main.this.total; }
  }

  interface Shape { double area(); default String describe() { return getClass().getSimpleName() + " " + area(); } }

  static Iterable<Integer> countdown(int from) {
    return () -> new Iterator<Integer>() {
      int n = from;
      public boolean hasNext() { return n > 0; }
      public Integer next() { return n--; }
    };
  }

  public static void main(String[] args) {
    // Enums
    for (Planet p : Planet.values()) System.out.printf("%s %.2f %d%n", p, p.gravity(), p.ordinal());
    System.out.println(Planet.valueOf("EARTH").name() + " " + Planet.EARTH.compareTo(Planet.MERCURY));
    for (Op op : Op.values()) System.out.println("6 " + op.symbol + " 7 = " + op.apply(6, 7));
    try {
      Planet.valueOf("PLUTO");
    } catch (IllegalArgumentException e) {
      System.out.println(e.getMessage());
    }
    Op o = Op.TIMES;
    String word = switch (o) {
      case PLUS -> "add";
      case TIMES -> "multiply";
    };
    System.out.println(word + " " + (o == Op.TIMES) + " " + EnumOrder.sorted());

    // Records
    Point a = new Point(3, 4), b = new Point(3, 4), c = Point.origin();
    System.out.println(a + " " + a.equals(b) + " " + (a.hashCode() == b.hashCode()) + " " + a.dist() + " " + c.compareTo(a));
    Set<Point> points = new HashSet<>(List.of(a, b, c));
    System.out.println(points.size() + " " + new Pair<>("k", 2) + " " + new Pair<>("k", 2).equals(new Pair<>("k", 2)));
    try {
      new Point(-1, 0);
    } catch (IllegalArgumentException e) {
      System.out.println(e.getMessage());
    }

    // Inner, local and anonymous classes
    Main bank = new Main();
    Main.Account acct = bank.new Account(50);
    System.out.println(acct.balance + " " + acct.bankTotal() + " " + bank.total);
    int bonus = 7;
    class Scorer {
      int score(int base) { return base + bonus; }
    }
    System.out.println(new Scorer().score(10));
    Shape square = new Shape() {
      public double area() { return bonus * bonus; }
    };
    System.out.println(square.area() + " " + square.describe().startsWith(" ") + " " + square.getClass().getName());
    for (int n : countdown(3)) System.out.print(n + " ");
    System.out.println();

    // Lambdas and method references
    int offset = 10;
    Function<Integer, Integer> addOffset = x -> x + offset;
    BiFunction<Integer, Integer, Integer> mul = (x, y) -> { int r = x * y; return r; };
    Supplier<List<String>> fresh = ArrayList::new;
    Function<String, Integer> parse = Integer::parseInt;
    UnaryOperator<String> shout = String::toUpperCase;
    IntFunction<int[]> makeArray = int[]::new;
    String prefix = "> ";
    Function<String, String> withPrefix = prefix::concat;
    System.out.println(addOffset.apply(5) + " " + mul.apply(6, 7) + " " + fresh.get() + " " + parse.apply("42") + " "
        + shout.apply("hi") + " " + makeArray.apply(3).length + " " + withPrefix.apply("x"));
    Function<Integer, Integer> twice = addOffset.andThen(x -> x * 2);
    Function<Integer, Integer> first = addOffset.compose(x -> x * 2);
    Predicate<String> empty = String::isEmpty;
    System.out.println(twice.apply(1) + " " + first.apply(1) + " " + empty.negate().test("") + " " + Predicate.not(empty).test("a")
        + " " + Function.<String>identity().apply("same"));
    Runnable r = () -> System.out.println("ran");
    r.run();

    // Comparators
    List<String> words = new ArrayList<>(List.of("pear", "fig", "banana", "kiwi", "apple"));
    words.sort(Comparator.comparing(String::length).thenComparing(Comparator.reverseOrder()));
    System.out.println(words);
    words.sort(Comparator.comparing((String s) -> s.charAt(s.length() - 1)).thenComparing(s -> s));
    System.out.println(words);
    List<Point> pts = new ArrayList<>(List.of(new Point(1, 5), new Point(2, 1), new Point(1, 2)));
    pts.sort(Comparator.comparingInt(Point::x).thenComparingInt(Point::y).reversed());
    System.out.println(pts);
    Collections.sort(words, (s, t) -> t.compareTo(s));
    System.out.println(words);

    // The collections' functional methods
    Map<String, Integer> counts = new TreeMap<>();
    for (String w : "the cat and the hat and the bat".split(" ")) counts.merge(w, 1, Integer::sum);
    counts.computeIfPresent("cat", (k, v) -> v + 100);
    counts.compute("dog", (k, v) -> v == null ? 1 : v + 1);
    counts.computeIfAbsent("emu", k -> k.length());
    StringBuilder sb = new StringBuilder();
    counts.forEach((k, v) -> sb.append(k).append('=').append(v).append(' '));
    System.out.println(sb.toString().trim());
    List<Integer> nums = new ArrayList<>(List.of(5, 3, 8, 1, 9, 2));
    nums.removeIf(n -> n % 2 == 0);
    nums.replaceAll(n -> n * 10);
    nums.forEach(n -> System.out.print(n + ";"));
    System.out.println();

    // Streams
    List<Integer> data = List.of(4, 8, 15, 16, 23, 42);
    System.out.println(data.stream().filter(n -> n % 2 == 0).map(n -> n / 2).collect(Collectors.toList()));
    System.out.println(data.stream().mapToInt(Integer::intValue).sum() + " " + data.stream().mapToInt(n -> n).average().getAsDouble()
        + " " + data.stream().count() + " " + data.stream().anyMatch(n -> n > 40) + " " + data.stream().allMatch(n -> n > 4));
    System.out.println(Stream.of("b", "a", "c", "a").distinct().sorted().collect(Collectors.joining(", ", "[", "]")));
    System.out.println(IntStream.rangeClosed(1, 5).map(i -> i * i).boxed().collect(Collectors.toList()));
    System.out.println(Stream.iterate(1, x -> x * 3).limit(5).toList() + " " + IntStream.range(0, 4).reduce(0, Integer::sum));
    Map<Integer, List<String>> byLength = Stream.of("aa", "b", "cc", "ddd").collect(Collectors.groupingBy(String::length));
    System.out.println(byLength + " " + Stream.of("x", "yy").collect(Collectors.toMap(s -> s, String::length)));
    System.out.println(Stream.of(List.of(1, 2), List.of(3)).flatMap(List::stream).map(String::valueOf).collect(Collectors.joining("+")));
    List<String> order = new ArrayList<>();
    Stream.of(1, 2, 3).peek(x -> order.add("peek" + x)).filter(x -> x > 1).forEach(x -> order.add("use" + x));
    System.out.println(order);
    Stream<Integer> once = data.stream();
    once.count();
    try {
      once.count();
    } catch (IllegalStateException e) {
      System.out.println(e.getMessage());
    }
    System.out.println("hello".chars().filter(ch -> ch == 'l').count() + " " + Arrays.stream(new int[] {3, 1, 2}).max().getAsInt());

    // Optional
    Optional<Point> far = pts.stream().max(Comparator.naturalOrder());
    Optional<String> none = Stream.<String>empty().findFirst();
    System.out.println(far.get() + " " + far.map(Point::x).orElse(-1) + " " + none.isPresent() + " " + none.orElse("none") + " " + none);
    try {
      none.get();
    } catch (NoSuchElementException e) {
      System.out.println(e.getMessage());
    }

    // Class literals
    System.out.println(String.class.getName() + " " + int.class + " " + (a.getClass() == Point.class) + " " + int[].class.getName());
  }

  enum EnumOrder { LOW, MID, HIGH;
    static String sorted() {
      List<EnumOrder> list = new ArrayList<>(List.of(HIGH, LOW, MID));
      Collections.sort(list);
      return list.toString();
    }
  }
}
