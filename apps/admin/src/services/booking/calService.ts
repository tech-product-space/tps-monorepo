import { PrivateAxios } from "../../helpers/PrivateAxios";

export const getCalBookings = async (page = 1, limit = 10, filter="all") => {
  const response = await PrivateAxios.get(
    `/booking/cal-booking?page=${page}&limit=${limit}&filter=${filter}`,
  );
  return response.data;
};