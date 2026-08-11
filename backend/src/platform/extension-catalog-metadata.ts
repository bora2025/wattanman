import { BadRequestException } from "@nestjs/common";

export const EXTENSION_CATEGORIES = [
  "ACADEMICS",
  "ADMINISTRATION",
  "COMMUNICATION",
  "FINANCE",
  "PRODUCTIVITY",
  "REPORTING",
  "SECURITY",
  "STUDENT_SERVICES",
  "THEMES",
  "OTHER",
] as const;

export const DATA_CATEGORIES = [
  "IDENTITY",
  "CONTACT",
  "ACADEMIC",
  "ATTENDANCE",
  "FINANCIAL",
  "LOCATION",
  "HEALTH",
  "USAGE",
  "CONTENT",
  "OTHER",
] as const;

export const DATA_USE_PURPOSES = [
  "CORE_FUNCTIONALITY",
  "ANALYTICS",
  "PERSONALIZATION",
  "COMMUNICATION",
  "SECURITY",
  "SUPPORT",
  "LEGAL_COMPLIANCE",
] as const;

export interface ExtensionDataUse {
  collectsPersonalData: boolean;
  dataCategories: string[];
  purposes: string[];
  sharesWithThirdParties: boolean;
  retentionDays: number | null;
}

export interface ExtensionCatalogMetadataInput {
  description?: string | null;
  category?: string;
  tags?: string[];
  locales?: string[];
  supportUrl?: string | null;
  privacyPolicyUrl?: string | null;
  dataUse?: Partial<ExtensionDataUse> | null;
}

const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function normalizedList(
  values: unknown,
  field: string,
  maximum: number,
  normalize: (value: string) => string,
  valid: (value: string) => boolean,
) {
  if (!Array.isArray(values))
    throw new BadRequestException(`${field} must be an array`);
  const result = [...new Set(values.map((value) => normalize(String(value).trim())).filter(Boolean))];
  if (result.length > maximum)
    throw new BadRequestException(`${field} supports at most ${maximum} values`);
  if (result.some((value) => !valid(value)))
    throw new BadRequestException(`${field} contains an unsupported value`);
  return result;
}

function optionalHttpsUrl(value: unknown, field: string) {
  if (value == null || String(value).trim() === "") return null;
  const normalized = String(value).trim();
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new BadRequestException(`${field} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:")
    throw new BadRequestException(`${field} must use HTTPS`);
  return parsed.toString();
}

export function normalizeCatalogMetadata(input: ExtensionCatalogMetadataInput) {
  const category = String(input.category || "OTHER").trim().toUpperCase();
  if (!(EXTENSION_CATEGORIES as readonly string[]).includes(category))
    throw new BadRequestException(
      `category must be one of ${EXTENSION_CATEGORIES.join(", ")}`,
    );

  const tags = normalizedList(
    input.tags || [],
    "tags",
    12,
    (value) => value.toLowerCase(),
    (value) => value.length <= 32 && TAG_PATTERN.test(value),
  );
  const locales = normalizedList(
    input.locales || ["en"],
    "locales",
    20,
    (value) => value,
    (value) => value.length <= 35 && LOCALE_PATTERN.test(value),
  );
  if (locales.length === 0)
    throw new BadRequestException("locales must contain at least one locale");

  const rawDataUse = input.dataUse || {};
  const dataCategories = normalizedList(
    rawDataUse.dataCategories || [],
    "dataUse.dataCategories",
    DATA_CATEGORIES.length,
    (value) => value.toUpperCase(),
    (value) => (DATA_CATEGORIES as readonly string[]).includes(value),
  );
  const purposes = normalizedList(
    rawDataUse.purposes || [],
    "dataUse.purposes",
    DATA_USE_PURPOSES.length,
    (value) => value.toUpperCase(),
    (value) => (DATA_USE_PURPOSES as readonly string[]).includes(value),
  );
  const collectsPersonalData = rawDataUse.collectsPersonalData === true;
  const sharesWithThirdParties = rawDataUse.sharesWithThirdParties === true;
  const retentionDays = rawDataUse.retentionDays == null
    ? null
    : Number(rawDataUse.retentionDays);
  if (retentionDays !== null && (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 36500))
    throw new BadRequestException("dataUse.retentionDays must be between 1 and 36500");
  if (!collectsPersonalData && (dataCategories.length || purposes.length || sharesWithThirdParties || retentionDays !== null))
    throw new BadRequestException("data-use details require collectsPersonalData to be true");
  if (collectsPersonalData && (!dataCategories.length || !purposes.length))
    throw new BadRequestException("personal-data collection requires categories and purposes");

  return {
    ...(input.description !== undefined
      ? { description: input.description?.trim() || null }
      : {}),
    category,
    tags,
    locales,
    supportUrl: optionalHttpsUrl(input.supportUrl, "supportUrl"),
    privacyPolicyUrl: optionalHttpsUrl(input.privacyPolicyUrl, "privacyPolicyUrl"),
    dataUse: {
      collectsPersonalData,
      dataCategories,
      purposes,
      sharesWithThirdParties,
      retentionDays,
    } satisfies ExtensionDataUse,
  };
}
