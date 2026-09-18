import { IBlockBase } from "../types/block.types";

export const findBlockPosition = (
    blocks: IBlockBase[],
    targetId: string,
    parentId: string | null = null
): { parentId: string | null; index: number } | null => {
    for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].id === targetId) return { parentId, index: i };

        if (blocks[i].children) {
            const found = findBlockPosition(blocks[i].children!, targetId, blocks[i].id);
            if (found) return found;
        }
    }
    return null;
};

