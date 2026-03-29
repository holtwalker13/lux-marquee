import ics, { type EventAttributes } from "ics";
import { DateTime } from "luxon";
import { Resend } from "resend";
import { getEventTimezone } from "@/lib/event-datetime";

function utcParts(d: Date): [number, number, number, number, number] {
  const u = DateTime.fromJSDate(d, { zone: "utc" });
  return [u.year, u.month, u.day, u.hour, u.minute];
}

export function buildBookingIcs(params: {
  eventStartUtc: Date;
  durationHours: number;
  title: string;
  description: string;
  location?: string;
  clientEmail: string;
  ownerEmail: string;
}): { filename: string; content: string } | null {
  const ev: EventAttributes = {
    start: utcParts(params.eventStartUtc),
    startInputType: "utc",
    duration: { hours: params.durationHours },
    title: params.title,
    description: params.description,
    location: params.location,
    status: "CONFIRMED",
    busyStatus: "BUSY",
    organizer: { name: "Lux Marquee", email: params.ownerEmail },
    attendees: [
      {
        name: "Client",
        email: params.clientEmail,
        rsvp: true,
        partstat: "NEEDS-ACTION",
        role: "REQ-PARTICIPANT",
      },
      {
        name: "Studio",
        email: params.ownerEmail,
        rsvp: true,
        partstat: "ACCEPTED",
        role: "REQ-PARTICIPANT",
      },
    ],
  };

  const out = ics.createEvent(ev);
  if (out.error || !out.value) return null;
  return {
    filename: "marquee-booking.ics",
    content: out.value,
  };
}

export async function sendBookingInviteEmail(params: {
  eventStartUtc: Date;
  clientEmail: string;
  lettering: string;
  addressSummary: string;
}): Promise<{ sent: boolean; reason?: string; ics?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const owner = process.env.BUSINESS_OWNER_EMAIL?.trim();
  if (!key || !from || !owner) {
    const icsBlob = buildBookingIcs({
      eventStartUtc: params.eventStartUtc,
      durationHours: 2,
      title: "Marquee booking",
      description: `Lettering: ${params.lettering}\n${params.addressSummary}\n\nDisplay timezone: ${getEventTimezone()}`,
      location: params.addressSummary,
      clientEmail: params.clientEmail,
      ownerEmail: owner || "owner@example.com",
    });
    return {
      sent: false,
      reason:
        "Calendar email is off. Add RESEND_API_KEY, RESEND_FROM_EMAIL, and BUSINESS_OWNER_EMAIL to .env (or Netlify env), restart the server, then confirm again on a test job — or use Download calendar on the card.",
      ics: icsBlob?.content,
    };
  }

  const icsBlob = buildBookingIcs({
    eventStartUtc: params.eventStartUtc,
    durationHours: 2,
    title: "Marquee booking",
    description: `Lettering: ${params.lettering}\n${params.addressSummary}`,
    location: params.addressSummary,
    clientEmail: params.clientEmail,
    ownerEmail: owner,
  });
  if (!icsBlob) return { sent: false, reason: "Could not build calendar file." };

  const resend = new Resend(key);
  const subject = "Your marquee booking — calendar invite";
  const attachment = {
    filename: icsBlob.filename,
    content: Buffer.from(icsBlob.content).toString("base64"),
  };

  const [toClient, toOwner] = await Promise.all([
    resend.emails.send({
      from,
      to: params.clientEmail,
      subject,
      text: "Your booking is confirmed. See the attached calendar invite.",
      attachments: [attachment],
    }),
    resend.emails.send({
      from,
      to: owner,
      subject: `Booking confirmed — ${params.clientEmail}`,
      text: `Client: ${params.clientEmail}\nLettering: ${params.lettering}\n${params.addressSummary}`,
      attachments: [attachment],
    }),
  ]);

  if (toClient.error || toOwner.error) {
    return {
      sent: false,
      reason: [
        "Resend could not send:",
        toClient.error?.message,
        toOwner.error?.message,
      ]
        .filter(Boolean)
        .join(" "),
      ics: icsBlob.content,
    };
  }

  return { sent: true };
}
