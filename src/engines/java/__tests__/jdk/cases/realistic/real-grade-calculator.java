public class Main {
  public static double average(int[] scores) {
    int sum = 0;
    for (int s : scores) {
      sum += s;
    }
    return (double) sum / scores.length;
  }

  public static char letterGrade(double avg) {
    if (avg >= 90) return 'A';
    else if (avg >= 80) return 'B';
    else if (avg >= 70) return 'C';
    else if (avg >= 60) return 'D';
    return 'F';
  }

  public static void main(String[] args) {
    int[] scores = {88, 92, 79, 65, 95};
    double avg = average(scores);
    System.out.println("Average: " + avg);
    System.out.printf("Rounded: %.1f%n", avg);
    System.out.println("Grade: " + letterGrade(avg));
    int max = scores[0];
    for (int i = 1; i < scores.length; i++) {
      if (scores[i] > max) max = scores[i];
    }
    System.out.println("Highest: " + max);
  }
}
