import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { createHash, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { getCurrentSchoolId } from "../tenancy/tenant-context";
import { R2StorageService } from "../storage/r2-storage.service";
import { ExtensionSigningService } from "./extension-signing.service";
import { dateIdPage, dateIdPageBy, decodeDateIdCursor, parsePageLimit } from "../common/cursor-pagination";

interface Actor {
  userId?: string;
  role?: string;
  name?: string;
  email?: string;
}

const PILOT_ACCEPTANCE_CRITERIA = [
  {
    key: "install_without_rebuild",
    label: "Installs from the signed ZIP without a Wattaman rebuild",
  },
  {
    key: "role_navigation",
    label: "Navigation and pages appear only for approved roles",
  },
  { key: "tenant_isolation", label: "School data remains tenant-isolated" },
  {
    key: "core_stability",
    label: "Core startup and workflows remain stable when enabled or disabled",
  },
  {
    key: "upgrade_rollback",
    label: "Upgrade and rollback preserve valid school data",
  },
  {
    key: "operator_runbook",
    label: "Operators can diagnose, disable, and recover the extension",
  },
] as const;

@Injectable()
export class ExtensionInstallationsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: R2StorageService,
    private signing: ExtensionSigningService,
  ) {}

  async schoolDirectory(input: {
    cursor?: string;
    limit?: string;
    search?: string;
    category?: string;
    runtimeType?: string;
    commercialType?: string;
    locale?: string;
    sort?: string;
  } = {}) {
    const schoolId = getCurrentSchoolId();
    const limit = parsePageLimit(input.limit);
    const sort = ["FEATURED", "NEWEST", "NAME_ASC", "NAME_DESC"].includes(input.sort || "") ? input.sort! : "FEATURED";
    const cursor = this.decodeCatalogCursor(input.cursor, sort);
    const search = input.search?.trim().slice(0, 100);
    const filters: Prisma.ExtensionWhereInput[] = [
      ...(search ? [{ OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { key: { contains: search, mode: "insensitive" as const } },
        { description: { contains: search, mode: "insensitive" as const } },
        { tags: { has: search.toLowerCase() } },
      ] }] : []),
      ...(input.category ? [{ category: input.category.toUpperCase() }] : []),
      ...(input.runtimeType ? [{ runtimeType: input.runtimeType.toUpperCase() }] : []),
      ...(input.commercialType ? [{ commercialType: input.commercialType.toUpperCase() }] : []),
      ...(input.locale ? [{ locales: { has: input.locale } }] : []),
      ...(cursor ? [this.catalogCursorWhere(cursor, sort)] : []),
    ];
    const orderBy: Prisma.ExtensionOrderByWithRelationInput[] = sort === "NAME_ASC"
      ? [{ name: "asc" }, { id: "asc" }]
      : sort === "NAME_DESC"
        ? [{ name: "desc" }, { id: "desc" }]
        : sort === "NEWEST"
          ? [{ createdAt: "desc" }, { id: "desc" }]
          : [{ featuredRank: "asc" }, { createdAt: "desc" }, { id: "desc" }];
    const rows = await this.prisma.extension.findMany({
      where: {
        status: "ACTIVE",
        versions: { some: { lifecycleStatus: "PUBLISHED" } },
        OR: [
          { visibility: "LISTED" },
          { visibility: "PRIVATE", visibilityGrants: { some: { schoolId } } },
        ],
        ...(filters.length ? { AND: filters } : {}),
      },
      include: {
        versions: {
          where: { lifecycleStatus: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
      },
      orderBy,
      take: limit + 1,
    });
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit && items.length
        ? this.encodeCatalogCursor(items[items.length - 1], sort)
        : null,
    };
  }

  async schoolCatalogCollections(localeValue?: string) {
    const schoolId = getCurrentSchoolId();
    const locale = localeValue?.trim() || "en";
    return this.prisma.extensionCatalogCollection.findMany({
      where: { status: "PUBLISHED", locale: { in: [...new Set([locale, "en"])] } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 20,
      include: {
        items: {
          where: {
            extension: {
              status: "ACTIVE",
              versions: { some: { lifecycleStatus: "PUBLISHED" } },
              OR: [
                { visibility: "LISTED" },
                { visibility: "PRIVATE", visibilityGrants: { some: { schoolId } } },
              ],
            },
          },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          take: 20,
          include: {
            extension: {
              include: {
                versions: {
                  where: { lifecycleStatus: "PUBLISHED" },
                  orderBy: { publishedAt: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
  }

  private decodeCatalogCursor(value: string | undefined, sort: string): any | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      if (parsed.sort !== sort || typeof parsed.id !== "string") throw new Error();
      if (["FEATURED", "NEWEST"].includes(sort) && !parsed.createdAt) throw new Error();
      if (["NAME_ASC", "NAME_DESC"].includes(sort) && typeof parsed.name !== "string") throw new Error();
      if (sort === "FEATURED" && !Number.isInteger(parsed.featuredRank)) throw new Error();
      return parsed;
    } catch {
      throw new BadRequestException("Invalid catalog cursor");
    }
  }

  private encodeCatalogCursor(row: any, sort: string) {
    return Buffer.from(JSON.stringify({
      sort,
      id: row.id,
      ...(sort === "FEATURED" ? { featuredRank: row.featuredRank, createdAt: row.createdAt.toISOString() } : {}),
      ...(sort === "NEWEST" ? { createdAt: row.createdAt.toISOString() } : {}),
      ...(["NAME_ASC", "NAME_DESC"].includes(sort) ? { name: row.name } : {}),
    })).toString("base64url");
  }

  private catalogCursorWhere(cursor: any, sort: string): Prisma.ExtensionWhereInput {
    if (sort === "NAME_ASC") return { OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }] };
    if (sort === "NAME_DESC") return { OR: [{ name: { lt: cursor.name } }, { name: cursor.name, id: { lt: cursor.id } }] };
    const createdAt = new Date(cursor.createdAt);
    if (sort === "NEWEST") return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }] };
    return { OR: [
      { featuredRank: { gt: cursor.featuredRank } },
      { featuredRank: cursor.featuredRank, createdAt: { lt: createdAt } },
      { featuredRank: cursor.featuredRank, createdAt, id: { lt: cursor.id } },
    ] };
  }

  async schoolInstallations(input: { cursor?: string; limit?: string } = {}) {
    const limit = parsePageLimit(input.limit);
    const cursor = decodeDateIdCursor(input.cursor);
    const rows = await this.prisma.extensionInstallation.findMany({
      where: cursor ? { OR: [{ updatedAt: { lt: cursor.createdAt } }, { updatedAt: cursor.createdAt, id: { lt: cursor.id } }] } : undefined,
      include: { extension: true, installedVersion: true, pilotFeedback: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = dateIdPageBy(rows, limit, (row) => row.updatedAt);
    return this.withLastJob(page);
  }

  /** Most recent lifecycle job per installation, batched (Postgres DISTINCT ON), not N+1. */
  private async latestJobsByInstallation(installationIds: string[]) {
    if (!installationIds.length) return new Map<string, unknown>();
    const jobs = await this.prisma.extensionLifecycleJob.findMany({
      where: { installationId: { in: installationIds } },
      orderBy: [{ installationId: "asc" }, { updatedAt: "desc" }],
      distinct: ["installationId"],
      select: {
        id: true,
        installationId: true,
        command: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        queuedAt: true,
        startedAt: true,
        completedAt: true,
        attempts: true,
      },
    });
    return new Map(jobs.map((job) => [job.installationId as string, job]));
  }

  private async withLastJob<T extends { items: { id: string }[] }>(page: T) {
    const jobs = await this.latestJobsByInstallation(page.items.map((row) => row.id));
    return { ...page, items: page.items.map((row) => ({ ...row, lastJob: jobs.get(row.id) ?? null })) };
  }

  async schoolRequestContext(actor: Actor) {
    const schoolId = getCurrentSchoolId();
    const [school, admin] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, subdomain: true } }),
      actor.userId
        ? this.prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, name: true, email: true, phone: true } })
        : null,
    ]);
    if (!school || !admin) throw new NotFoundException("School administrator not found");
    const payment = await this.paymentSettings();
    return { school, admin, payment };
  }

  async paymentSettings() {
    const setting = await this.prisma.extensionPaymentSetting.findUnique({
      where: { id: "default" },
    });
    return setting
      ? {
          bankName: setting.bankName,
          accountName: setting.accountName,
          accountNumber: setting.accountNumber,
          currency: setting.currency,
          instructions: setting.instructions,
          hasQr: !!setting.qrStorageKey,
          version: setting.version,
          updatedAt: setting.updatedAt,
        }
      : { currency: "USD", hasQr: false };
  }

  async updatePaymentSettings(
    data: {
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      currency?: string;
      instructions?: string;
    },
    qrFile: Express.Multer.File | undefined,
    actor: Actor,
  ) {
    if (qrFile && !["image/png", "image/jpeg", "image/webp"].includes(qrFile.mimetype))
      throw new BadRequestException("Bank QR must be a PNG, JPG, or WebP image");
    const currency = data.currency?.trim().toUpperCase() || "USD";
    if (!/^[A-Z]{3}$/.test(currency))
      throw new BadRequestException("Payment currency must be a three-letter ISO code");
    const existing = await this.prisma.extensionPaymentSetting.findUnique({
      where: { id: "default" },
    });
    let qrStorageKey = existing?.qrStorageKey;
    if (qrFile) {
      qrStorageKey = `billing/payment-qr/${Date.now()}-${qrFile.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await this.storage.putPrivate(qrStorageKey, qrFile.buffer, qrFile.mimetype);
    }
    const setting = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.extensionPaymentSetting.upsert({
        where: { id: "default" },
        update: {
          bankName: data.bankName?.trim() || null,
          accountName: data.accountName?.trim() || null,
          accountNumber: data.accountNumber?.trim() || null,
          currency,
          instructions: data.instructions?.trim() || null,
          ...(qrFile
            ? { qrStorageKey, qrContentType: qrFile.mimetype, qrFileName: qrFile.originalname }
            : {}),
          version: { increment: 1 },
          updatedBy: actor.userId,
        },
        create: {
          id: "default",
          bankName: data.bankName?.trim() || null,
          accountName: data.accountName?.trim() || null,
          accountNumber: data.accountNumber?.trim() || null,
          currency,
          instructions: data.instructions?.trim() || null,
          qrStorageKey,
          qrContentType: qrFile?.mimetype,
          qrFileName: qrFile?.originalname,
          version: 1,
          updatedBy: actor.userId,
        },
      });
      await transaction.extensionPaymentSettingHistory.create({
        data: {
          settingId: updated.id,
          version: updated.version,
          bankName: updated.bankName,
          accountName: updated.accountName,
          accountNumber: updated.accountNumber,
          currency: updated.currency,
          instructions: updated.instructions,
          qrStorageKey: updated.qrStorageKey,
          qrContentType: updated.qrContentType,
          qrFileName: updated.qrFileName,
          actorId: actor.userId,
        },
      });
      return updated;
    });
    await this.log(actor, "PAYMENT_QR_UPDATE", setting.id, "Extension payment settings", {
      bankName: setting.bankName,
      accountName: setting.accountName,
      currency: setting.currency,
      version: setting.version,
    });
    return this.paymentSettings();
  }

  async paymentSettingsHistory(input: { cursor?: string; limit?: string } = {}) {
    const limit = parsePageLimit(input.limit);
    const cursor = decodeDateIdCursor(input.cursor);
    const rows = await this.prisma.extensionPaymentSettingHistory.findMany({
      where: {
        settingId: "default",
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    return dateIdPage(rows.map((row) => ({
      ...row,
      qrStorageKey: undefined,
      hasQr: !!row.qrStorageKey,
    })), limit);
  }

  async paymentQr(version?: string) {
    const versionNumber = version == null ? null : Number(version);
    if (version != null && (!Number.isSafeInteger(versionNumber) || !versionNumber || versionNumber < 1))
      throw new BadRequestException("Payment setting version is invalid");
    const setting = versionNumber
      ? await this.prisma.extensionPaymentSettingHistory.findUnique({
          where: { settingId_version: { settingId: "default", version: versionNumber } },
        })
      : await this.prisma.extensionPaymentSetting.findUnique({ where: { id: "default" } });
    if (!setting?.qrStorageKey) throw new NotFoundException("Bank QR is not configured");
    return {
      contents: await this.storage.getPrivate(setting.qrStorageKey),
      contentType: setting.qrContentType || "image/png",
    };
  }

  async enabledExtensionKeys() {
    const installations = await this.prisma.extensionInstallation.findMany({
      where: {
        enabled: true,
        installedAt: { not: null },
        uninstalledAt: null,
        extension: { status: "ACTIVE" },
        installedVersion: {
          lifecycleStatus: { in: ["PUBLISHED", "DEPRECATED"] },
        },
      },
      select: { extension: { select: { key: true } } },
    });
    return {
      enabled: installations.map((installation) => installation.extension.key),
    };
  }

  async request(extensionId: string, actor: Actor) {
    const schoolId = getCurrentSchoolId();
    const extension = await this.prisma.extension.findFirst({
      where: {
        id: extensionId,
        status: "ACTIVE",
        pricingModel: { in: ["FREE", "PRIVATE_CONTRACT"] },
        OR: [
          { visibility: { in: ["LISTED", "UNLISTED"] } },
          { visibility: "PRIVATE", visibilityGrants: { some: { schoolId } } },
        ],
      },
      include: {
        versions: {
          where: { lifecycleStatus: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!extension || !extension.versions[0])
      throw new NotFoundException(
        "No published extension version is available",
      );
    const [school, admin, existing] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId } }),
      actor.userId
        ? this.prisma.user.findUnique({ where: { id: actor.userId } })
        : null,
      this.prisma.extensionInstallation.findFirst({ where: { extensionId } }),
    ]);
    if (!school || !admin)
      throw new NotFoundException("School administrator not found");
    if (existing?.enabled)
      throw new ConflictException(
        "Extension is already active for this school",
      );
    const pricingSnapshot = this.pricingSnapshot(extension);
    const installation = existing
      ? await this.prisma.extensionInstallation.update({
          where: { id: existing.id },
          data: {
            requestedAt: new Date(),
            requestedBy: actor.userId,
            lifecycleState: "REQUESTED",
            enabled: false,
            approvedAt: null,
            approvedBy: null,
            installedAt: null,
            installedBy: null,
            uninstalledAt: null,
            purgeAfter: null,
            billingStatus: extension.pricingModel === "FREE" ? "ACTIVE" : "PENDING",
            requestSchoolName: school.name,
            requestAdminName: admin.name,
            requestAdminEmail: admin.email,
            ...pricingSnapshot,
          },
        })
      : await this.prisma.extensionInstallation.create({
          data: {
            schoolId,
            extensionId,
            installedVersionId: extension.versions[0].id,
            requestedAt: new Date(),
            requestedBy: actor.userId,
            lifecycleState: "REQUESTED",
            billingStatus: extension.pricingModel === "FREE" ? "ACTIVE" : "PENDING",
            requestSchoolName: school.name,
            requestAdminName: admin.name,
            requestAdminEmail: admin.email,
            ...pricingSnapshot,
          },
        });
    await this.log(actor, "REQUEST", installation.id, extension.name, {
      extensionId,
      schoolId,
      requestSchoolName: school.name,
      requestAdminName: admin.name,
      toState: "REQUESTED",
    });
    return installation;
  }

  async requestPaid(
    extensionId: string,
    file: Express.Multer.File,
    data: { paymentReference?: string; paymentNotes?: string },
    actor: Actor,
  ) {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.mimetype))
      throw new BadRequestException("Invoice must be a PDF, JPG, or PNG file");
    const schoolId = getCurrentSchoolId();
    const extension = await this.prisma.extension.findFirst({
      where: {
        id: extensionId,
        status: "ACTIVE",
        pricingModel: { in: ["ONE_TIME", "SUBSCRIPTION"] },
        OR: [
          { visibility: { in: ["LISTED", "UNLISTED"] } },
          { visibility: "PRIVATE", visibilityGrants: { some: { schoolId } } },
        ],
      },
      include: {
        versions: {
          where: { lifecycleStatus: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!extension?.versions[0])
      throw new NotFoundException("Paid extension is not available");
    const [school, admin, existing] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId } }),
      actor.userId
        ? this.prisma.user.findUnique({ where: { id: actor.userId } })
        : null,
      this.prisma.extensionInstallation.findFirst({ where: { extensionId } }),
    ]);
    if (!school || !admin) throw new NotFoundException("School administrator not found");
    if (existing?.enabled)
      throw new ConflictException("Extension is already active for this school");
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `schools/${schoolId}/billing/extensions/${extensionId}/${Date.now()}-${safeName}`;
    const checksum = createHash("sha256").update(file.buffer).digest("hex");
    const submittedAt = new Date();
    await this.storage.putPrivate(storageKey, file.buffer, file.mimetype);
    const requestData = {
      installedVersionId: extension.versions[0].id,
      requestedAt: new Date(),
      requestedBy: actor.userId,
      approvedAt: null,
      approvedBy: null,
      installedAt: null,
      installedBy: null,
      enabled: false,
      lifecycleState: "PAYMENT_REVIEW",
      billingStatus: "PENDING",
      requestSchoolName: school.name,
      requestAdminName: admin.name,
      requestAdminEmail: admin.email,
      paymentReference: data.paymentReference?.trim() || null,
      paymentNotes: data.paymentNotes?.trim() || null,
      invoiceStorageKey: storageKey,
      invoiceFileName: safeName,
      invoiceContentType: file.mimetype,
      invoiceSize: file.size,
      invoiceChecksum: checksum,
      invoiceUploadedAt: submittedAt,
      paymentSubmittedAt: submittedAt,
      uninstalledAt: null,
      purgeAfter: null,
      ...this.pricingSnapshot(extension),
    };
    let installation;
    try {
      installation = await this.prisma.$transaction(async (transaction) => {
        const saved = existing
          ? await transaction.extensionInstallation.update({
              where: { id: existing.id },
              data: requestData,
            })
          : await transaction.extensionInstallation.create({
              data: { schoolId, extensionId, ...requestData },
            });
        await transaction.extensionPaymentEvidence.create({
          data: {
            installationId: saved.id,
            schoolId,
            storageKey,
            fileName: safeName,
            contentType: file.mimetype,
            size: file.size,
            checksum,
            status: "SUBMITTED",
            uploadedAt: submittedAt,
            submittedAt,
            retainUntil: this.paymentEvidenceRetentionDate(submittedAt),
            createdBy: actor.userId,
          },
        });
        return saved;
      });
    } catch (error) {
      await this.storage.deletePrivate(storageKey).catch(() => undefined);
      throw error;
    }
    await this.log(actor, "PAID_REQUEST", installation.id, extension.name, {
      extensionId,
      schoolId,
      pricingModel: extension.pricingModel,
      priceMinor: extension.priceMinor,
      currency: extension.currency,
      billingInterval: extension.billingInterval,
      paymentReference: requestData.paymentReference,
      toState: "PAYMENT_REVIEW",
    });
    return installation;
  }

  async initiatePaymentEvidence(
    extensionId: string,
    data: {
      fileName?: string;
      contentType?: string;
      size?: number;
      checksum?: string;
      paymentReference?: string;
      paymentNotes?: string;
    },
    actor: Actor,
  ) {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    const contentType = data.contentType?.trim().toLowerCase() || "";
    const size = data.size;
    const checksum = data.checksum?.trim().toLowerCase() || "";
    if (!allowedTypes.includes(contentType))
      throw new BadRequestException("Invoice must be a PDF, JPG, or PNG file");
    if (!Number.isSafeInteger(size) || !size || size > 5 * 1024 * 1024)
      throw new BadRequestException("Invoice size must be between 1 byte and 5 MB");
    if (!/^[a-f0-9]{64}$/.test(checksum))
      throw new BadRequestException("Invoice SHA-256 checksum is required");
    const schoolId = getCurrentSchoolId();
    const extension = await this.prisma.extension.findFirst({
      where: {
        id: extensionId,
        status: "ACTIVE",
        pricingModel: { in: ["ONE_TIME", "SUBSCRIPTION"] },
        OR: [
          { visibility: { in: ["LISTED", "UNLISTED"] } },
          { visibility: "PRIVATE", visibilityGrants: { some: { schoolId } } },
        ],
      },
      include: {
        versions: {
          where: { lifecycleStatus: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!extension?.versions[0])
      throw new NotFoundException("Paid extension is not available");
    const [school, admin, existing] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId } }),
      actor.userId ? this.prisma.user.findUnique({ where: { id: actor.userId } }) : null,
      this.prisma.extensionInstallation.findFirst({ where: { extensionId } }),
    ]);
    if (!school || !admin) throw new NotFoundException("School administrator not found");
    if (existing?.enabled) throw new ConflictException("Extension is already active for this school");
    const safeName = (data.fileName || "invoice").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const storageKey = `schools/${schoolId}/billing/extensions/${extensionId}/${randomUUID()}-${checksum}-${safeName}`;
    const requestData = {
      installedVersionId: extension.versions[0].id,
      requestedAt: new Date(),
      requestedBy: actor.userId,
      approvedAt: null,
      approvedBy: null,
      installedAt: null,
      installedBy: null,
      enabled: false,
      lifecycleState: "REQUESTED",
      billingStatus: "PENDING",
      requestSchoolName: school.name,
      requestAdminName: admin.name,
      requestAdminEmail: admin.email,
      paymentReference: data.paymentReference?.trim() || null,
      paymentNotes: data.paymentNotes?.trim() || null,
      invoiceStorageKey: storageKey,
      invoiceFileName: safeName,
      invoiceContentType: contentType,
      invoiceSize: size,
      invoiceChecksum: checksum,
      invoiceUploadedAt: null,
      paymentSubmittedAt: null,
      uninstalledAt: null,
      purgeAfter: null,
      ...this.pricingSnapshot(extension),
    };
    const installation = await this.prisma.$transaction(async (transaction) => {
      const saved = existing
        ? await transaction.extensionInstallation.update({ where: { id: existing.id }, data: requestData })
        : await transaction.extensionInstallation.create({ data: { schoolId, extensionId, ...requestData } });
      await transaction.extensionPaymentEvidence.create({
        data: {
          installationId: saved.id,
          schoolId,
          storageKey,
          fileName: safeName,
          contentType,
          size: size!,
          checksum,
          status: "PENDING",
          retainUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdBy: actor.userId,
        },
      });
      return saved;
    });
    await this.log(actor, "PAYMENT_EVIDENCE_INITIATED", installation.id, extension.name, {
      extensionId, schoolId, size, checksum,
      toState: "REQUESTED",
    });
    return {
      installationId: installation.id,
      upload: this.storage.presignPrivateUpload(storageKey, contentType, checksum),
    };
  }

  async finalizePaymentEvidence(installationId: string, actor: Actor) {
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id: installationId },
      include: { extension: true },
    });
    if (!installation?.invoiceStorageKey || !installation.invoiceChecksum || !installation.invoiceSize) {
      throw new NotFoundException("Pending payment evidence was not found");
    }
    if (installation.paymentSubmittedAt) return installation;
    const object = await this.storage.headPrivate(installation.invoiceStorageKey);
    if (
      object.contentLength !== installation.invoiceSize ||
      object.contentType?.split(";")[0].trim().toLowerCase() !== installation.invoiceContentType ||
      object.checksum?.trim().toLowerCase() !== installation.invoiceChecksum
    ) {
      throw new ConflictException("Uploaded payment evidence does not match its signed request");
    }
    const contents = await this.storage.getPrivate(installation.invoiceStorageKey);
    if (
      contents.length !== installation.invoiceSize ||
      createHash("sha256").update(contents).digest("hex") !== installation.invoiceChecksum
    ) {
      throw new ConflictException("Uploaded payment evidence checksum verification failed");
    }
    const now = new Date();
    const finalized = await this.prisma.$transaction(async (transaction) => {
      const evidence = await transaction.extensionPaymentEvidence.updateMany({
        where: { installationId: installation.id, storageKey: installation.invoiceStorageKey, status: "PENDING" },
        data: {
          status: "SUBMITTED",
          uploadedAt: now,
          submittedAt: now,
          retainUntil: this.paymentEvidenceRetentionDate(now),
        },
      });
      if (evidence.count !== 1)
        throw new ConflictException("Pending payment evidence record is unavailable");
      return transaction.extensionInstallation.update({
        where: { id: installation.id },
        data: { invoiceUploadedAt: now, paymentSubmittedAt: now, lifecycleState: "PAYMENT_REVIEW" },
      });
    });
    await this.log(actor, "PAYMENT_EVIDENCE_SUBMITTED", installation.id, installation.extension.name, {
      checksum: installation.invoiceChecksum,
      size: installation.invoiceSize,
      fromState: this.installationLifecycleState(installation),
      toState: "PAYMENT_REVIEW",
    });
    return finalized;
  }

  async paymentEvidenceDownloadUrl(installationId: string, actor: Actor) {
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id: installationId },
      select: {
        invoiceStorageKey: true,
        invoiceFileName: true,
        paymentSubmittedAt: true,
        extension: { select: { name: true } },
        paymentEvidence: {
          where: { status: "SUBMITTED" },
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: { id: true, storageKey: true, fileName: true, retainUntil: true, purgedAt: true, legalHold: true },
        },
      },
    });
    const evidence = installation?.paymentEvidence[0];
    if (!installation?.invoiceStorageKey || !installation.paymentSubmittedAt || !evidence?.storageKey || evidence.purgedAt)
      throw new NotFoundException("Payment evidence not found");
    if (evidence.retainUntil <= new Date() && !evidence.legalHold)
      throw new NotFoundException("Payment evidence retention period has expired");
    await this.log(actor, "PAYMENT_EVIDENCE_ACCESS", installationId, installation.extension.name, {
      evidenceId: evidence.id,
      access: "SIGNED_DOWNLOAD_URL",
    });
    return {
      fileName: evidence.fileName || installation.invoiceFileName || "payment-evidence",
      download: this.storage.presignPrivateDownload(evidence.storageKey),
    };
  }

  async setPaymentEvidenceLegalHold(
    installationId: string,
    held: boolean,
    reason: string | undefined,
    actor: Actor,
  ) {
    if (!reason?.trim()) throw new BadRequestException("A legal hold reason is required");
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id: installationId },
      select: {
        extension: { select: { name: true } },
        paymentEvidence: {
          where: { status: "SUBMITTED", purgedAt: null },
          orderBy: { submittedAt: "desc" },
          take: 1,
        },
      },
    });
    const evidence = installation?.paymentEvidence[0];
    if (!evidence) throw new NotFoundException("Payment evidence not found");
    const updated = await this.prisma.extensionPaymentEvidence.update({
      where: { id: evidence.id },
      data: {
        legalHold: held,
        legalHoldReason: reason.trim(),
        legalHoldAt: new Date(),
        legalHoldBy: actor.userId,
      },
      select: {
        id: true,
        status: true,
        retainUntil: true,
        legalHold: true,
        legalHoldReason: true,
        legalHoldAt: true,
        legalHoldBy: true,
      },
    });
    await this.log(actor, held ? "PAYMENT_EVIDENCE_HOLD" : "PAYMENT_EVIDENCE_RELEASE", installationId, installation!.extension.name, {
      evidenceId: evidence.id,
      reason: reason.trim(),
    });
    return updated;
  }

  private pricingSnapshot(extension: {
    pricingModel: string;
    priceMinor?: number | null;
    currency: string;
    billingInterval?: string | null;
    contractReference?: string | null;
    priceNote?: string | null;
  }) {
    return {
      requestPricingModel: extension.pricingModel,
      requestPriceMinor: extension.priceMinor ?? null,
      requestCurrency: extension.currency,
      requestBillingInterval: extension.billingInterval ?? null,
      requestContractReference: extension.contractReference ?? null,
      requestPriceNote: extension.priceNote ?? null,
    };
  }

  private paymentEvidenceRetentionDate(from: Date) {
    const configured = Number.parseInt(process.env.EXTENSION_PAYMENT_EVIDENCE_RETENTION_DAYS || "", 10);
    const days = Number.isInteger(configured) && configured >= 30 && configured <= 3650 ? configured : 2555;
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }

  async platformInstallations(input: { schoolId?: string; cursor?: string; limit?: string } = {}) {
    const limit = parsePageLimit(input.limit);
    const cursor = decodeDateIdCursor(input.cursor);
    const rows = await this.prisma.extensionInstallation.findMany({
      where: {
        ...(input.schoolId ? { schoolId: input.schoolId } : {}),
        ...(cursor ? { OR: [{ updatedAt: { lt: cursor.createdAt } }, { updatedAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      include: {
        school: true,
        extension: {
          include: {
            versions: {
              where: { lifecycleStatus: "PUBLISHED" },
              orderBy: { publishedAt: "desc" },
            },
          },
        },
        installedVersion: true,
        pilotFeedback: { orderBy: { updatedAt: "desc" } },
        paymentEvidence: {
          where: { status: "SUBMITTED" },
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            submittedAt: true,
            retainUntil: true,
            purgedAt: true,
            legalHold: true,
            legalHoldReason: true,
            legalHoldAt: true,
            legalHoldBy: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = dateIdPageBy(rows, limit, (row) => row.updatedAt);
    return this.withLastJob(page);
  }

  pilotAcceptanceCriteria() {
    return PILOT_ACCEPTANCE_CRITERIA;
  }

  async submitPilotFeedback(
    installationId: string,
    data: {
      outcome?: string;
      rating?: number;
      checklist?: Record<string, boolean>;
      comments?: string;
    },
    actor: Actor,
    source: "SCHOOL_ADMIN" | "OPERATOR",
  ) {
    const installation = await this.requireInstallationSummary(installationId);
    if (!installation.installedAt)
      throw new ConflictException(
        "Pilot feedback requires an installed extension",
      );
    if (!["ACCEPTED", "NEEDS_WORK", "BLOCKED"].includes(data.outcome || ""))
      throw new BadRequestException(
        "outcome must be ACCEPTED, NEEDS_WORK, or BLOCKED",
      );
    if (
      !Number.isInteger(data.rating) ||
      Number(data.rating) < 1 ||
      Number(data.rating) > 5
    )
      throw new BadRequestException("rating must be an integer from 1 to 5");
    const checklist = data.checklist || {};
    const unknown = Object.keys(checklist).filter(
      (key) =>
        !PILOT_ACCEPTANCE_CRITERIA.some((criterion) => criterion.key === key),
    );
    const missing = PILOT_ACCEPTANCE_CRITERIA.filter(
      (criterion) => typeof checklist[criterion.key] !== "boolean",
    );
    if (unknown.length || missing.length)
      throw new BadRequestException(
        "checklist must contain every published pilot acceptance criterion and no unknown keys",
      );
    if (
      data.outcome === "ACCEPTED" &&
      PILOT_ACCEPTANCE_CRITERIA.some(
        (criterion) => checklist[criterion.key] !== true,
      )
    ) {
      throw new BadRequestException(
        "Every acceptance criterion must pass before feedback can be ACCEPTED",
      );
    }
    const comments = data.comments?.trim();
    if (data.outcome !== "ACCEPTED" && !comments)
      throw new BadRequestException(
        "comments are required when pilot feedback is not accepted",
      );
    const feedback = await this.prisma.extensionPilotFeedback.upsert({
      where: { installationId_source: { installationId, source } },
      update: {
        outcome: data.outcome,
        rating: data.rating,
        checklist,
        comments: comments || null,
        actorId: actor.userId,
        actorRole: actor.role,
      },
      create: {
        installationId,
        schoolId: installation.schoolId,
        source,
        outcome: data.outcome!,
        rating: data.rating!,
        checklist,
        comments: comments || null,
        actorId: actor.userId,
        actorRole: actor.role,
      },
    });
    await this.log(
      actor,
      "PILOT_FEEDBACK",
      installation.id,
      installation.extension.name,
      {
        schoolId: installation.schoolId,
        extensionId: installation.extensionId,
        source,
        outcome: data.outcome,
        rating: data.rating,
      },
    );
    return feedback;
  }

  async approve(installationId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    if (!existing.requestedAt)
      throw new ConflictException("School has not requested this extension");
    const state = this.installationLifecycleState(existing);
    if (state === "APPROVED") return existing;
    if (!["REQUESTED", "PAYMENT_REVIEW"].includes(state))
      throw new ConflictException(`Extension cannot be approved from ${state}`);
    if (
      existing.extension.pricingModel &&
      existing.extension.pricingModel !== "FREE" &&
      existing.billingStatus !== "ACTIVE"
    )
      throw new ConflictException("Non-free extension billing must be approved first");
    if (
      ["ONE_TIME", "SUBSCRIPTION"].includes(existing.extension.pricingModel) &&
      !existing.paymentSubmittedAt
    ) throw new ConflictException("Payment evidence must be reviewed before approval");
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { approvedAt: new Date(), approvedBy: actor.userId, lifecycleState: "APPROVED" },
    });
    await this.log(actor, "APPROVE", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      fromState: state,
      toState: "APPROVED",
    });
    return updated;
  }

  async setBillingStatus(installationId: string, status: string, actor: Actor) {
    const allowed = ["PENDING", "ACTIVE", "OVERDUE", "CANCELLED"];
    if (!allowed.includes(status))
      throw new BadRequestException(`billingStatus must be one of ${allowed.join(", ")}`);
    const existing = await this.requireInstallation(installationId);
    if (existing.extension.pricingModel === "FREE")
      throw new ConflictException("Free extensions do not have a billing review");
    if (this.installationLifecycleState(existing) === "ACTIVE" && status !== "ACTIVE")
      throw new ConflictException("Deactivate the extension before changing active billing");
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { billingStatus: status },
    });
    await this.log(actor, "BILLING_STATUS", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      billingStatus: status,
      lifecycleState: this.installationLifecycleState(existing),
    });
    return updated;
  }

  async install(installationId: string, versionId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    if (this.installationLifecycleState(existing) === "INSTALLED" && existing.installedVersionId === versionId)
      return existing;
    if (this.installationLifecycleState(existing) !== "APPROVED")
      throw new ConflictException(
        "Extension request must be approved before installation",
      );
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: versionId,
        extensionId: existing.extensionId,
        lifecycleStatus: "PUBLISHED",
      },
      include: { assets: true, signingKey: true },
    });
    if (!version)
      throw new NotFoundException(
        "Published extension version not found for this extension",
      );
    if (existing.extension.runtimeType === "DECLARATIVE_MODULE")
      await this.assertDependencies(
        existing.schoolId,
        existing.extension.key,
        version,
      );
    if (existing.extension.runtimeType !== "CORE_MODULE")
      await this.signing.verifyPublished(version);
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: {
        installedVersionId: versionId,
        installedAt: new Date(),
        installedBy: actor.userId,
        lifecycleState: "INSTALLED",
        uninstalledAt: null,
        purgeAfter: null,
      },
    });
    await this.log(actor, "INSTALL", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      versionId,
      fromState: "APPROVED",
      toState: "INSTALLED",
    });
    return updated;
  }

  async upgrade(
    installationId: string,
    versionId: string,
    actor: Actor,
    acknowledgePermissions = false,
  ) {
    const existing = await this.requireInstallation(installationId);
    if (!existing.installedAt)
      throw new ConflictException(
        "Extension must be installed before it can be upgraded",
      );
    if (existing.installedVersionId === versionId) return existing;
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: versionId,
        extensionId: existing.extensionId,
        lifecycleStatus: "PUBLISHED",
      },
      include: { assets: true, signingKey: true },
    });
    if (!version)
      throw new NotFoundException(
        "Published upgrade version not found for this extension",
      );
    if (existing.extension.runtimeType === "DECLARATIVE_MODULE")
      await this.assertDependencies(
        existing.schoolId,
        existing.extension.key,
        version,
        installationId,
      );
    if (existing.extension.runtimeType !== "CORE_MODULE")
      await this.signing.verifyPublished(version);
    const permissionReview = this.permissionReview(
      existing.installedVersion,
      version,
    );
    if (permissionReview.added.length && !acknowledgePermissions) {
      throw new ConflictException(
        `Upgrade requests new permissions: ${permissionReview.added.join(", ")}`,
      );
    }
    let configuration =
      (existing.configuration as Record<string, any> | null) || {};
    if (existing.enabled && existing.extension.runtimeType === "THEME") {
      const current = await this.prisma.siteSetting.findUnique({
        where: { schoolId: existing.schoolId },
      });
      const schoolOverrides = this.themeOverrides(
        current,
        configuration.appliedTheme,
      );
      const appliedTheme = await this.applyThemeVersion(
        existing.schoolId,
        version,
        schoolOverrides,
      );
      configuration = {
        ...configuration,
        rollbackVersionId: existing.installedVersionId,
        activeThemeVersionId: version.id,
        schoolOverrides,
        appliedTheme,
      };
    }
    const migration =
      existing.extension.runtimeType === "DECLARATIVE_MODULE"
        ? this.findMigration(existing.installedVersion.version, version)
        : null;
    const updated = migration
      ? await this.applyMigration(
          existing,
          version,
          migration,
          actor,
          configuration,
        )
      : await this.prisma.extensionInstallation.update({
          where: { id: installationId },
          data: {
            installedVersionId: version.id,
            installedBy: actor.userId,
            installedAt: new Date(),
            configuration,
            availableVersionId: null,
            updateNotifiedAt: null,
          },
        });
    await this.log(actor, "UPGRADE", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      fromVersionId: existing.installedVersionId,
      toVersionId: version.id,
      permissionReview,
    });
    return updated;
  }

  async setUpdatePolicy(installationId: string, policy: string, actor: Actor) {
    if (!["MANUAL", "NOTIFY", "AUTO_APPROVED"].includes(policy)) {
      throw new BadRequestException(
        "Update policy must be MANUAL, NOTIFY, or AUTO_APPROVED",
      );
    }
    const existing = await this.requireInstallation(installationId);
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { updatePolicy: policy },
    });
    await this.log(
      actor,
      "UPDATE_POLICY",
      updated.id,
      existing.extension.name,
      {
        schoolId: existing.schoolId,
        extensionId: existing.extensionId,
        before: existing.updatePolicy,
        after: policy,
      },
    );
    return updated;
  }

  async removeUninstalled(installationId: string, actor: Actor) {
    const installation = await this.requireInstallation(installationId);
    if (!installation.uninstalledAt || installation.enabled)
      throw new ConflictException(
        "Only an uninstalled extension can be removed from school history",
      );
    const retainedEvidence = await this.prisma.extensionPaymentEvidence.count({
      where: { installationId, storageKey: { not: null } },
    });
    if (retainedEvidence)
      throw new ConflictException("Payment evidence must complete retention before installation history can be removed");
    const deleted = await this.prisma.$transaction(async (transaction) => {
      const records = await transaction.extensionRecord.deleteMany({
        where: {
          schoolId: installation.schoolId,
          extensionId: installation.extensionId,
        },
      });
      await transaction.extensionInstallation.delete({
        where: { id: installationId },
      });
      return { extensionRecords: records.count };
    });
    await this.log(actor, "REMOVE_HISTORY", installationId, installation.extension.name, {
      schoolId: installation.schoolId,
      extensionId: installation.extensionId,
    });
    return { removed: true, installationId, extensionRecords: deleted.extensionRecords };
  }

  async upgradeReview(installationId: string, versionId: string) {
    const existing = await this.requireInstallation(installationId);
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: versionId,
        extensionId: existing.extensionId,
        lifecycleStatus: "PUBLISHED",
      },
    });
    if (!version)
      throw new NotFoundException(
        "Published upgrade version not found for this extension",
      );
    return {
      installationId,
      fromVersion: existing.installedVersion.version,
      toVersion: version.version,
      permissions: this.permissionReview(existing.installedVersion, version),
      compatibilityRange: version.compatibilityRange,
    };
  }

  async dependencyReview(installationId: string, versionId: string) {
    const existing = await this.requireInstallation(installationId);
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: versionId,
        extensionId: existing.extensionId,
        lifecycleStatus: "PUBLISHED",
      },
    });
    if (!version)
      throw new NotFoundException(
        "Published extension version not found for this extension",
      );
    return this.resolveDependencies(
      existing.schoolId,
      existing.extension.key,
      version,
      installationId,
    );
  }

  async rollback(installationId: string, actor: Actor, targetVersionId?: string) {
    const existing = await this.requireInstallation(installationId);
    if (targetVersionId && existing.installedVersionId === targetVersionId) return existing;
    const configuration =
      (existing.configuration as Record<string, any> | null) || {};
    const rollbackVersionId = targetVersionId || configuration.rollbackVersionId;
    if (!rollbackVersionId)
      throw new ConflictException("No rollback version is available");
    const version = await this.prisma.extensionVersion.findFirst({
      where: {
        id: rollbackVersionId,
        extensionId: existing.extensionId,
        lifecycleStatus: { in: ["PUBLISHED", "DEPRECATED"] },
      },
      include: { assets: true, signingKey: true },
    });
    if (!version)
      throw new NotFoundException("Rollback version is unavailable or blocked");
    if (existing.extension.runtimeType !== "CORE_MODULE")
      await this.signing.verifyPublished(version);
    let updatedConfiguration: Record<string, any> = {
      ...configuration,
      rollbackVersionId: existing.installedVersionId,
      activeThemeVersionId: version.id,
    };
    if (existing.enabled && existing.extension.runtimeType === "THEME") {
      const appliedTheme = await this.applyThemeVersion(
        existing.schoolId,
        version,
        configuration.schoolOverrides || {},
      );
      updatedConfiguration = { ...updatedConfiguration, appliedTheme };
    }
    const updated =
      existing.extension.runtimeType === "DECLARATIVE_MODULE" &&
      configuration.migrationRunId
        ? await this.rollbackMigration(
            existing,
            version,
            configuration.migrationRunId,
            updatedConfiguration,
          )
        : await this.prisma.extensionInstallation.update({
            where: { id: installationId },
            data: {
              installedVersionId: version.id,
              configuration: updatedConfiguration,
            },
          });
    await this.log(actor, "ROLLBACK", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      fromVersionId: existing.installedVersionId,
      toVersionId: version.id,
    });
    return updated;
  }

  async activate(installationId: string, enabled: boolean, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    const state = this.installationLifecycleState(existing);
    if (enabled && state === "ACTIVE") return existing;
    if (!enabled && state === "INSTALLED") return existing;
    if (enabled && state !== "INSTALLED") {
      throw new ConflictException(
        "Extension must be approved and installed before activation",
      );
    }
    if (!enabled && state !== "ACTIVE")
      throw new ConflictException(`Extension cannot be deactivated from ${state}`);
    if (enabled && existing.installedVersion.lifecycleStatus !== "PUBLISHED") {
      throw new ConflictException(
        "Only a published extension version can be activated",
      );
    }
    if (
      enabled &&
      existing.extension.pricingModel &&
      existing.extension.pricingModel !== "FREE" &&
      existing.billingStatus !== "ACTIVE"
    ) {
      throw new ConflictException(
        "Paid extension billing must be active before activation",
      );
    }
    if (enabled && existing.extension.runtimeType === "DECLARATIVE_MODULE")
      await this.assertDependencies(
        existing.schoolId,
        existing.extension.key,
        existing.installedVersion,
        installationId,
      );
    if (enabled && existing.extension.runtimeType !== "CORE_MODULE")
      await this.signing.verifyPublished(existing.installedVersion);
    let configuration = existing.configuration as Record<string, any> | null;
    if (existing.extension.runtimeType === "THEME") {
      if (enabled) {
        const manifest = existing.installedVersion.manifest as Record<
          string,
          any
        >;
        const styleAsset = existing.installedVersion.assets.find(
          (asset) => asset.path.toLowerCase().split("/").pop() === "style.css",
        );
        const css = styleAsset
          ? (await this.storage.getPrivate(styleAsset.storageKey)).toString(
              "utf8",
            )
          : "";
        const current = await this.prisma.siteSetting.findUnique({
          where: { schoolId: existing.schoolId },
        });
        configuration = {
          ...(configuration || {}),
          previousTheme: current
            ? {
                mode: current.mode,
                primaryColor: current.primaryColor,
                secondaryColor: current.secondaryColor,
                font: current.font,
                radius: current.radius,
                customCss: current.customCss,
              }
            : null,
          activeThemeVersionId: existing.installedVersionId,
          appliedTheme: {
            mode: manifest.mode,
            primaryColor: manifest.tokens.primaryColor,
            secondaryColor: manifest.tokens.secondaryColor,
            font: manifest.tokens.font,
            radius: manifest.tokens.radius,
            customCss: css,
          },
          schoolOverrides: {},
        };
        await this.prisma.siteSetting.upsert({
          where: { schoolId: existing.schoolId },
          update: {
            mode: manifest.mode,
            primaryColor: manifest.tokens.primaryColor,
            secondaryColor: manifest.tokens.secondaryColor,
            font: manifest.tokens.font,
            radius: manifest.tokens.radius,
            customCss: css,
          },
          create: {
            schoolId: existing.schoolId,
            mode: manifest.mode,
            primaryColor: manifest.tokens.primaryColor,
            secondaryColor: manifest.tokens.secondaryColor,
            font: manifest.tokens.font,
            radius: manifest.tokens.radius,
            customCss: css,
          },
        });
      } else if (configuration?.previousTheme) {
        await this.prisma.siteSetting.update({
          where: { schoolId: existing.schoolId },
          data: configuration.previousTheme,
        });
      }
    }
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { enabled, configuration, lifecycleState: enabled ? "ACTIVE" : "INSTALLED" },
    });
    await this.log(
      actor,
      enabled ? "ACTIVATE" : "DEACTIVATE",
      updated.id,
      existing.extension.name,
      {
        schoolId: existing.schoolId,
        extensionId: existing.extensionId,
        fromState: state,
        toState: enabled ? "ACTIVE" : "INSTALLED",
      },
    );
    return updated;
  }

  async uninstall(installationId: string, actor: Actor) {
    const existing = await this.requireInstallation(installationId);
    const state = this.installationLifecycleState(existing);
    if (state === "UNINSTALLED") return existing;
    if (!["INSTALLED", "ACTIVE"].includes(state))
      throw new ConflictException(`Extension cannot be uninstalled from ${state}`);
    const installations =
      (await this.prisma.extensionInstallation.findMany({
        where: {
          schoolId: existing.schoolId,
          enabled: true,
          id: { not: installationId },
        },
        include: { extension: true, installedVersion: true },
      })) || [];
    const dependents = installations.filter((installation) =>
      (
        ((installation.installedVersion.manifest as Record<string, any>)
          ?.dependencies || []) as Array<{ key: string; optional: boolean }>
      ).some(
        (dependency) =>
          dependency.key === existing.extension.key && !dependency.optional,
      ),
    );
    if (dependents.length)
      throw new ConflictException(
        `Cannot uninstall while required by: ${dependents.map((installation) => installation.extension.name).join(", ")}`,
      );
    const configuration = existing.configuration as Record<string, any> | null;
    if (
      existing.enabled &&
      existing.extension.runtimeType === "THEME" &&
      configuration?.previousTheme
    ) {
      await this.prisma.siteSetting.update({
        where: { schoolId: existing.schoolId },
        data: configuration.previousTheme,
      });
    }
    const uninstalledAt = new Date();
    const purgeAfter = new Date(
      uninstalledAt.getTime() + this.uninstallGraceDays() * 24 * 60 * 60 * 1000,
    );
    const updated = await this.prisma.extensionInstallation.update({
      where: { id: installationId },
      data: { enabled: false, uninstalledAt, purgeAfter, lifecycleState: "UNINSTALLED" },
    });
    await this.log(actor, "UNINSTALL", updated.id, existing.extension.name, {
      schoolId: existing.schoolId,
      extensionId: existing.extensionId,
      purgeAfter: purgeAfter.toISOString(),
      fromState: state,
      toState: "UNINSTALLED",
    });
    return updated;
  }

  private uninstallGraceDays() {
    const parsed = Number.parseInt(process.env.EXTENSION_UNINSTALL_GRACE_DAYS || "", 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650 ? parsed : 30;
  }

  private async requireInstallation(id: string) {
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id },
      include: {
        extension: true,
        installedVersion: { include: { assets: true, signingKey: true } },
      },
    });
    if (!installation)
      throw new NotFoundException("Extension installation not found");
    return installation;
  }

  private installationLifecycleState(installation: {
    lifecycleState?: string | null;
    enabled?: boolean;
    paymentSubmittedAt?: Date | null;
    approvedAt?: Date | null;
    installedAt?: Date | null;
    uninstalledAt?: Date | null;
  }) {
    if (installation.lifecycleState) return installation.lifecycleState;
    if (installation.uninstalledAt) return "UNINSTALLED";
    if (installation.enabled) return "ACTIVE";
    if (installation.installedAt) return "INSTALLED";
    if (installation.approvedAt) return "APPROVED";
    if (installation.paymentSubmittedAt) return "PAYMENT_REVIEW";
    return "REQUESTED";
  }

  private async requireInstallationSummary(id: string) {
    const installation = await this.prisma.extensionInstallation.findUnique({
      where: { id },
      include: {
        extension: true,
        installedVersion: true,
      },
    });
    if (!installation)
      throw new NotFoundException("Extension installation not found");
    return installation;
  }

  private permissionReview(
    currentVersion: { manifest: unknown },
    targetVersion: { manifest: unknown },
  ) {
    const current = ((currentVersion.manifest as Record<string, any>)
      ?.permissions || []) as string[];
    const target = ((targetVersion.manifest as Record<string, any>)
      ?.permissions || []) as string[];
    return {
      requested: target,
      added: target.filter((permission) => !current.includes(permission)),
      removed: current.filter((permission) => !target.includes(permission)),
    };
  }

  private async assertDependencies(
    schoolId: string,
    extensionKey: string,
    version: { version: string; manifest: unknown },
    excludedInstallationId?: string,
  ) {
    const review = await this.resolveDependencies(
      schoolId,
      extensionKey,
      version,
      excludedInstallationId,
    );
    const missing = review.dependencies.filter(
      (dependency) => !dependency.optional && dependency.status !== "SATISFIED",
    );
    if (missing.length)
      throw new ConflictException(
        `Required extensions are unavailable: ${missing.map((dependency) => `${dependency.key} (${dependency.status})`).join(", ")}`,
      );
    if (review.conflicts.length)
      throw new ConflictException(
        `Conflicting extensions are active: ${review.conflicts.join(", ")}`,
      );
  }

  private async resolveDependencies(
    schoolId: string,
    extensionKey: string,
    version: { version: string; manifest: unknown },
    excludedInstallationId?: string,
  ) {
    const manifest = (version.manifest as Record<string, any>) || {};
    const dependencies = (manifest.dependencies || []) as Array<{
      key: string;
      versionRange?: string;
      optional: boolean;
    }>;
    const declaredConflicts = new Set<string>(
      (manifest.conflicts || []) as string[],
    );
    const installations =
      (await this.prisma.extensionInstallation.findMany({
        where: {
          schoolId,
          enabled: true,
          ...(excludedInstallationId
            ? { id: { not: excludedInstallationId } }
            : {}),
        },
        include: { extension: true, installedVersion: true },
      })) || [];
    const active = new Map(
      installations.map((installation) => [
        installation.extension.key,
        installation,
      ]),
    );
    const resolved = dependencies.map((dependency) => {
      const installation = active.get(dependency.key);
      const status = !installation
        ? "MISSING"
        : dependency.versionRange &&
            !this.versionMatches(
              installation.installedVersion.version,
              dependency.versionRange,
            )
          ? "INCOMPATIBLE"
          : "SATISFIED";
      return {
        ...dependency,
        status,
        installedVersion: installation?.installedVersion.version || null,
      };
    });
    const conflicts = installations
      .filter((installation) => {
        const reverse = (
          ((installation.installedVersion.manifest as Record<string, any>)
            ?.conflicts || []) as string[]
        ).includes(extensionKey);
        return declaredConflicts.has(installation.extension.key) || reverse;
      })
      .map((installation) => installation.extension.key);
    return {
      extensionKey,
      version: version.version,
      dependencies: resolved,
      conflicts,
    };
  }

  private versionMatches(version: string, range: string) {
    const current = version.split("-")[0].split(".").map(Number);
    return range.split(/\s+/).every((comparator) => {
      const operator = comparator.match(/^(>=|>|<=|<)/)?.[1];
      const target = comparator
        .replace(/^(>=|>|<=|<)/, "")
        .split(".")
        .map(Number);
      const comparison =
        current[0] - target[0] ||
        current[1] - target[1] ||
        current[2] - target[2];
      return operator === ">="
        ? comparison >= 0
        : operator === ">"
          ? comparison > 0
          : operator === "<="
            ? comparison <= 0
            : comparison < 0;
    });
  }

  private findMigration(
    fromVersion: string,
    targetVersion: { version: string; manifest: unknown },
  ) {
    const migrations = ((targetVersion.manifest as Record<string, any>)
      ?.migrations || []) as Array<{
      fromVersion: string;
      toVersion: string;
      operations: any[];
    }>;
    return (
      migrations.find(
        (migration) =>
          migration.fromVersion === fromVersion &&
          migration.toVersion === targetVersion.version,
      ) || null
    );
  }

  private async applyMigration(
    existing: any,
    version: any,
    migration: { operations: any[] },
    actor: Actor,
    configuration: Record<string, any>,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const resources = [
          ...new Set(
            migration.operations.map((operation) => operation.resource),
          ),
        ] as string[];
        const records = await transaction.extensionRecord.findMany({
          where: {
            schoolId: existing.schoolId,
            extensionId: existing.extensionId,
            resource: { in: resources },
          },
        });
        const run = await transaction.extensionMigrationRun.create({
          data: {
            installationId: existing.id,
            schoolId: existing.schoolId,
            extensionId: existing.extensionId,
            fromVersionId: existing.installedVersionId,
            toVersionId: version.id,
            operations: migration.operations as Prisma.InputJsonValue,
          },
        });
        let byteDelta = 0;
        for (const record of records) {
          const original = record.data as Record<string, unknown>;
          const migrated = { ...original };
          for (const operation of migration.operations.filter(
            (candidate) => candidate.resource === record.resource,
          )) {
            if (
              operation.type === "renameField" &&
              Object.prototype.hasOwnProperty.call(migrated, operation.from)
            ) {
              if (Object.prototype.hasOwnProperty.call(migrated, operation.to))
                throw new ConflictException(
                  `Migration target field already exists: ${operation.to}`,
                );
              migrated[operation.to] = migrated[operation.from];
              delete migrated[operation.from];
            } else if (
              operation.type === "setDefault" &&
              !Object.prototype.hasOwnProperty.call(migrated, operation.field)
            ) {
              migrated[operation.field] = operation.value;
            } else if (operation.type === "removeField") {
              delete migrated[operation.field];
            }
          }
          const byteSize = Buffer.byteLength(JSON.stringify(migrated), "utf8");
          byteDelta += byteSize - record.byteSize;
          await transaction.extensionMigrationBackup.create({
            data: {
              migrationRunId: run.id,
              recordId: record.id,
              resource: record.resource,
              data: original as Prisma.InputJsonValue,
              byteSize: record.byteSize,
            },
          });
          await transaction.extensionRecord.update({
            where: { id: record.id },
            data: {
              data: migrated as Prisma.InputJsonValue,
              byteSize,
              updatedBy: actor.userId,
            },
          });
        }
        return transaction.extensionInstallation.update({
          where: { id: existing.id },
          data: {
            installedVersionId: version.id,
            installedBy: actor.userId,
            installedAt: new Date(),
            configuration: {
              ...configuration,
              rollbackVersionId: existing.installedVersionId,
              migrationRunId: run.id,
            },
            dataBytes: { increment: byteDelta },
            availableVersionId: null,
            updateNotifiedAt: null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async rollbackMigration(
    existing: any,
    version: any,
    migrationRunId: string,
    configuration: Record<string, any>,
  ) {
    return this.prisma.$transaction(
      async (transaction) => {
        const run = await transaction.extensionMigrationRun.findUnique({
          where: { id: migrationRunId },
          include: { backups: true },
        });
        if (
          !run ||
          run.status !== "APPLIED" ||
          run.installationId !== existing.id ||
          run.toVersionId !== existing.installedVersionId ||
          run.fromVersionId !== version.id
        ) {
          throw new ConflictException(
            "Declarative migration rollback state is invalid",
          );
        }
        let byteDelta = 0;
        for (const backup of run.backups) {
          const record = await transaction.extensionRecord.findUnique({
            where: { id: backup.recordId },
          });
          if (!record)
            throw new ConflictException(
              `Cannot roll back deleted migrated record ${backup.recordId}`,
            );
          byteDelta += backup.byteSize - record.byteSize;
          await transaction.extensionRecord.update({
            where: { id: backup.recordId },
            data: { data: backup.data, byteSize: backup.byteSize },
          });
        }
        const { migrationRunId: ignored, ...rest } = configuration;
        const updated = await transaction.extensionInstallation.update({
          where: { id: existing.id },
          data: {
            installedVersionId: version.id,
            configuration: rest,
            dataBytes: { increment: byteDelta },
          },
        });
        await transaction.extensionMigrationRun.update({
          where: { id: run.id },
          data: { status: "ROLLED_BACK", rolledBackAt: new Date() },
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async applyThemeVersion(
    schoolId: string,
    version: {
      manifest: any;
      assets: Array<{ path: string; storageKey: string }>;
    },
    overrides: Record<string, unknown> = {},
  ) {
    const manifest = version.manifest as Record<string, any>;
    const styleAsset = version.assets.find(
      (asset) => asset.path.toLowerCase().split("/").pop() === "style.css",
    );
    const customCss = styleAsset
      ? (await this.storage.getPrivate(styleAsset.storageKey)).toString("utf8")
      : "";
    const appliedTheme = {
      mode: manifest.mode,
      primaryColor: manifest.tokens.primaryColor,
      secondaryColor: manifest.tokens.secondaryColor,
      font: manifest.tokens.font,
      radius: manifest.tokens.radius,
      customCss,
    };
    const merged = { ...appliedTheme, ...overrides };
    await this.prisma.siteSetting.upsert({
      where: { schoolId },
      update: merged,
      create: { schoolId, ...merged },
    });
    return appliedTheme;
  }

  private themeOverrides(
    current: Record<string, any> | null,
    appliedTheme: Record<string, any> | null | undefined,
  ) {
    if (!current || !appliedTheme) return {};
    const overrides: Record<string, unknown> = {};
    for (const key of [
      "mode",
      "primaryColor",
      "secondaryColor",
      "font",
      "radius",
      "customCss",
    ]) {
      if (current[key] !== appliedTheme[key]) overrides[key] = current[key];
    }
    return overrides;
  }

  private log(
    actor: Actor,
    action: string,
    resourceId: string,
    resourceLabel: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.log({
      actorId: actor.userId,
      actorRole: actor.role,
      actorName: actor.name,
      actorEmail: actor.email,
      action,
      resource: "EXTENSION_INSTALLATION",
      resourceId,
      resourceLabel,
      metadata,
    });
  }
}
