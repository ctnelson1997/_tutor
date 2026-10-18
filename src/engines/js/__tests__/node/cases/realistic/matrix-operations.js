// Adds, transposes and multiplies small matrices stored as 2D arrays
function createMatrix(rows, cols, fill = 0) {
  const m = [];
  for (let r = 0; r < rows; r++) {
    m.push(new Array(cols).fill(fill));
  }
  return m;
}

function add(a, b) {
  const result = createMatrix(a.length, a[0].length);
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[0].length; c++) {
      result[r][c] = a[r][c] + b[r][c];
    }
  }
  return result;
}

function transpose(m) {
  const result = createMatrix(m[0].length, m.length);
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[0].length; c++) {
      result[c][r] = m[r][c];
    }
  }
  return result;
}

function multiply(a, b) {
  const result = createMatrix(a.length, b[0].length);
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < b[0].length; c++) {
      let sum = 0;
      for (let k = 0; k < b.length; k++) {
        sum += a[r][k] * b[k][c];
      }
      result[r][c] = sum;
    }
  }
  return result;
}

function printMatrix(label, m) {
  console.log(label);
  for (const row of m) {
    console.log("  " + row.join("\t"));
  }
}

const A = [[1, 2, 3], [4, 5, 6]];
const B = [[6, 5, 4], [3, 2, 1]];
const sum = add(A, B);
const At = transpose(A);
const product = multiply(A, At);
printMatrix("A + B:", sum);
printMatrix("A transposed:", At);
printMatrix("A x At:", product);
const diagonal = product.map((row, i) => row[i]);
console.log("Diagonal of A x At:", diagonal);
