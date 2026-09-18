import { PrivateAxios, PrivateUploadAxios } from "@/helpers/PrivateAxios";
import { AiProduct, AiProductContent, AiProductStatus } from "@/types/aiProduct";

export const getAllAiProducts = async (): Promise<AiProduct[]> => {
  try {
    const response = await PrivateAxios.get("/ai-products/admin");
    return response.data;
  } catch (error) {
    console.error("Failed to get AI products:", error);
    throw error;
  }
};

export const getAiProductById = async (id: string): Promise<AiProduct> => {
  try {
    const response = await PrivateAxios.get(`/ai-products/${id}`);
    return response.data;
  } catch (error) {
    console.error("Failed to get AI product:", error);
    throw error;
  }
};

// Mirrors the backend's slugify so the UI previews exactly what gets saved.
export const slugifyClient = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

// Looser variant for typing in a slug field: keeps a trailing dash so the
// user can type "ai-resume" without the dash being eaten mid-keystroke.
// The backend (and slugifyClient on blur/save) does the final cleanup.
export const sanitizeSlugInput = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");

// Pulls the backend's error message (e.g. "Slug already in use") off an
// axios error so components can show it in a toast.
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const axiosError = error as { response?: { data?: { error?: string } } };
  return axiosError?.response?.data?.error || fallback;
};

export const createAiProduct = async (
  name: string,
  slug?: string
): Promise<AiProduct> => {
  try {
    const response = await PrivateAxios.post("/ai-products", { name, slug });
    return response.data;
  } catch (error) {
    console.error("Failed to create AI product:", error);
    throw error;
  }
};

export const updateAiProduct = async (
  id: string,
  data: {
    name?: string;
    slug?: string;
    content?: AiProductContent;
    status?: AiProductStatus;
  }
): Promise<AiProduct> => {
  try {
    const response = await PrivateAxios.patch(`/ai-products/${id}`, data);
    return response.data;
  } catch (error) {
    console.error("Failed to update AI product:", error);
    throw error;
  }
};

export const reorderAiProducts = async (
  order: { id: string; display_order: number }[]
) => {
  try {
    const response = await PrivateAxios.patch("/ai-products/reorder", { order });
    return response.data;
  } catch (error) {
    console.error("Failed to reorder AI products:", error);
    throw error;
  }
};

export const duplicateAiProduct = async (id: string): Promise<AiProduct> => {
  try {
    const response = await PrivateAxios.post(`/ai-products/${id}/duplicate`);
    return response.data;
  } catch (error) {
    console.error("Failed to duplicate AI product:", error);
    throw error;
  }
};

// Opens the public site's draft preview in a new tab. The token is signed
// by the backend and expires after 24h.
export const openAiProductPreview = async (id: string) => {
  const response = await PrivateAxios.get(`/ai-products/${id}/preview-token`);
  const token: string = response.data.token;
  const site =
    process.env.NEXT_PUBLIC_WEBSITE_URL || "https://theproductspace.in";
  window.open(
    `${site}/ai-products/preview/${id}?token=${encodeURIComponent(token)}`,
    "_blank"
  );
};

export const deleteAiProduct = async (id: string) => {
  try {
    const response = await PrivateAxios.delete(`/ai-products/${id}`);
    return response.data;
  } catch (error) {
    console.error("Failed to delete AI product:", error);
    throw error;
  }
};

// Uploads to S3 under ai-products/ and returns the bucket-root KEY
// (e.g. "ai-products/1781123-logo.png"). Only the key is stored in content;
// resolveAssetUrl turns it into a servable URL.
export const uploadAiProductImage = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await PrivateUploadAxios.post("/upload/ai-products", formData);
  return response.data.key;
};

const ASSETS_BASE_URL = (
  process.env.NEXT_PUBLIC_AWS_FILE_BASE_URL || "https://assets.theproductspace.in"
).replace(/\/+$/, "");

// Stored media values are either S3 keys (uploads) or absolute URLs
// (YouTube / externally hosted). Keys get the assets domain prefixed.
export const resolveAssetUrl = (value?: string): string => {
  if (!value) return "";
  if (/^(https?:)?\/\//i.test(value)) return value;
  return `${ASSETS_BASE_URL}/${value.replace(/^\/+/, "")}`;
};

export const isVideoUrl = (value: string) =>
  /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(value);

// Normalize YouTube watch/share/shorts URLs to an embeddable URL.
export const toYouTubeEmbed = (url: string): string | null => {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
};
