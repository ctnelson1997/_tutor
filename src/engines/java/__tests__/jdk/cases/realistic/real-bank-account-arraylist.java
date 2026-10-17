import java.util.ArrayList;
public class Main {
  static class BankAccount {
    private String owner;
    private double balance;
    private ArrayList<String> history;

    public BankAccount(String owner) {
      this.owner = owner;
      this.balance = 0.0;
      this.history = new ArrayList<>();
    }

    public void deposit(double amount) {
      if (amount <= 0) {
        throw new IllegalArgumentException("Deposit must be positive");
      }
      balance += amount;
      history.add("deposit " + amount);
    }

    public void withdraw(double amount) {
      if (amount > balance) {
        history.add("FAILED withdraw " + amount);
        return;
      }
      balance -= amount;
      history.add("withdraw " + amount);
    }

    public double getBalance() { return balance; }
    public ArrayList<String> getHistory() { return history; }
  }

  public static void main(String[] args) {
    BankAccount acct = new BankAccount("Riley");
    acct.deposit(100);
    acct.withdraw(30.5);
    acct.withdraw(500);
    try {
      acct.deposit(-5);
    } catch (IllegalArgumentException e) {
      System.out.println("Error: " + e.getMessage());
    }
    System.out.println("Balance: " + acct.getBalance());
    for (String h : acct.getHistory()) {
      System.out.println(" - " + h);
    }
  }
}
