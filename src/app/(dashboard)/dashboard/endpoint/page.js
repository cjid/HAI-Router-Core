import { redirect } from "next/navigation";

/** Legacy path — canonical Dashboard lives at /dashboard */
export default function EndpointLegacyRedirect() {
  redirect("/dashboard");
}
