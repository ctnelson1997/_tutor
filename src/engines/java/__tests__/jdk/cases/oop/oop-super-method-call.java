public class Main {
  static class Account {
    double balance;
    Account(double b) { balance = b; }
    public String toString() { return "Account[" + balance + "]"; }
  }
  static class Savings extends Account {
    double rate;
    Savings(double b, double r) { super(b); rate = r; }
    public String toString() { return super.toString() + " @" + rate; }
  }
  public static void main(String[] args) {
    System.out.println(new Savings(100.0, 0.05));
  }
}
