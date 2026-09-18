import { PrivateAxios, PrivateUploadAxios } from "@/gradient/helpers/PrivateAxios";

type EntityType =
  | "blog"
  | "event"
  | "resource"
  | "free-course"
  | "course"
  | "project";

export async function uploadFile(
  file: File,
  entityType: EntityType,
  entityId: string
): Promise<string> {
  const formData = new FormData();

  formData.append("entityId", entityId);
  formData.append("file", file);

  const { data } = await PrivateUploadAxios.post(
    `/upload/admin/${entityType}/upload`,
    formData
  );

  return data.key;
}

export async function deleteFile(
  entityType: EntityType,
  key: string
): Promise<void> {
  await PrivateAxios.delete(
    `/upload/admin/${entityType}/delete-file`,
    {
      data: { key },
    }
  );
}



export type MediaAssetType =
  | "event"
  | "blog"
  | "resource"
  | "job"
  | "certificate"
  | "recording"
  | "project";

export async function uploadMediaAsset(file: File, type: MediaAssetType): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await PrivateUploadAxios.post(`/upload/media-assets/${type}/upload`, formData);

  return data.key;
}

export async function getMediaAssets(type: MediaAssetType) {
  const { data } = await PrivateAxios.get(`/upload/media-assets/${type}`);

  return data.images;
}