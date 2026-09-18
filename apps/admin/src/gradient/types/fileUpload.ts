export type EntityType = "blog" | "event" | "resource";

export interface FileUploadPayload {
  entityType: EntityType;
  entityId: string;
  existingKey?: string;
}

export interface FileUploadProps {
  entityType: EntityType;
  entityId: string;
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (key: string) => void;
}