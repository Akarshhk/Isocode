import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { canViewFlat } from "@/lib/auth/access";

// Photos are personal data: served only to the flat's residents and staff, never cached publicly.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  const photo = await prisma.complaintPhoto.findUnique({ where: { id }, include: { complaint: { select: { flatId: true } } } });
  if (!photo || !canViewFlat(session, photo.complaint.flatId)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
