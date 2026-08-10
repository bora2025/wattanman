import { redirect } from "next/navigation";

export default function LegacyAddonRequestsRedirect() {
  redirect("/platform/extensions");
}
