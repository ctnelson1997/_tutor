public class Main {
  enum Color { RED, GREEN, BLUE }
  public static void main(String[] args) {
    Color c = Color.GREEN;
    System.out.println(c);
    System.out.println(c.ordinal());
    switch (c) {
      case RED: System.out.println("stop"); break;
      case GREEN: System.out.println("go"); break;
      default: System.out.println("?");
    }
    for (Color k : Color.values()) System.out.print(k + " ");
    System.out.println();
  }
}
