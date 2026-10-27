import { SPECIALTIES } from "@/lib/specialties";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ specialties: SPECIALTIES });
}
