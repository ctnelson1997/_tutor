public class Main {
  static String kind(Object o) {
    return switch (o) {
      case null -> "null";
      case Integer i when i > 100 -> "big int " + i;
      case Integer i -> "int " + i;
      case String s when s.isEmpty() -> "empty string";
      case String s -> "string of " + s.length();
      default -> "other";
    };
  }

  static int daysIn(String month) {
    switch (month) {
      case "feb":
        return 28;
      case "apr": case "jun": case "sep": case "nov":
        return 30;
      default:
        return 31;
    }
  }

  public static void main(String[] args) {
    // fall-through, and default in the middle falling into the next case
    for (int x = 0; x < 4; x++) {
      StringBuilder sb = new StringBuilder();
      switch (x) {
        case 1:
          sb.append("one ");
        default:
          sb.append("default ");
        case 3:
          sb.append("three");
          break;
        case 0:
          sb.append("zero");
      }
      System.out.println(x + ": " + sb);
    }

    System.out.println(daysIn("feb") + " " + daysIn("jun") + " " + daysIn("jan"));

    // arrow rules: several labels, a block with break, chars
    char grade = 'B';
    switch (grade) {
      case 'A', 'B' -> {
        System.out.println("good");
        if (grade == 'B') break;
        System.out.println("not reached");
      }
      case 'C' -> System.out.println("ok");
      default -> System.out.println("hmm");
    }

    // switch expressions: yield from colon groups and from arrow blocks
    int day = 6;
    String type = switch (day) {
      case 1, 2, 3, 4, 5:
        yield "weekday";
      default: {
        String w = "week";
        yield w + "end";
      }
    };
    int len = switch (type) {
      case "weekend" -> {
        int base = 7;
        yield base * 2;
      }
      default -> 0;
    };
    System.out.println(type + " " + len);

    // a switch expression as an argument, and nested in another
    System.out.println(Math.max(switch (day % 3) { case 0 -> 10; default -> 20; }, 15));
    int code = switch (day) {
      case 6 -> switch (len) { case 14 -> 1; default -> 2; };
      default -> 3;
    };
    System.out.println("code " + code);

    // pattern labels, guards and case null
    Object[] things = { 5, 500, "", "hello", null, 2.5 };
    for (Object o : things) System.out.println(kind(o));

    // the same name declared in two separate rule blocks
    for (int i = 0; i < 2; i++) {
      switch (i) {
        case 0 -> { int v = 100; System.out.println("v=" + v); }
        default -> { int v = 200; System.out.println("v=" + v); }
      }
    }

    // a boxed selector
    Integer boxed = 2;
    switch (boxed) {
      case 1 -> System.out.println("one");
      case 2 -> System.out.println("two");
      default -> System.out.println("many");
    }
  }
}
