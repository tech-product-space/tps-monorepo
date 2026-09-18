import { IBlockBase } from "../types/block.types";

export function addChild(
  blocks: IBlockBase[],
  parentId: string,
  child: IBlockBase
): IBlockBase[] {
  return blocks.map((block) => {
    if (block.id === parentId && block.type === "layout") {
      return { ...block, children: [...(block.children || []), child] };
    }

    if (block.children) {
      return { ...block, children: addChild(block.children, parentId, child) };
    }

    return block;
  });
}

export function updateBlock(
  blocks: IBlockBase[],
  id: string,
  data: Record<string, any>
): IBlockBase[] {
  return blocks.map((block) => {
    if (block.id === id) {
      return { ...block, data: { ...block.data, ...data } };
    }

    if (block.children) {
      return { ...block, children: updateBlock(block.children, id, data) };
    }

    return block;
  });
}

// updateBlock only merges `data`, so changing a block's type needs a whole-node
// swap. Callers build `next` via convertBlock, which preserves the id.
export function replaceBlock(
  blocks: IBlockBase[],
  id: string,
  next: IBlockBase
): IBlockBase[] {
  return blocks.map((block) => {
    if (block.id === id) return next;

    if (block.children) {
      return { ...block, children: replaceBlock(block.children, id, next) };
    }

    return block;
  });
}

export function deleteBlock(blocks: IBlockBase[], id: string): IBlockBase[] {
  return blocks
    .filter((b) => b.id !== id)
    .map((b) =>
      b.children ? { ...b, children: deleteBlock(b.children, id) } : b
    );
}

export function moveBlock(
  blocks: IBlockBase[],
  parentId: string | null,
  fromIndex: number,
  toIndex: number
): IBlockBase[] {
  const reorder = (arr: IBlockBase[]) => {
    const copy = [...arr];
    const [item] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, item);
    return copy;
  };

  if (!parentId) return reorder(blocks);

  return blocks.map((block) => {
    if (block.id === parentId && block.children) {
      return { ...block, children: reorder(block.children) };
    }

    if (block.children) {
      return {
        ...block,
        children: moveBlock(block.children, parentId, fromIndex, toIndex),
      };
    }

    return block;
  });
}