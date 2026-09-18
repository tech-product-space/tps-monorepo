export type AiProductStatus = "draft" | "published";

export type TeamMember = {
  name: string;
  role?: string; // shown under the name, e.g. company or title
  avatarUrl?: string;
  linkedinUrl?: string;
};

export type ToolItem = {
  name: string;
  logoUrl: string;
};

export type RichTextSection = {
  id: string;
  type: "richText";
  title: string;
  body: string;
};

export type ToolsSection = {
  id: string;
  type: "tools";
  title: string;
  tools: ToolItem[];
  body?: string; // optional rich text shown below the chips
};

export type AiProductSection = RichTextSection | ToolsSection;

// Hero slider item. "video" means a YouTube link; thumbnailUrl is the
// poster shown in the slider before the video is played (falls back to
// YouTube's own thumbnail).
export type HeroMediaItem = {
  id: string;
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string;
};

export type AiProductContent = {
  tagline: string;
  description: string;
  websiteUrl: string; // live project URL — "Visit Website" button on the detail page
  tags: string[];
  thumbnailUrl: string;
  team: {
    name: string;
    members: TeamMember[];
  };
  heroMedia: HeroMediaItem[];
  sections: AiProductSection[];
};

export type AiProduct = {
  id: string;
  slug: string;
  name: string;
  status: AiProductStatus;
  display_order: number;
  content: Partial<AiProductContent>;
  createdAt: string;
  updatedAt: string;
};

export const emptyAiProductContent = (): AiProductContent => ({
  tagline: "",
  description: "",
  websiteUrl: "",
  tags: [],
  thumbnailUrl: "",
  team: { name: "", members: [] },
  heroMedia: [],
  sections: [],
});

// Merge a possibly-partial content blob (older rows, fresh drafts) into a
// fully-shaped object so the editor never touches undefined branches.
// Rows saved before the slider existed have a single `hero` object — convert
// it into a one-item heroMedia array.
export const normalizeContent = (
  content:
    | (Partial<AiProductContent> & {
        hero?: { type: "image" | "video"; url: string };
      })
    | null
    | undefined
): AiProductContent => {
  const empty = emptyAiProductContent();
  if (!content) return empty;

  let heroMedia = content.heroMedia || [];
  if (heroMedia.length === 0 && content.hero?.url) {
    heroMedia = [
      {
        id: "legacy-hero",
        type: content.hero.type,
        url: content.hero.url,
      },
    ];
  }

  return {
    ...empty,
    ...content,
    team: { ...empty.team, ...(content.team || {}) },
    heroMedia,
    tags: content.tags || [],
    sections: content.sections || [],
  };
};
