public class Main {
  public static void main(String[] args) {
    double principal = 1000.0;
    double rate = 0.05;
    for (int year = 1; year <= 5; year++) {
      principal = principal * (1 + rate);
      System.out.println("Year " + year + ": $" + Math.round(principal * 100) / 100.0);
    }
  }
}
