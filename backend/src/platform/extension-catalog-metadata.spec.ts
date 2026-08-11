import { BadRequestException } from "@nestjs/common";
import {
  normalizeCatalogMetadata,
} from "./extension-catalog-metadata";

describe("extension catalog metadata", () => {
  it("normalizes a complete privacy disclosure", () => {
    expect(normalizeCatalogMetadata({
      category: "academics",
      tags: ["Class-Rosters", "class-rosters", "attendance"],
      locales: ["en", "km-KH"],
      supportUrl: "https://support.example.com/help",
      privacyPolicyUrl: "https://example.com/privacy",
      dataUse: {
        collectsPersonalData: true,
        dataCategories: ["identity", "academic"],
        purposes: ["core_functionality"],
        sharesWithThirdParties: false,
        retentionDays: 365,
      },
    })).toEqual(expect.objectContaining({
      category: "ACADEMICS",
      tags: ["class-rosters", "attendance"],
      locales: ["en", "km-KH"],
      dataUse: expect.objectContaining({ retentionDays: 365 }),
    }));
  });

  it.each([
    [{ category: "UNKNOWN" }, "category"],
    [{ tags: ["not valid"] }, "tags"],
    [{ locales: [] }, "locales"],
    [{ supportUrl: "http://example.com" }, "HTTPS"],
    [{ dataUse: { collectsPersonalData: true } }, "categories and purposes"],
    [{ dataUse: { collectsPersonalData: false, retentionDays: 30 } }, "collectsPersonalData"],
  ])("rejects invalid metadata %#", (input, message) => {
    expect(() => normalizeCatalogMetadata(input as any)).toThrow(message);
    expect(() => normalizeCatalogMetadata(input as any)).toThrow(BadRequestException);
  });
});
