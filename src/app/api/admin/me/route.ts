import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ admin: null }, { status: 401 });
  return Response.json({
    admin: { id: auth.user.id, name: auth.user.name, username: auth.user.username },
  });
}
