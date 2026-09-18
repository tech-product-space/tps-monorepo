export interface BlogContent {
    type: "paragraph" | "image" | "video";
}

export interface ParagraphContent extends BlogContent {
    type: "paragraph";
    content: string;
}

export interface ImageContent extends BlogContent {
    type: "image";
    src: string;
    alt: string;
    credit?: string;
}

export interface VideoContent extends BlogContent {
    type: "video";
    src: string;
    alt: string;
    credit?: string;
}