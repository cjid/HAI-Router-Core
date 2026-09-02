import { getVersionStatus } from "@/lib/versionCheck";

export async function GET() {
  const status = await getVersionStatus();
  return Response.json(status);
}
