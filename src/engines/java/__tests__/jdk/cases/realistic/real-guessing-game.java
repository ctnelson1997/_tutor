import java.util.Scanner;
public class Main {
  public static void main(String[] args) {
    Scanner sc = new Scanner(System.in);
    int secret = 37;
    int guesses = 0;
    int guess;
    do {
      System.out.print("Guess: ");
      guess = sc.nextInt();
      guesses++;
      if (guess < secret) System.out.println("Too low");
      else if (guess > secret) System.out.println("Too high");
    } while (guess != secret);
    System.out.println("Got it in " + guesses + " guesses");
  }
}
