public class Main {
  static boolean isLeap(int y) {
    return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
  }
  static int daysInMonth(int month, int year) {
    switch (month) {
      case 2:
        return isLeap(year) ? 29 : 28;
      case 4: case 6: case 9: case 11:
        return 30;
      default:
        return 31;
    }
  }
  public static void main(String[] args) {
    System.out.println(isLeap(1900) + " " + isLeap(2000) + " " + isLeap(2024));
    System.out.println(daysInMonth(2, 2024) + " " + daysInMonth(4, 2023) + " " + daysInMonth(12, 2023));
  }
}
