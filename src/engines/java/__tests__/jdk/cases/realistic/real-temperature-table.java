public class Main {
  public static double toFahrenheit(double c) {
    return c * 9 / 5 + 32;
  }
  public static void main(String[] args) {
    System.out.println("Celsius  Fahrenheit");
    for (int c = -10; c <= 40; c += 10) {
      System.out.printf("%7d  %10.1f%n", c, toFahrenheit(c));
    }
  }
}
