import { getNewAccessToken, getTokenFromBackend, insertGoogleCalendarEvent } from "@/services/Google/googleServices";

export interface ITokenRequest {
    user_id: string;
    apps: string | "GOOGLE" | "MICROSOFT";
}

export interface ITokenResponse {
    id: number;
    user_id: number;
    apps: string | "GOOGLE" | "MICROSOFT";
    access_token: string;
    refresh_token: string;
    generated_at: string;
}

export interface CalendarEvent {
    summary: string;
    start: {
        dateTime: string;
        timeZone: string;
    };
    end: {
        dateTime: string;
        timeZone: string;
    };
    description?: string;
}

export const checkIfUserHaveToken = async (requestbody: ITokenRequest, event: CalendarEvent) => {
    const response: ITokenResponse = await getTokenFromBackend(
        requestbody.user_id,
        requestbody.apps
    );
    const access_token = await getNewAccessToken(response.refresh_token);
    await insertGoogleCalendarEvent(access_token, event)
};
