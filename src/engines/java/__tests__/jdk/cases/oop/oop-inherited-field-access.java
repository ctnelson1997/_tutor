public class Main {
  static class Shape {
    protected String color = "red";
    int sides;
  }
  static class Square extends Shape {
    Square() { sides = 4; }
    String info() { return color + " " + sides; }
  }
  public static void main(String[] args) {
    Square s = new Square();
    System.out.println(s.info());
    System.out.println(s.color);
  }
}
