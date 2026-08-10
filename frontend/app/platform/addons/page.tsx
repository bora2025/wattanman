import { redirect } from "next/navigation";

export default function LegacyPlatformAddonsRedirect() {
  redirect("/platform/extensions");
}
