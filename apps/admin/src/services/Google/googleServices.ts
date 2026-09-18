import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface UserAppTokenRequest {
  user_id: string;
  refresh_token?: any | null;
  access_token: any;
  apps: string | "GOOGLE" | "MICROSOFT";
  generated_at: string;
}


export const getUserTokensFromGoogle = async (token: string) => {
    const url = "https://www.googleapis.com/oauth2/v4/token";

    const body = new URLSearchParams();
    body.set("code", token);
    body.set("client_id", String(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID));
    body.set("client_secret", String(process.env.NEXT_PUBLIC_GOOGLE_SECRET_KEY));
    body.set("redirect_uri", String(process.env.NEXT_PUBLIC_BASE_URL));
    body.set("grant_type", "authorization_code");

    const finalUrl = `${url}?${body.toString()}`;

    try {
        const response = await fetch(finalUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });

        const data = await response.json(); // Await the JSON parsing

        return {
            refresh_token: data.refresh_token,
            access_token: data.access_token,
        };
    } catch (error) {
        console.error("Error:", error);
    }
};

export const getNewAccessToken = async (token: string) => {
    const url = "https://www.googleapis.com/oauth2/v4/token";
    const body = new URLSearchParams();
    body.set("refresh_token", token);
    body.set("client_id", String(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID));
    body.set("client_secret", String(process.env.NEXT_PUBLIC_GOOGLE_SECRET_KEY));
    body.set("grant_type", "refresh_token");

    const finalUrl = `${url}?${body.toString()}`;

    try {
        const response = await fetch(finalUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });

        const data = await response.json(); // Await the JSON parsing

        return data.access_token;
    } catch (error) {
        console.error("Error:", error);
    }
};

export const insertGoogleCalendarEvent = async (token: string, event: any) => {
    try {
        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(event),
            }
        );

        const data = await response.json();

        return data;
    } catch (error) {
        console.error("Error:", error);
    }
};

export const deleteGoogleCalendarEvent = async (token: string, eventId: string) => {
    try {
        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        if (response.ok) {
            return true; // Event successfully deleted
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error.message);
        }
    } catch (error) {
        console.error("Error:", error);
        return false; // Failed to delete event
    }
};

export const rescheduleGoogleCalendarEvent = async (
    token: string,
    eventId: string,
    eventUpdate: any
) => {
    try {
        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(eventUpdate),
            }
        );

        const updatedEventData = await response.json(); // Await the JSON parsing

        return updatedEventData;
    } catch (error) {
        console.error("Error:", error);
    }
};



// Saving Tokens in Backend
export const getTokenFromBackend = async (user_id: string, apps: string) => {
    const response = await PrivateAxios.get(`/tokens/${user_id}/${apps}`);
    return response.data;
};

export const postTokenToBackend = async (body: UserAppTokenRequest) => {
    const response = await PrivateAxios.post(`/tokens`, body);
    return response.data;
};