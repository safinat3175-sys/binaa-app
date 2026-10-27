import { WILAYAS } from "@/lib/wilayas";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ wilayas: WILAYAS });
}
