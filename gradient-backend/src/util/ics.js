export const generateEventIcsContent = ({
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

    const uid = `${Date.now()}@thegradient.co.in`;
    const timestamp = formatDate(new Date());

    const startDateTime = combineDateTime(eventStartDate, eventStartTime);  
    const endDateTime = combineDateTime(eventEndDate || eventStartDate, eventEndTime);

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

