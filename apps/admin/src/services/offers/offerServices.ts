import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface ProgramOffer {
  program_name: string;
  offer_valid_for: string;
  price: number;
  discount: number;
  cohort_seats: number;
  start_date: Date;
  duration: string;
  offer_valid_till: Date;
  brochure_link: string;
  usd_price: number;
  usd_discount: number;
  emi_amount: string;
  usd_emi_amount: string;
  tax_inclusive: boolean;
  usd_tax_inclusive: boolean;
}

export const updateOffer = async (requestbody: ProgramOffer) => {
  const response = await PrivateAxios.post(`/program-offers`, requestbody);
  return response.data;
};

export const getOfferByName = async (program_name: string) => {
  const response = await PrivateAxios.get(`/program-offers/${program_name}`);
  return response.data;
};

export const getEnrollEmailByName = async (program_name: string) => {
  const response = await PrivateAxios.get(
    `/program-offers/${program_name}/email`
  );
  return response.data;
};

export const postEnrollEmailByName = async (
  program_name: string,
  requestBody: any
) => {
  const response = await PrivateAxios.post(
    `/program-offers/${program_name}/email`,
    requestBody
  );
  return response.data;
};

export const getCurriculumByName = async (program_name: string) => {
  const response = await PrivateAxios.get(
    `/program-offers/${program_name}/curriculum `
  );
  return response.data;
};

export const postCurriculumByName = async (
  program_name: string,
  requestBody: any
) => {
  const response = await PrivateAxios.post(
    `/program-offers/${program_name}/curriculum `,
    requestBody
  );
  return response.data;
};
