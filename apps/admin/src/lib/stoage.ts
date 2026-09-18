export const resolveStorageUrl = (key?: string): string => {
  if (!key) return "";

  const baseUrl = process.env.NEXT_PUBLIC_AWS_FILE_BASE_URL;

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_AWS_FILE_BASE_URL is not defined");
  }

  return `${baseUrl}/${key}`;
};