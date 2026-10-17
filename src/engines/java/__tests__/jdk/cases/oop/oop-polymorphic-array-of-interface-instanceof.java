public class Main {
  interface Payable { double pay(); }
  static class Hourly implements Payable {
    double rate; int hours;
    Hourly(double r, int h) { rate = r; hours = h; }
    public double pay() { return rate * hours; }
  }
  static class Salaried implements Payable {
    double salary;
    Salaried(double s) { salary = s; }
    public double pay() { return salary / 12; }
  }
  public static void main(String[] args) {
    Payable[] staff = { new Hourly(20, 10), new Salaried(60000) };
    double total = 0;
    for (Payable p : staff) {
      total += p.pay();
      if (p instanceof Hourly) System.out.println("hourly");
    }
    System.out.println(total);
  }
}
