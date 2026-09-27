public class Main {
  static class BankAccount {
    private String owner;
    private double balance;
    public BankAccount(String owner, double initial) {
      this.owner = owner;
      this.balance = initial;
    }
    public void deposit(double amt) {
      if (isValid(amt)) balance += amt;
    }
    public boolean withdraw(double amt) {
      if (!isValid(amt) || amt > balance) return false;
      balance -= amt;
      return true;
    }
    private boolean isValid(double amt) { return amt > 0; }
    public double getBalance() { return balance; }
    public String getOwner() { return owner; }
  }
  public static void main(String[] args) {
    BankAccount acct = new BankAccount("Kim", 50.0);
    acct.deposit(25.5);
    boolean ok = acct.withdraw(100);
    boolean ok2 = acct.withdraw(10);
    System.out.println(acct.getOwner() + " " + acct.getBalance() + " " + ok + " " + ok2);
  }
}
