import { PrivateAxios, PrivateUploadAxios } from "@/gradient/helpers/PrivateAxios";
import type { Contact, ContactList, UploadResult } from "@/gradient/types/contact";
import type { IPaginationMeta } from "@/gradient/types/pagination";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/contacts`;

export const contactService = {
  async lists(params?: { search?: string; page?: number; limit?: number }) {
    const res = await PrivateAxios.get(`${BASE}/lists`, { params });
    return res.data as { data: ContactList[]; meta: IPaginationMeta };
  },

  async getList(id: string) {
    const res = await PrivateAxios.get(`${BASE}/lists/${id}`);
    return (res.data as { data: ContactList }).data;
  },

  async createList(payload: { name: string; description?: string }) {
    const res = await PrivateAxios.post(`${BASE}/lists`, payload);
    return (res.data as { data: ContactList }).data;
  },

  async updateList(
    id: string,
    payload: { name?: string; description?: string | null },
  ) {
    const res = await PrivateAxios.patch(`${BASE}/lists/${id}`, payload);
    return (res.data as { data: ContactList }).data;
  },

  async removeList(id: string) {
    const res = await PrivateAxios.delete(`${BASE}/lists/${id}`);
    return res.data;
  },

  async contacts(
    listId: string,
    params?: { search?: string; page?: number; limit?: number },
  ) {
    const res = await PrivateAxios.get(`${BASE}/lists/${listId}/contacts`, {
      params,
    });
    return res.data as { data: Contact[]; meta: IPaginationMeta };
  },

  async removeContact(listId: string, contactId: string) {
    const res = await PrivateAxios.delete(
      `${BASE}/lists/${listId}/contacts/${contactId}`,
    );
    return res.data;
  },

  /**
   * Multipart, so it goes through `PrivateUploadAxios`. The field name must be
   * `file` — it is what the route's multer middleware reads.
   */
  async upload(listId: string, file: File) {
    const form = new FormData();
    form.append("file", file);

    const res = await PrivateUploadAxios.post(
      `${BASE}/lists/${listId}/upload`,
      form,
    );

    return res.data as { message: string; data: UploadResult };
  },
};
