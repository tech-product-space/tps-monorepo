export type BlockType = "layout" | "header" | "card" | "paragraph" | "image" | "table" | "video" | "youtube" | "code";

export interface IBlockBase {
  id: string;
  type: BlockType;
  data: Record<string, any>;
  children?: IBlockBase[];
}
