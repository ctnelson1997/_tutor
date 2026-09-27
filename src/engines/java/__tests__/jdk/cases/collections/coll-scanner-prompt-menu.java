import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner scnr = new Scanner(System.in);
    System.out.print("Enter your name: ");
    String name = scnr.next();
    System.out.print("Enter your age: ");
    int age = scnr.nextInt();
    System.out.println("Hello " + name + ", next year you will be " + (age + 1));
  }
}
