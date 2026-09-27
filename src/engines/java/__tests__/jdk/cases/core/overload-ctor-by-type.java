public class Main {
  static class Temp {
    double degrees; String unit;
    Temp(double d) { degrees = d; unit = "C"; }
    Temp(String s) { degrees = 0; unit = s; }
  }
  public static void main(String[] args) {
    Temp a = new Temp(21.5);
    Temp b = new Temp("F");
    System.out.println(a.degrees + a.unit + " " + b.degrees + b.unit);
  }
}
