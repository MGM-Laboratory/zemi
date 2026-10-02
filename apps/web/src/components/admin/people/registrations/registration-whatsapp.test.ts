import { describe, expect, it } from 'vitest';
import type { Ticket } from '@zemi/shared';
import { registrationWhatsAppMessage } from './registration-whatsapp';

const ticket: Ticket = {
  token: 'test-private-ticket-token',
  code: 'ZEMI-1234',
  fullName: 'Rina Wijaya',
  email: 'r***@example.com',
  attendanceMode: 'in-person',
  status: 'registered',
  checkedInAt: null,
  createdAt: '2026-10-01T12:00:00.000Z',
  qrSvgUrl: '/api/v1/public/tickets/test-private-ticket-token/qr.svg',
  qrPngUrl: '/api/v1/public/tickets/test-private-ticket-token/qr.png',
  calendarUrl: '/api/v1/public/tickets/test-private-ticket-token/calendar.ics',
  ticketUrl: 'https://zemi.ac/tickets/test-private-ticket-token',
  event: {
    id: 'event-1', slug: 'first-talk', title: 'First Talk', number: 2,
    startsAt: '2026-10-02T06:00:00.000Z', endsAt: '2026-10-02T08:00:00.000Z',
    status: 'scheduled', venue: 'MGM Hall', roomNote: 'Room A', mapsUrl: 'https://maps.example/room-a',
    cover: null, accent: 'blue',
  },
};

describe('registrationWhatsAppMessage', () => {
  it('fills an in-person confirmation with the registrant, event, venue and private ticket link', () => {
    const message = registrationWhatsAppMessage(ticket);
    expect(message).toContain('Hi Rina Wijaya,');
    expect(message).toContain('Ticket code: ZEMI-1234');
    expect(message).toContain('Venue: MGM Hall · Room A');
    expect(message).toContain('Map: https://maps.example/room-a');
    expect(message).toContain(ticket.ticketUrl);
    expect(message).not.toMatch(/\{\{|\[name\]|undefined|null/);
  });

  it('uses the event page for online attendance and excludes the physical venue', () => {
    const message = registrationWhatsAppMessage({ ...ticket, attendanceMode: 'online' });
    expect(message).toContain('Joining: Online');
    expect(message).toContain('Event page: https://zemi.ac/events/first-talk');
    expect(message).not.toContain('Venue:');
  });

  it('never invites someone to use a cancelled ticket', () => {
    const message = registrationWhatsAppMessage({ ...ticket, status: 'cancelled' });
    expect(message).toContain('no longer valid for check-in');
    expect(message).not.toContain(ticket.ticketUrl);
    expect(message).not.toContain('Please show the attached ticket');
  });
});
