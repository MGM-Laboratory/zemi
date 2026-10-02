import { formatJakarta, formatTimeRange, type Ticket } from '@zemi/shared';

/** Ready-to-send plain text. The ticket URL is the registrant's private ticket, so only use it in their chat. */
export function registrationWhatsAppMessage(ticket: Ticket): string {
  const e = ticket.event;
  const when = [`Date: ${formatJakarta(e.startsAt, 'date-long')}`, `Time: ${formatTimeRange(e.startsAt, e.endsAt)}`];
  const venue = [e.venue, e.roomNote].filter(Boolean).join(' · ');
  const place = ticket.attendanceMode === 'online'
    ? ['Joining: Online', `Event page: ${new URL(`/events/${encodeURIComponent(e.slug)}`, ticket.ticketUrl).toString()}`]
    : [
        'Joining: In person',
        ...(venue ? [`Venue: ${venue}`] : []),
        ...(e.mapsUrl ? [`Map: ${e.mapsUrl}`] : []),
      ];

  if (ticket.status === 'cancelled') {
    return [
      `Hi ${ticket.fullName},`,
      '',
      `Your registration for ${e.title} has been cancelled. Ticket ${ticket.code} is no longer valid for check-in.`,
      '',
      ...when,
      ...place,
      '',
      'If this does not look right, please reply to this message so our team can help.',
      '',
      '— Zemi Studio',
    ].join('\n');
  }

  return [
    `Hi ${ticket.fullName},`,
    '',
    `Your registration for ${e.title} is confirmed. Here are your ticket details:`,
    '',
    `Name: ${ticket.fullName}`,
    `Ticket code: ${ticket.code}`,
    ...when,
    ...place,
    `Your ticket and QR code: ${ticket.ticketUrl}`,
    '',
    ticket.attendanceMode === 'online'
      ? 'Open the event page when the livestream starts. Keep your ticket link handy if you decide to join in person.'
      : 'Please show the attached ticket image or open your ticket link at check-in.',
    '',
    'See you there!\n— Zemi Studio',
  ].join('\n');
}
