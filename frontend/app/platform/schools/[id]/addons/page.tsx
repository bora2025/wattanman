import { redirect } from "next/navigation";

export default function LegacySchoolAddonsRedirect() {
  redirect("/platform/extensions");
}
