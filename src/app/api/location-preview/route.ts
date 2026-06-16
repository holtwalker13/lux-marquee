import { NextResponse } from "next/server";
import { getServiceTownDistancePreview } from "@/lib/service-towns";

type Body = {
  townId?: string;
  website?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.website && String(body.website).trim() !== "") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const townId = String(body.townId ?? "").trim();
  if (!townId) {
    return NextResponse.json({ error: "Select a town or city." }, { status: 400 });
  }

  const preview = getServiceTownDistancePreview(townId);
  if (!preview) {
    return NextResponse.json(
      { error: "That town isn’t on our list. Pick the closest match or mention your town in notes." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    distanceMiles: preview.distanceMiles,
    outsideServiceRadius: preview.outsideServiceRadius,
    serviceRadiusMiles: preview.serviceRadiusMiles,
    baseLabel: preview.baseLabel,
    matchedLabel: preview.townLabel,
  });
}
