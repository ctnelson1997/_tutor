# A binary search tree of TreeNode objects: recursive insert, in-order traversal, height, search
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

def contains(node, key):
    while node and node.key != key:
        node = node.left if key < node.key else node.right
    return node is not None

root = None
for k in [50, 30, 70, 20, 40, 60, 30]:
    root = insert(root, k)
print(inorder(root, []))
print(height(root))
print(contains(root, 60), contains(root, 65))
print(root.left.right.key, root.right.left.key)
