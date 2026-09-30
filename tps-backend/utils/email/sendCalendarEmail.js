const axios = require("axios");
const { getAccessToken } = require("./authProvider");
require("dotenv").config();

// Helper function to generate .ics content
const generateIcsContentStaging = ({
    title,
    description,
    eventStartDate,
    eventEndDate,
    eventStartTime,
    eventEndTime,
    location = '',
    attendees = []
}) => {
    const formatDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const combineDateTime = (dateStr, timeStr) => {
        // timeStr is already HH:mm:ss (24h format)
        const dateTimeString = `${dateStr}T${timeStr}+05:30`; // IST offset
        const date = new Date(dateTimeString);
        if (isNaN(date)) {
            throw new Error(`Invalid date-time string: ${dateTimeString}`);
        }
        return date;
    };

    const uid = `${Date.now()}@theproductspace.in`;
    const timestamp = formatDate(new Date());

    const startDateTime = combineDateTime(eventStartDate, eventStartTime);
    const endDateTime = combineDateTime(eventEndDate, eventEndTime);

    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Your Company//Your App//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${timestamp}`,
        `DTSTART:${formatDate(startDateTime)}`,
        `DTEND:${formatDate(endDateTime)}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${description}`,
        location ? `LOCATION:${location}` : '',
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'TRANSP:OPAQUE'
    ];

    attendees.forEach((email) => {
        icsContent.push(`ATTENDEE;CN=${email};RSVP=TRUE:mailto:${email}`);
    });

    icsContent.push('END:VEVENT');
    icsContent.push('END:VCALENDAR');

    return icsContent.filter(Boolean).join('\r\n');
};

const generateIcsContent = ({
    title,
    description,
    eventStartDate,
    eventEndDate,
    eventStartTime,
    eventEndTime,
    location = '',
    attendees = []
}) => {
    const formatDate = (date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const to24HourTime = (timeStr) => {
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':');
        if (!minutes) minutes = '00';

        hours = parseInt(hours, 10);
        if (modifier === 'PM' && hours !== 12) {
            hours += 12;
        }
        if (modifier === 'AM' && hours === 12) {
            hours = 0;
        }

        return `${hours.toString().padStart(2, '0')}:${minutes}`;
    };

    const combineDateTime = (dateStr, timeStr) => {
        const time24 = to24HourTime(timeStr);
        const dateTimeString = `${dateStr}T${time24}:00+05:30`; // IST offset
        const date = new Date(dateTimeString);
        if (isNaN(date)) {
            throw new Error(`Invalid date-time string: ${dateTimeString}`);
        }
        return date;
    };

    const uid = `${Date.now()}@theproductspace.in`;
    const timestamp = formatDate(new Date());

    const startDateTime = combineDateTime(eventStartDate, eventStartTime);
    const endDateTime = combineDateTime(eventEndDate, eventEndTime);

    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Your Company//Your App//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${timestamp}`,
        `DTSTART:${formatDate(startDateTime)}`,
        `DTEND:${formatDate(endDateTime)}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${description}`,
        location ? `LOCATION:${location}` : '',
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'TRANSP:OPAQUE'
    ];

    attendees.forEach((email) => {
        icsContent.push(`ATTENDEE;CN=${email};RSVP=TRUE:mailto:${email}`);
    });

    icsContent.push('END:VEVENT');
    icsContent.push('END:VCALENDAR');

    return icsContent.filter(Boolean).join('\r\n');
};

const sendEmailWithCalendarInviteStaging = async ({
    to,
    subject,
    html,
    calendarEvent
}) => {
    const accessToken = await getAccessToken();

    // Generate .ics content
    const icsContent = generateIcsContent(calendarEvent);
    const icsBase64 = Buffer.from(icsContent).toString('base64');

    const payload = {
        message: {
            subject,
            body: {
                contentType: "html",
                content: html,
            },
            toRecipients: [
                {
                    emailAddress: {
                        address: to,
                    },
                },
            ],
            attachments: [
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: "invite.ics",
                    contentType: "text/calendar",
                    contentBytes: icsBase64,
                },
            ],
        },
    };

    try {
        const res = await axios.post(
            `https://graph.microsoft.com/v1.0/users/${process.env.EMAIL_OUTLOOK_USER}/sendMail`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ Email with calendar invite sent via Graph API");
        return { success: true, messageId: res.data };
    } catch (err) {
        console.error("❌ Failed to send email:", err.response?.data || err.message);
        return { success: false, error: err.response?.data || err.message };
    }
};

const sendEmailWithCalendarInvite = async ({
    to,
    subject,
    html,
    calendarEvent
}) => {
    const accessToken = await getAccessToken();

    // Generate .ics content
    const icsContent = generateIcsContent(calendarEvent);
    const icsBase64 = Buffer.from(icsContent).toString('base64');

    const payload = {
        message: {
            subject,
            body: {
                contentType: "html",
                content: html,
            },
            toRecipients: [
                {
                    emailAddress: {
                        address: to,
                    },
                },
            ],
            attachments: [
                {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: "invite.ics",
                    contentType: "text/calendar",
                    contentBytes: icsBase64,
                },
            ],
        },
    };

    try {
        const res = await axios.post(
            `https://graph.microsoft.com/v1.0/users/${process.env.EMAIL_OUTLOOK_USER}/sendMail`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ Email with calendar invite sent via Graph API");
        return { success: true, messageId: res.data };
    } catch (err) {
        console.error("❌ Failed to send email:", err.response?.data || err.message);
        return { success: false, error: err.response?.data || err.message };
    }
};

module.exports = {
    sendEmailWithCalendarInvite,
    sendEmailWithCalendarInviteStaging,
    generateIcsContentStaging,
    generateIcsContent
};