export interface IMetaIntegration {
  id: string;
  account_id: string;
  account_name: string;
  access_token: string;
  metadata?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface IMetaIntegrationListItem {
  id: string;
  account_name: string;
  createdAt: string;
}

export interface IMetaPage {
  id: string;
  page_id: string;
  page_name: string;
  metadata?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface IMetaForm {
  id: string
  form_id: string
  form_name: string
  status: string;
}