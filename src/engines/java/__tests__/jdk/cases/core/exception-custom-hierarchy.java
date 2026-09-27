public class Main {
  static class InsufficientFundsException extends Exception {
    InsufficientFundsException(String msg) { super(msg); }
  }
  static void withdraw(double bal, double amt) throws InsufficientFundsException {
    if (amt > bal) throw new InsufficientFundsException("need " + (amt - bal) + " more");
    System.out.println("ok");
  }
  public static void main(String[] args) {
    try {
      withdraw(100, 50);
      withdraw(100, 150);
    } catch (InsufficientFundsException e) {
      System.out.println("Error: " + e.getMessage());
    } finally {
      System.out.println("done");
    }
  }
}
