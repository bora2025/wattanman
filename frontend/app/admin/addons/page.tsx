import { redirect } from "next/navigation";

export default function LegacyAdminAddonsRedirect() {
  redirect("/admin/extensions");
}
