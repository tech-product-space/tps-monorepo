import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface ContactList {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  contactCount?: number;
}

export interface ContactDetail {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export const contactService = {
  // Upload CSV
  async uploadContacts(file: File, listName: string) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", listName);

      const res = await PrivateAxios.post("/contacts/bulk-upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      return res.data;
    } catch (error) {
      console.error("Failed to upload contacts", error);
      throw error;
    }
  },

  async uploadContactsToList(file: File, contactListId: string) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("contactListId", contactListId);

    const res = await PrivateAxios.post("/contacts/bulk-upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return res.data;
  },

  // Get all contact lists (LIST PAGE)
  async getContactLists(): Promise<ContactList[]> {
    const res = await PrivateAxios.get("/contacts");
    return res.data;
  },

  // Get contacts inside a list (DETAIL PAGE)
  async getContactsByListId(
    id: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ total: number; contacts: ContactDetail[] }> {
    const res = await PrivateAxios.get(`/contacts/${id}/contacts`, { params });

    return res.data;
  },
};
