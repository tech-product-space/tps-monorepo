import { ICampaignEvent } from "@/components/Pages/Common/marketing/LeadSelector/filters/EventGuestsStep";
import { PrivateAxios } from "@/helpers/PrivateAxios";
import { Campaign, UnsubscribedUser } from "@/types/campaign";

export const campaignService = {
  async getCampaigns(): Promise<Campaign[]> {
    const res = await PrivateAxios.get("/campaigns")
    return res.data.campaigns;
  },

  async createCampaign(payload: {
    name: string;
    type: "email";
  }): Promise<Campaign> {
    const res = await PrivateAxios.post("/campaigns", payload)
    return res.data.campaign;
  },

  async deleteCampaign(id: string): Promise<void> {
    const res = await PrivateAxios.delete(`/campaigns/${id}`)
    return res.data;
  },

  async getCampaign(id: string): Promise<Campaign> {
    const res = await PrivateAxios.get(`/campaigns/${id}`)
    return res.data.campaign;
  },

  async updateCampaign(id: string, payload: any): Promise<void> {
    const res = await PrivateAxios.patch(`/campaigns/${id}`, payload)
    return res.data;
  },

  async getCampaignEvents(): Promise<{ events: ICampaignEvent[] }> {
    const res = await PrivateAxios.get('/campaigns/events-list');
    return res.data;
  },

  async getCampaignResources() {
    const res = await PrivateAxios.get('/campaigns/resource-list');
    return res.data;
  
  },

  async scheduleCampaign(id: string, payload: {scheduled_at?: any}): Promise<void> {
    const res = await PrivateAxios.post(`/campaigns/${id}/schedule`, payload);
    return res.data;
  },

  async cancelCampaign(id: string): Promise<void> {
    const res = await PrivateAxios.post(`/campaigns/${id}/cancel`);
    return res.data;
  },

  async previewRecipients(id: string): Promise<any> {
    const res = await PrivateAxios.get(`/campaigns/${id}/preview`);
    return res.data;
  },
  
  async sendTestMail(id: string, payload:{name: string, email: string}) {
    const res = await PrivateAxios.post(`/campaigns/${id}/send-test`, payload);
    return res.data
  },

  async getUnsubscribedUsers(): Promise<UnsubscribedUser[]> {
    const res = await PrivateAxios.get(`/unsubscribe/all-unsubscribed-users`);
    return res.data.data;
  }
};