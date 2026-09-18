import { PrivateAxios } from "@/helpers/PrivateAxios";

/* ---------------------------------- types --------------------------------- */

export interface ExpenseTeam {
  id: string;
  name: string;
  is_active: boolean;
  created_by: number | null;
}

// One entry of a form's category allow-list. Empty `subcategory_ids` means the
// whole category is allowed.
export interface FormAllowedCategory {
  category_id: string;
  subcategory_ids: string[];
  category?: { id: string; name: string };
}

// Configurable public-form fields (in display order) and their per-field config.
export type FormFieldKey =
  | "name"
  | "email"
  | "phone"
  | "payment_method"
  | "payment_account"
  | "vendor"
  | "receipt"
  | "notes";

export interface FieldSetting {
  enabled: boolean;
  required: boolean;
}

export type FormFieldConfig = Record<FormFieldKey, FieldSetting>;

export const FORM_FIELDS: { key: FormFieldKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "payment_method", label: "Payment mode" },
  { key: "payment_account", label: "Payment account" },
  { key: "vendor", label: "Vendor" },
  { key: "receipt", label: "Receipt" },
  { key: "notes", label: "Note" },
];

export const defaultFieldConfig = (): FormFieldConfig => ({
  name: { enabled: true, required: true },
  email: { enabled: true, required: true },
  phone: { enabled: true, required: false },
  payment_method: { enabled: true, required: false },
  // Off by default — external submitters rarely know which company account paid.
  payment_account: { enabled: false, required: false },
  vendor: { enabled: true, required: true },
  receipt: { enabled: true, required: false },
  notes: { enabled: true, required: false },
});

export interface ExpenseForm {
  id: string;
  name: string;
  team_id: string;
  slug: string;
  instructions: string | null;
  is_active: boolean;
  field_config: FormFieldConfig;
  createdAt: string;
  team?: { id: string; name: string; is_active: boolean };
  allowedCategories: FormAllowedCategory[];
  submissionCount?: number;
}

export interface FormPayload {
  name: string;
  team_id: string;
  instructions?: string | null;
  field_config: FormFieldConfig;
  is_active?: boolean;
  allowedCategories: { category_id: string; subcategory_ids: string[] }[];
}

/* ---------------------------------- teams --------------------------------- */

export const getTeams = async (includeArchived = false) => {
  const res = await PrivateAxios.get("/expenses/teams", {
    params: includeArchived ? { all: true } : {},
  });
  return res.data.data as ExpenseTeam[];
};

export const createTeam = async (name: string) => {
  const res = await PrivateAxios.post("/expenses/teams", { name });
  return res.data.data as ExpenseTeam;
};

export const updateTeam = async (
  id: string,
  payload: { name?: string; is_active?: boolean }
) => {
  const res = await PrivateAxios.put(`/expenses/teams/${id}`, payload);
  return res.data.data as ExpenseTeam;
};

export const archiveTeam = async (id: string) => {
  const res = await PrivateAxios.delete(`/expenses/teams/${id}`);
  return res.data;
};

/* ---------------------------------- forms --------------------------------- */

export const getForms = async () => {
  const res = await PrivateAxios.get("/expense-forms");
  return res.data.data as ExpenseForm[];
};

export const getFormById = async (id: string) => {
  const res = await PrivateAxios.get(`/expense-forms/${id}`);
  return res.data.data as ExpenseForm;
};

export const createForm = async (payload: FormPayload) => {
  const res = await PrivateAxios.post("/expense-forms", payload);
  return res.data.data as ExpenseForm;
};

export const updateForm = async (id: string, payload: Partial<FormPayload>) => {
  const res = await PrivateAxios.put(`/expense-forms/${id}`, payload);
  return res.data.data as ExpenseForm;
};

export const toggleForm = async (id: string) => {
  const res = await PrivateAxios.patch(`/expense-forms/${id}/toggle`);
  return res.data.data as ExpenseForm;
};

export const regenerateFormLink = async (id: string) => {
  const res = await PrivateAxios.post(`/expense-forms/${id}/regenerate-link`);
  return res.data.data as ExpenseForm;
};

export const deleteForm = async (id: string) => {
  const res = await PrivateAxios.delete(`/expense-forms/${id}`);
  return res.data;
};

/* -------------------------------- helpers --------------------------------- */

// Public submission URL for a form. The /expense-form/[slug] page is served by
// this same admin app, so the link uses the current origin (localhost:4200 in
// dev, admin.theproductspace.co.in in prod) — no extra config needed.
export const publicFormUrl = (slug: string) => {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://admin.theproductspace.co.in";
  return `${base}/expense-form/${slug}`;
};
