/**
 * ICS Export utilities for calendar synchronization
 * Generates iCalendar format (RFC 5545) compatible with Google Calendar, Apple Calendar, Samsung Calendar, etc.
 */

export interface CalendarEventExport {
  id: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  type: string;
}

/**
 * Escapes special characters in ICS text fields
 */
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Formats a date to ICS format (YYYYMMDDTHHMMSSZ for UTC)
 */
function formatDateToICS(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Formats a date to ICS all-day format (YYYYMMDD)
 */
function formatDateToICSAllDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
}

/**
 * Maps event type to ICS category
 */
function getCategory(type: string): string {
  const categoryMap: Record<string, string> = {
    'Oppdrag': 'Oppdrag',
    'Hendelse': 'Hendelse',
    'Vedlikehold': 'Vedlikehold',
    'Dokument': 'Dokument',
    'Møte': 'Møte',
    'Annet': 'Annet',
  };
  return categoryMap[type] || 'Annet';
}

/**
 * Generates ICS content from calendar events
 */
export function generateICSContent(events: CalendarEventExport[], companyName: string): string {
  const now = new Date();
  const dtstamp = formatDateToICS(now);
  
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//AviSafe//${escapeICSText(companyName)}//NO`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:AviSafe - ${escapeICSText(companyName)}`,
    'X-WR-TIMEZONE:Europe/Oslo',
  ];
  
  // Add VTIMEZONE for Europe/Oslo
  lines.push(
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Oslo',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  );
  
  // Add events
  for (const event of events) {
    const uid = `${event.type.toLowerCase()}-${event.id}@avisafe.no`;
    const isAllDay = event.startDate.getHours() === 0 && 
                     event.startDate.getMinutes() === 0 &&
                     event.startDate.getSeconds() === 0;
    
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    
    if (isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateToICSAllDay(event.startDate)}`);
      if (event.endDate) {
        // For all-day events, end date is exclusive in ICS, so add one day
        const endDateExclusive = new Date(event.endDate);
        endDateExclusive.setDate(endDateExclusive.getDate() + 1);
        lines.push(`DTEND;VALUE=DATE:${formatDateToICSAllDay(endDateExclusive)}`);
      } else {
        // Single day event - end is start + 1 day
        const endDateExclusive = new Date(event.startDate);
        endDateExclusive.setDate(endDateExclusive.getDate() + 1);
        lines.push(`DTEND;VALUE=DATE:${formatDateToICSAllDay(endDateExclusive)}`);
      }
    } else {
      lines.push(`DTSTART:${formatDateToICS(event.startDate)}`);
      if (event.endDate) {
        lines.push(`DTEND:${formatDateToICS(event.endDate)}`);
      } else {
        // Default to 1 hour duration
        const endDate = new Date(event.startDate);
        endDate.setHours(endDate.getHours() + 1);
        lines.push(`DTEND:${formatDateToICS(endDate)}`);
      }
    }
    
    lines.push(`SUMMARY:${escapeICSText(event.title)}`);
    
    // Build description with optional original description and always include link
    const descParts: string[] = [];
    if (event.description) {
      descParts.push(event.description);
    }
    descParts.push('Åpne i AviSafe: https://app.avisafe.no');
    lines.push(`DESCRIPTION:${escapeICSText(descParts.join('\\n\\n'))}`);
    lines.push(`URL:https://app.avisafe.no`);
    
    lines.push(`CATEGORIES:${getCategory(event.type)}`);
    lines.push('END:VEVENT');
  }
  
  lines.push('END:VCALENDAR');
  
  return lines.join('\r\n');
}

/**
 * Triggers download of an ICS file
 */
export function downloadICSFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
