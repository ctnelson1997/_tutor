import type { CodeExample } from '../../types/engine';

export const examples: CodeExample[] = [
  {
    title: 'Variables & Types',
    slug: 'variables-types',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int x = 42;
    double pi = 3.14;
    boolean flag = true;
    String name = "hello";
    System.out.println(x);
    System.out.println(name);
  }
}`,
  },
  {
    title: 'For Loop',
    slug: 'for-loop',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int sum = 0;
    for (int i = 1; i <= 5; i++) {
      sum += i;
    }
    System.out.println("Sum: " + sum);
  }
}`,
  },
  {
    title: 'While Loop',
    slug: 'while-loop',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int n = 1;
    while (n < 100) {
      n = n * 2;
    }
    System.out.println(n);
  }
}`,
  },
  {
    title: 'Conditionals',
    slug: 'conditionals',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int age = 20;
    String category;
    if (age < 13) {
      category = "child";
    } else if (age < 18) {
      category = "teenager";
    } else {
      category = "adult";
    }
    System.out.println(category);
  }
}`,
  },
  {
    title: 'Arrays',
    slug: 'arrays',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int[] nums = {10, 20, 30, 40, 50};
    int sum = 0;
    for (int i = 0; i < nums.length; i++) {
      sum += nums[i];
    }
    System.out.println("Sum: " + sum);
  }
}`,
  },
  {
    title: 'Static Methods',
    slug: 'static-methods',
    category: 'Methods',
    language: 'java',
    code: `public class Main {
  public static int add(int a, int b) {
    int result = a + b;
    return result;
  }

  public static void main(String[] args) {
    int sum = add(3, 4);
    System.out.println("3 + 4 = " + sum);
  }
}`,
  },
  {
    title: 'Recursion (Factorial)',
    slug: 'recursion-factorial',
    category: 'Methods',
    language: 'java',
    code: `public class Main {
  public static int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
  }

  public static void main(String[] args) {
    int result = factorial(5);
    System.out.println("5! = " + result);
  }
}`,
  },
  {
    title: 'Classes & Objects',
    slug: 'classes-objects',
    category: 'OOP',
    language: 'java',
    code: `public class Main {
  static int age;
  static String name;

  public static void main(String[] args) {
    name = "Rex";
    age = 5;
    String msg = name + " is " + age;
    System.out.println(msg);
  }
}`,
  },
  {
    title: 'String Methods',
    slug: 'string-methods',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    String text = "Hello, World!";
    int len = text.length();
    char first = text.charAt(0);
    String upper = text.toUpperCase();
    String sub = text.substring(0, 5);
    System.out.println(len);
    System.out.println(first);
    System.out.println(upper);
    System.out.println(sub);
  }
}`,
  },
  {
    title: '2D Array',
    slug: '2d-array',
    category: 'Data Structures',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int[][] grid = {{1, 2, 3}, {4, 5, 6}};
    int total = 0;
    for (int r = 0; r < grid.length; r++) {
      for (int c = 0; c < grid[r].length; c++) {
        total += grid[r][c];
      }
    }
    System.out.println("Total: " + total);
  }
}`,
  },
  {
    title: 'Do-While & Switch',
    slug: 'do-while-switch',
    category: 'Basics',
    language: 'java',
    code: `public class Main {
  public static void main(String[] args) {
    int day = 3;
    String name;
    switch (day) {
      case 1: name = "Monday"; break;
      case 2: name = "Tuesday"; break;
      case 3: name = "Wednesday"; break;
      default: name = "Other"; break;
    }
    System.out.println(name);

    int count = 0;
    do {
      count++;
    } while (count < 3);
    System.out.println("Count: " + count);
  }
}`,
  },
];
