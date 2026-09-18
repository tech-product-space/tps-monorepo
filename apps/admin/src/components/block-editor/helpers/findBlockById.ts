import { IBlockBase } from "../types/block.types";

export function findBlockById(
  blocks: IBlockBase[],
  id: string
): IBlockBase | null {
  for (const block of blocks) {
    if (block.id === id) return block;

    if (block.children?.length) {
      const found = findBlockById(block.children, id);
      if (found) return found;
    }
  }

  return null;
}
