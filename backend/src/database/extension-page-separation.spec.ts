import { readFileSync } from "fs";
import { resolve } from "path";

describe("school extension page separation", () => {
  const frontend = (...parts: string[]) =>
    readFileSync(resolve(process.cwd(), "..", "frontend", ...parts), "utf8");

  it("keeps discovery focused on catalog browsing and requests", () => {
    const marketplace = frontend("app", "admin", "extensions", "page.tsx");
    expect(marketplace).toContain("/api/extensions/directory");
    expect(marketplace).toContain("/admin/extensions/manage");
    expect(marketplace).not.toContain("/update-policy");
    expect(marketplace).not.toContain("/pilot-feedback");
    expect(marketplace).not.toContain("Remove permanently");
  });

  it("keeps installed lifecycle controls on the management page", () => {
    const management = frontend("app", "admin", "extensions", "manage", "page.tsx");
    expect(management).toContain("/api/extensions/installations");
    expect(management).toContain("/update-policy");
    expect(management).toContain("/pilot-feedback");
    expect(management).toContain("Remove permanently");
    expect(management).not.toContain("/api/extensions/directory");
  });
});
