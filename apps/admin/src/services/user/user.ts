import { PrivateAxios } from "@/helpers/PrivateAxios";

export const getUserById = async (id: string) => {
  const response = await PrivateAxios.get(
    `/profile/get-user-profile-details/${id}`
  );
  return response.data;
};
