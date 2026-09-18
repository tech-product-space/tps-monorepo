import { nanoid } from "nanoid";
import { IBlockBase } from "../types/block.types";

export const createLayout = (layoutType: "grid" | "row" | "column"): IBlockBase => ({
  id: nanoid(),
  type: "layout",
  data: {
    layoutType,
    columns: layoutType === "grid" ? 2 : undefined,
  },
  children: [],
});

export const createHeader = (): IBlockBase => ({
  id: nanoid(),
  type: "header",
  data: {
    html: "",
  },
});

export const createCard = (): IBlockBase => ({
  id: nanoid(),
  type: "card",
  data: {
    variant: "default",
    html: ""
  },
});

export const createParagraph = (): IBlockBase => ({
  id: nanoid(),
  type: "paragraph",
  data: {
    html: ""
  }
});

export const createTable = (): IBlockBase => ({
  id: nanoid(),
  type: "table",
  data: {
    html: "",
  },
});

export const createImage = (): IBlockBase => ({
  id: nanoid(),
  type: "image",
  data: {
    key: "",
    alt: "",
    caption: "",
    width: "100", // Percentage
    alignment: "center",
  },
});

export const createVideo = (): IBlockBase => ({
  id: nanoid(),
  type: "video",
  data: {
    sourceMode: "upload", // "upload" | "url"
    key: "",
    src: "",
    thumbnailMode: "upload", // "upload" | "url"
    thumbnailKey: "",
    thumbnail: "",
    alt: "",
    caption: "",
    credit: "",
    loop: false,
    autoplay: false,
    width: "100",
    alignment: "center",
    aspectRatio: undefined, // auto-detected from video metadata
    maxHeight: 600, // px cap so vertical videos don't dominate the page
  },
});

export const createCode = (): IBlockBase => ({
  id: nanoid(),
  type: "code",
  data: {
    code: "",
    language: "plaintext",
    filename: "",
  },
});

export const createYoutube = (): IBlockBase => ({
  id: nanoid(),
  type: "youtube",
  data: {
    src: "",
    alt: "",
    caption: "",
    credit: "",
    loop: false,
    autoplay: false,
    width: "100",
    alignment: "center",
  },
});
