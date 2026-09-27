public class Main {
  double total;
  static double avg;
  static class Account { double balance; int count; char grade = 'A'; }
  public static void main(String[] args) {
    double[] d = new double[2];
    d[0] = 1;
    System.out.println(d[0] / 2);
    Main m = new Main();
    m.total = 5;
    System.out.println(m.total / 2);
    avg = 3;
    System.out.println(avg / 2);
    Account acct = new Account();
    acct.balance = 100;
    acct.balance *= 1.05;
    acct.count += 2.9;
    acct.grade += 1;
    acct.grade++;
    System.out.println(acct.balance + " " + acct.count + " " + acct.grade);
    int salary = 1000;
    salary *= 1.5;
    char c = 'a';
    c += 2;
    System.out.println(salary + " " + c);
  }
}
