# Builds a binary search tree: recursive insert, search, inorder traversal, height and min/max
class TreeNode:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(node, key):
    if node is None:
        return TreeNode(key)
    if key < node.key:
        node.left = insert(node.left, key)
    elif key > node.key:
        node.right = insert(node.right, key)
    return node


def search(node, key):
    while node is not None:
        if key == node.key:
            return True
        node = node.left if key < node.key else node.right
    return False


def inorder(node, out):
    if node:
        inorder(node.left, out)
        out.append(node.key)
        inorder(node.right, out)
    return out


def height(node):
    if node is None:
        return 0
    return 1 + max(height(node.left), height(node.right))


root = None
for k in [50, 30, 70, 20, 40, 60, 80, 35]:
    root = insert(root, k)

print("Inorder:", inorder(root, []))
print("Height:", height(root))
for k in [35, 65]:
    print(f"search({k}):", search(root, k))

smallest = root
while smallest.left:
    smallest = smallest.left
largest = root
while largest.right:
    largest = largest.right
print("Min:", smallest.key, "Max:", largest.key)
print("Root children:", root.left.key, root.right.key)
