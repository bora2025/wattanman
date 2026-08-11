import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "crypto";
import { ExtensionsService } from "./extensions.service";

describe("ExtensionsService", () => {
  const prisma = {
    extension: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    extensionPublisher: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    extensionPublisherMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    extensionCatalogCollection: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    extensionCatalogCollectionItem: { deleteMany: jest.fn(), createMany: jest.fn() },
    extensionReview: { create: jest.fn(), findMany: jest.fn() },
    extensionSigningKey: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findFirst: jest.fn() },
    extensionVersion: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    extensionValidation: {
      create: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    extensionInstallation: { updateMany: jest.fn(), deleteMany: jest.fn() },
    extensionDependency: { deleteMany: jest.fn() },
    extensionVisibilityGrant: { upsert: jest.fn(), deleteMany: jest.fn() },
    school: { findUnique: jest.fn() },
    extensionAsset: { upsert: jest.fn() },
    extensionAlert: { updateMany: jest.fn() },
    auditLog: { groupBy: jest.fn() },
    $transaction: jest.fn((callback: any) => callback(prisma)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const storage = {
    putPrivate: jest.fn().mockResolvedValue(undefined),
    getPrivate: jest.fn(),
    deletePrivate: jest.fn().mockResolvedValue(undefined),
  };
  const packageValidator = { validate: jest.fn() };
  const signing = {
    signForPublication: jest.fn(),
    validatePublicKey: jest.fn(),
    normalizePublicKey: jest.fn((value) => value),
  };
  const queues = { enqueue: jest.fn().mockResolvedValue({ id: "job-1" }) };
  const service = new ExtensionsService(
    prisma as any,
    audit as any,
    storage as any,
    packageValidator as any,
    signing as any,
    queues as any,
  );
  const actor = { userId: "platform-admin", role: "PLATFORM_ADMIN" };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.extensionPublisherMember.findUnique.mockResolvedValue({
      status: "ACTIVE",
      roles: ["UPLOAD", "REVIEW", "PUBLISH", "MANAGE"],
    });
    signing.signForPublication.mockResolvedValue({
      signingKeyId: "key-1",
      packageSignature: "signature",
      signedAt: new Date(),
    });
  });

  it("creates an internal declarative extension", async () => {
    prisma.extensionPublisher.upsert.mockResolvedValue({
      id: "publisher-1",
      status: "ACTIVE",
    });
    prisma.extension.findUnique.mockResolvedValue(null);
    prisma.extension.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: "ext-1", ...data }),
    );

    const result = await service.createExtension(
      {
        key: "STUDENT_REWARDS",
        name: "Student Rewards",
        runtimeType: "DECLARATIVE_MODULE",
        commercialType: "ADDON",
      },
      actor,
    );

    expect(result.publisher).toBe("WATTAMAN");
    expect(prisma.extension.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publisherId: "publisher-1",
        category: "OTHER",
        tags: [],
        locales: ["en"],
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "EXTENSION", action: "CREATE" }),
    );
  });

  it("updates audited catalog metadata", async () => {
    prisma.extension.findUnique.mockResolvedValue({
      id: "ext-1",
      name: "Student Rewards",
      publisherId: "publisher-1",
      description: null,
      category: "OTHER",
      tags: [],
      locales: ["en"],
      supportUrl: null,
      privacyPolicyUrl: null,
      dataUse: {},
    });
    prisma.extension.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "ext-1", ...data }),
    );

    const result = await service.updateCatalogMetadata("ext-1", {
      description: "Reward classroom progress.",
      category: "ACADEMICS",
      tags: ["rewards"],
      locales: ["en", "km-KH"],
      supportUrl: "https://support.example.com/rewards",
      privacyPolicyUrl: "https://example.com/privacy",
      dataUse: {
        collectsPersonalData: true,
        dataCategories: ["ACADEMIC"],
        purposes: ["CORE_FUNCTIONALITY"],
        sharesWithThirdParties: false,
        retentionDays: 365,
      },
    }, actor);

    expect(result.category).toBe("ACADEMICS");
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: "CATALOG_METADATA_UPDATE",
    }));
  });

  it("onboards an external publisher suspended pending verification", async () => {
    prisma.extensionPublisher.findUnique.mockResolvedValue(null);
    prisma.extensionPublisher.create.mockResolvedValue({
      id: "publisher-external",
      key: "KHMER_EDTECH",
      name: "Khmer EdTech",
      internal: false,
      status: "SUSPENDED",
      verificationStatus: "PENDING",
    });

    const result = await service.onboardPublisher({
      key: "KHMER_EDTECH",
      name: "Khmer EdTech",
      legalName: "Khmer EdTech Co., Ltd.",
      contactEmail: "publisher@example.com",
      websiteUrl: "https://example.com",
      countryCode: "KH",
    }, actor);

    expect(result.verificationStatus).toBe("PENDING");
    expect(prisma.extensionPublisherMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publisherId: "publisher-external",
        roles: ["UPLOAD", "PUBLISH", "MANAGE"],
      }),
    });
  });

  it("verifies an external publisher with required notes", async () => {
    prisma.extensionPublisherMember.findUnique.mockResolvedValueOnce(null);
    prisma.extensionPublisher.findUnique.mockResolvedValue({
      id: "publisher-external",
      name: "Khmer EdTech",
      internal: false,
      status: "SUSPENDED",
      verificationStatus: "PENDING",
    });
    prisma.extensionPublisher.update.mockImplementation(({ data }) => Promise.resolve({ id: "publisher-external", ...data }));

    const result = await service.verifyPublisher("publisher-external", {
      decision: "VERIFIED",
      notes: "Legal identity and domain verified",
    }, actor);

    expect(result.status).toBe("ACTIVE");
    expect(result.verificationStatus).toBe("VERIFIED");
  });

  it("adds a publisher member by platform-admin email", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "admin-2", name: "Second Admin", role: "PLATFORM_ADMIN" });
    prisma.extensionPublisherMember.findUnique
      .mockResolvedValueOnce({ status: "ACTIVE", roles: ["MANAGE"] })
      .mockResolvedValueOnce({ status: "ACTIVE", roles: ["MANAGE"] })
      .mockResolvedValueOnce(null);
    prisma.extensionPublisherMember.upsert.mockResolvedValue({ id: "member-2", userId: "admin-2", roles: ["UPLOAD"] });

    const result = await service.addPublisherMemberByEmail(
      "publisher-1",
      "second@example.com",
      ["UPLOAD"],
      actor,
    );

    expect(result.userId).toBe("admin-2");
  });

  it("prevents suspending the publisher's last active manager", async () => {
    prisma.extensionPublisherMember.findUnique
      .mockResolvedValueOnce({ status: "ACTIVE", roles: ["MANAGE"] })
      .mockResolvedValueOnce({ id: "member-1", userId: "platform-admin", status: "ACTIVE", roles: ["MANAGE"] });
    prisma.extensionPublisherMember.findMany.mockResolvedValue([{ roles: ["UPLOAD"] }]);

    await expect(service.setPublisherMemberStatus(
      "publisher-1",
      "platform-admin",
      "SUSPENDED",
      actor,
    )).rejects.toThrow("at least one active manager");
  });

  it("rejects executable extensions during the declarative-only release", async () => {
    await expect(
      service.createExtension(
        {
          key: "SERVER_CODE",
          name: "Server Code",
          runtimeType: "CODE_EXTENSION",
          commercialType: "ADDON",
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("requires review notes before approval", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      lifecycleStatus: "AWAITING_REVIEW",
      extension: { publisherId: "publisher-1" },
    });

    await expect(
      service.transition("version-1", "APPROVED", undefined, actor),
    ).rejects.toThrow("reviewNotes are required");
  });

  it("rejects lifecycle transitions that skip validation and review", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      lifecycleStatus: "UPLOADED",
      extension: { publisherId: "publisher-1" },
    });

    await expect(
      service.transition("version-1", "PUBLISHED", "ship it", actor),
    ).rejects.toThrow(ConflictException);
  });

  it("prevents published versions from being edited", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      lifecycleStatus: "PUBLISHED",
    });

    await expect(
      service.updateDraft("version-1", { releaseNotes: "changed" }, actor),
    ).rejects.toThrow("immutable");
  });

  it("publishes only from approved and records publication time", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      extensionId: "ext-1",
      version: "1.0.0",
      lifecycleStatus: "APPROVED",
      packageStorageKey: "quarantine/extensions/ext-1/version-1/checksum.zip",
      packageChecksum: "checksum",
      extension: { publisherEntity: { status: "ACTIVE" } },
    });
    prisma.extensionVersion.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "version-1", version: "1.0.0", ...data }),
    );
    storage.getPrivate.mockResolvedValue(Buffer.from("package"));

    await service.transition("version-1", "PUBLISHED", undefined, actor);

    expect(storage.getPrivate).toHaveBeenCalledWith(
      "quarantine/extensions/ext-1/version-1/checksum.zip",
    );
    expect(storage.putPrivate).toHaveBeenCalledWith(
      "published/extensions/ext-1/version-1/checksum.zip",
      Buffer.from("package"),
      "application/zip",
    );
    expect(prisma.extensionVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: "PUBLISHED",
          publishedAt: expect.any(Date),
          packageStorageKey:
            "published/extensions/ext-1/version-1/checksum.zip",
          signingKeyId: "key-1",
          packageSignature: "signature",
          signedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.extension.update).toHaveBeenCalledWith({
      where: { id: "ext-1" },
      data: { isListed: true, visibility: "LISTED", status: "ACTIVE" },
    });
    expect(storage.deletePrivate).toHaveBeenCalledWith(
      "quarantine/extensions/ext-1/version-1/checksum.zip",
    );
  });

  it("treats retrying a completed lifecycle transition as idempotent", async () => {
    const published = {
      id: "version-1",
      version: "1.0.0",
      lifecycleStatus: "PUBLISHED",
      packageStorageKey: "published/package.zip",
    };
    prisma.extensionVersion.findUnique.mockResolvedValue(published);

    const result = await service.transition(
      "version-1",
      "PUBLISHED",
      undefined,
      actor,
    );

    expect(result).toBe(published);
    expect(prisma.extensionVersion.update).not.toHaveBeenCalled();
    expect(storage.getPrivate).not.toHaveBeenCalled();
  });

  it("reports permission changes against the latest published version", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-2",
      version: "2.0.0",
      compatibilityRange: ">=1.0.0",
      manifest: { permissions: ["rewards:read", "rewards:write"] },
      extension: {
        versions: [
          {
            id: "version-1",
            version: "1.0.0",
            manifest: { permissions: ["rewards:read", "reports:read"] },
          },
        ],
      },
    });

    const result = await service.reviewSummary("version-2");

    expect(result.permissions.added).toEqual(["rewards:write"]);
    expect(result.permissions.removed).toEqual(["reports:read"]);
    expect(result.previousVersion).toBe("1.0.0");
    expect(result.platformCompatible).toBe(true);
  });

  it("requires release notes and compatibility before review", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      lifecycleStatus: "VALIDATED",
      releaseNotes: null,
      compatibilityRange: null,
      extension: { publisherId: "publisher-1" },
    });
    await expect(
      service.transition("version-1", "AWAITING_REVIEW", undefined, actor),
    ).rejects.toThrow("Release notes");
  });

  it("controls private extension visibility and school grants", async () => {
    prisma.extension.findUnique.mockResolvedValue({
      id: "ext-1",
      name: "Rewards",
      publisherId: "publisher-1",
      visibility: "LISTED",
    });
    prisma.extension.update.mockResolvedValue({
      id: "ext-1",
      visibility: "PRIVATE",
      isListed: false,
    });
    await expect(
      service.setVisibility("ext-1", "PRIVATE", actor),
    ).resolves.toEqual(expect.objectContaining({ visibility: "PRIVATE" }));
    expect(prisma.extension.update).toHaveBeenCalledWith({
      where: { id: "ext-1" },
      data: { visibility: "PRIVATE", isListed: false },
    });

    prisma.school.findUnique.mockResolvedValue({
      id: "school-1",
      name: "School One",
    });
    await service.grantPrivateAccess("ext-1", "school-1", true, actor);
    expect(prisma.extensionVisibilityGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          extensionId_schoolId: { extensionId: "ext-1", schoolId: "school-1" },
        },
      }),
    );
  });

  it("deactivates every installation of an emergency-blocked version", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      extensionId: "ext-1",
      version: "1.0.0",
      lifecycleStatus: "PUBLISHED",
      extension: { publisherId: "publisher-1" },
    });
    prisma.extensionVersion.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "version-1", version: "1.0.0", ...data }),
    );

    await service.transition(
      "version-1",
      "BLOCKED",
      "security response",
      actor,
    );

    expect(prisma.extensionInstallation.updateMany).toHaveBeenCalledWith({
      where: { installedVersionId: "version-1", enabled: true },
      data: { enabled: false },
    });
  });

  it("returns validated theme preview CSS from private storage", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      lifecycleStatus: "VALIDATED",
      manifest: { mode: "dark" },
      extension: { runtimeType: "THEME" },
      assets: [{ path: "style.css", storageKey: "validated/style.css" }],
    });
    storage.getPrivate.mockResolvedValue(Buffer.from(".card { color: teal; }"));

    const result = await service.themePreview("version-1");

    expect(result.css).toBe(".card { color: teal; }");
    expect(storage.getPrivate).toHaveBeenCalledWith("validated/style.css");
  });

  it("uploads a package to a checksum-addressed quarantine key", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      extensionId: "ext-1",
      version: "1.0.0",
      lifecycleStatus: "UPLOADED",
      extension: {
        key: "TEST_THEME",
        runtimeType: "THEME",
        publisherEntity: { status: "ACTIVE" },
      },
      manifest: {},
    });
    prisma.extensionVersion.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "version-1", version: "1.0.0", ...data }),
    );
    const buffer = Buffer.from("zip-content");
    const file = {
      originalname: "extension.zip",
      buffer,
      size: buffer.length,
    } as Express.Multer.File;

    const result = await service.uploadPackage("version-1", file, actor);

    expect(storage.putPrivate).toHaveBeenCalledWith(
      expect.stringMatching(
        /^quarantine\/extensions\/ext-1\/version-1\/[a-f0-9]{64}\.zip$/,
      ),
      buffer,
      "application/zip",
    );
    expect(result.lifecycleStatus).toBe("QUARANTINED");
    expect(prisma.extensionValidation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "PENDING" }) }),
    );
    expect(queues.enqueue).toHaveBeenCalledWith("extensions", expect.objectContaining({
      type: "extension.package.complete",
      idempotencyKey: expect.stringMatching(/^extension-package:version-1:[a-f0-9]{64}$/),
    }));
    expect(packageValidator.validate).not.toHaveBeenCalled();
  });

  it("completes quarantined package validation asynchronously", async () => {
    const buffer = Buffer.from("zip-content");
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const validationId = createHash("sha256").update(`extension-upload:version-1:${checksum}`).digest("hex");
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1", extensionId: "ext-1", version: "1.0.0", lifecycleStatus: "QUARANTINED",
      packageChecksum: checksum, packageStorageKey: `quarantine/extensions/ext-1/version-1/${checksum}.zip`,
      manifest: {}, extension: { key: "TEST_THEME", runtimeType: "THEME" },
    });
    prisma.extensionValidation.findUnique.mockResolvedValue({ id: validationId, extensionVersionId: "version-1", status: "PENDING" });
    prisma.extensionVersion.update.mockImplementation(({ data }) => Promise.resolve({ id: "version-1", version: "1.0.0", ...data }));
    storage.getPrivate.mockResolvedValue(buffer);
    packageValidator.validate.mockResolvedValue({
      valid: true, manifest: { key: "TEST_THEME" }, errors: [], warnings: [],
      files: [{ path: "theme.json", size: 2, checksum: "asset-checksum", mimeType: "application/json", contents: Buffer.from("{}") }],
    });

    const result = await service.completePackageUpload({ versionId: "version-1", checksum, validationId }, actor);

    expect(result.lifecycleStatus).toBe("VALIDATED");
    expect(storage.getPrivate).toHaveBeenCalledWith(`quarantine/extensions/ext-1/version-1/${checksum}.zip`);
    expect(storage.putPrivate).toHaveBeenCalledWith("validated/extensions/ext-1/version-1/asset-checksum/theme.json", Buffer.from("{}"), "application/json");
    expect(prisma.extensionValidation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PASSED" }) }));
  });

  it("keeps a version retryable when quarantine storage fails", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      extensionId: "ext-1",
      version: "1.0.0",
      lifecycleStatus: "UPLOADED",
      extension: {
        key: "TEST_THEME",
        runtimeType: "THEME",
        publisherId: "publisher-1",
        publisherEntity: { status: "ACTIVE" },
      },
    });
    storage.putPrivate.mockRejectedValueOnce(new Error("R2 unavailable"));
    const buffer = Buffer.from("zip-content");

    await expect(
      service.uploadPackage(
        "version-1",
        {
          originalname: "extension.zip",
          buffer,
          size: buffer.length,
        } as Express.Multer.File,
        actor,
      ),
    ).rejects.toThrow("R2 unavailable");

    expect(prisma.extensionVersion.update).not.toHaveBeenCalled();
    expect(prisma.extensionValidation.upsert).not.toHaveBeenCalled();
    expect(packageValidator.validate).not.toHaveBeenCalled();
  });

  it("persists a failed report and rejects the version when validation times out", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      extensionId: "ext-1",
      version: "1.0.0",
      lifecycleStatus: "QUARANTINED",
      packageChecksum: createHash("sha256").update(Buffer.from("zip-content")).digest("hex"),
      packageStorageKey: "quarantine/extensions/ext-1/version-1/package.zip",
      manifest: {},
      extension: {
        key: "TEST_THEME",
        runtimeType: "THEME",
      },
    });
    prisma.extensionVersion.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "version-1", version: "1.0.0", ...data }),
    );
    const checksum = createHash("sha256").update(Buffer.from("zip-content")).digest("hex");
    const validationId = createHash("sha256").update(`extension-upload:version-1:${checksum}`).digest("hex");
    prisma.extensionValidation.findUnique.mockResolvedValue({ id: validationId, extensionVersionId: "version-1", status: "PENDING" });
    storage.getPrivate.mockResolvedValue(Buffer.from("zip-content"));
    packageValidator.validate.mockResolvedValue({
      valid: false,
      errors: [
        {
          code: "VALIDATION_TIMEOUT",
          message: "Package validation exceeded 100ms",
        },
      ],
      warnings: [],
      files: [],
    });
    const buffer = Buffer.from("zip-content");

    const result = await service.completePackageUpload({ versionId: "version-1", checksum, validationId }, actor);

    expect(result.lifecycleStatus).toBe("REJECTED");
    expect(prisma.extensionValidation.update).toHaveBeenCalledWith({
      where: { id: validationId },
      data: expect.objectContaining({
        status: "FAILED",
        errors: [expect.objectContaining({ code: "VALIDATION_TIMEOUT" })],
        completedAt: expect.any(Date),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VALIDATION_FAILED" }),
    );
  });

  it("treats retrying the same quarantined package as idempotent", async () => {
    const buffer = Buffer.from("zip-content");
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const existing = {
      id: "version-1",
      extensionId: "ext-1",
      version: "1.0.0",
      lifecycleStatus: "QUARANTINED",
      packageChecksum: checksum,
      packageStorageKey: `quarantine/extensions/ext-1/version-1/${checksum}.zip`,
      extension: { publisherEntity: { status: "ACTIVE" } },
    };
    prisma.extensionVersion.findUnique.mockResolvedValue(existing);

    const result = await service.uploadPackage(
      "version-1",
      {
        originalname: "extension.zip",
        buffer,
        size: buffer.length,
      } as Express.Multer.File,
      actor,
    );

    expect(result).toBe(existing);
    expect(storage.putPrivate).not.toHaveBeenCalled();
    expect(prisma.extensionValidation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: expect.stringMatching(/^[a-f0-9]{64}$/) },
      create: expect.objectContaining({ status: "PENDING" }),
    }));
    expect(queues.enqueue).toHaveBeenCalledTimes(1);
  });

  it("re-enqueues a persisted upload after a transient queue failure", async () => {
    const buffer = Buffer.from("zip-content");
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const uploaded = {
      id: "version-1", extensionId: "ext-1", version: "1.0.0", lifecycleStatus: "QUARANTINED",
      packageChecksum: checksum, packageStorageKey: `quarantine/extensions/ext-1/version-1/${checksum}.zip`,
      extension: { publisherId: "publisher-1", publisherEntity: { status: "ACTIVE" } },
    };
    prisma.extensionVersion.findUnique.mockResolvedValue(uploaded);
    queues.enqueue.mockRejectedValueOnce(new Error("Redis unavailable")).mockResolvedValueOnce({ id: "job-1" });
    const file = { originalname: "extension.zip", buffer, size: buffer.length } as Express.Multer.File;

    await expect(service.uploadPackage("version-1", file, actor)).rejects.toThrow("Redis unavailable");
    await expect(service.uploadPackage("version-1", file, actor)).resolves.toBe(uploaded);

    expect(storage.putPrivate).not.toHaveBeenCalled();
    expect(queues.enqueue).toHaveBeenCalledTimes(2);
    expect(queues.enqueue.mock.calls[0][1].idempotencyKey).toBe(queues.enqueue.mock.calls[1][1].idempotencyKey);
  });

  it("suspends a publisher, unlists its catalog, and disables active installations", async () => {
    prisma.extensionPublisher.findUnique.mockResolvedValue({
      id: "publisher-1",
      name: "Wattaman",
      status: "ACTIVE",
    });
    prisma.extensionPublisher.update.mockResolvedValue({
      id: "publisher-1",
      name: "Wattaman",
      status: "SUSPENDED",
    });

    const result = await service.setPublisherStatus(
      "publisher-1",
      "SUSPENDED",
      actor,
    );

    expect(result.status).toBe("SUSPENDED");
    expect(prisma.extension.updateMany).toHaveBeenCalledWith({
      where: { publisherId: "publisher-1" },
      data: { status: "SUSPENDED", isListed: false },
    });
    expect(prisma.extensionInstallation.updateMany).toHaveBeenCalledWith({
      where: { extension: { publisherId: "publisher-1" }, enabled: true },
      data: { enabled: false },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "EXTENSION_PUBLISHER" }),
    );
  });

  it("rejects lifecycle actions without the required publisher permission", async () => {
    prisma.extensionPublisherMember.findUnique.mockResolvedValue({
      status: "ACTIVE",
      roles: ["UPLOAD"],
    });
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      version: "1.0.0",
      lifecycleStatus: "AWAITING_REVIEW",
      extension: { publisherId: "publisher-1" },
    });

    await expect(
      service.transition("version-1", "APPROVED", "reviewed", actor),
    ).rejects.toThrow("review permission is required");
    expect(prisma.extensionVersion.update).not.toHaveBeenCalled();
  });

  it("appends review decisions and supports an audited rejection appeal", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValueOnce({
      id: "version-1",
      version: "1.0.0",
      lifecycleStatus: "AWAITING_REVIEW",
      extension: { publisherId: "publisher-1" },
    });
    prisma.extensionVersion.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "version-1", version: "1.0.0", ...data }),
    );

    await service.transition(
      "version-1",
      "REJECTED",
      "Clarify permissions",
      actor,
    );
    expect(prisma.extensionReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        extensionVersionId: "version-1",
        action: "REJECTED",
        notes: "Clarify permissions",
      }),
    });

    prisma.extensionVersion.findUnique.mockResolvedValueOnce({
      id: "version-1",
      version: "1.0.0",
      lifecycleStatus: "REJECTED",
      reviewedBy: "reviewer-1",
      extension: {
        publisherId: "publisher-1",
        publisherEntity: { status: "ACTIVE" },
      },
    });
    await service.appeal("version-1", "Permission description updated", actor);
    expect(prisma.extensionReview.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        extensionVersionId: "version-1",
        action: "APPEALED",
        notes: "Permission description updated",
      }),
    });
  });

  it("deletes an uninstalled rejected version and its private storage objects", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-rejected",
      extensionId: "extension-1",
      version: "1.0.0",
      lifecycleStatus: "REJECTED",
      packageStorageKey: "quarantine/package.zip",
      assets: [{ storageKey: "assets/theme.css" }],
      installations: [],
      extension: {
        publisherId: "publisher-1",
        publisherEntity: { status: "ACTIVE" },
      },
    });

    await expect(
      service.deleteVersion("version-rejected", actor),
    ).resolves.toEqual({
      deleted: true,
      versionId: "version-rejected",
      storageObjects: 2,
    });
    expect(storage.deletePrivate).toHaveBeenCalledTimes(2);
    expect(prisma.extensionAlert.updateMany).toHaveBeenCalledWith({
      where: { versionId: "version-rejected" },
      data: { versionId: null },
    });
    expect(prisma.extensionVersion.delete).toHaveBeenCalledWith({
      where: { id: "version-rejected" },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        resource: "EXTENSION_VERSION",
      }),
    );
  });

  it("refuses to delete non-rejected or installed extension versions", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValueOnce({
      id: "version-published",
      version: "1.0.0",
      lifecycleStatus: "PUBLISHED",
      assets: [],
      installations: [],
      extension: {
        publisherId: "publisher-1",
        publisherEntity: { status: "ACTIVE" },
      },
    });
    await expect(
      service.deleteVersion("version-published", actor),
    ).rejects.toThrow(
      "Only uploaded drafts, validated drafts, or rejected extension versions can be deleted",
    );

    prisma.extensionVersion.findUnique.mockResolvedValueOnce({
      id: "version-installed",
      version: "1.0.0",
      lifecycleStatus: "REJECTED",
      assets: [],
      installations: [{ id: "installation-1" }],
      extension: {
        publisherId: "publisher-1",
        publisherEntity: { status: "ACTIVE" },
      },
    });
    await expect(
      service.deleteVersion("version-installed", actor),
    ).rejects.toThrow("installation history cannot be deleted");
    expect(prisma.extensionVersion.delete).not.toHaveBeenCalled();
  });

  it("deletes an empty extension but preserves any extension with history", async () => {
    prisma.extension.findUnique.mockResolvedValueOnce({
      id: "extension-empty",
      key: "EMPTY",
      name: "Empty",
      runtimeType: "DECLARATIVE_MODULE",
      publisherId: "publisher-1",
      versions: [],
      installations: [],
      _count: { records: 0 },
    });
    await expect(
      service.deleteExtension("extension-empty", actor),
    ).resolves.toEqual({
      deleted: true,
      extensionId: "extension-empty",
      versions: 0,
      installations: 0,
      records: 0,
      storageObjects: 0,
    });
    expect(prisma.extension.delete).toHaveBeenCalledWith({
      where: { id: "extension-empty" },
    });

    prisma.extension.findUnique.mockResolvedValueOnce({
      id: "extension-installed",
      key: "INSTALLED",
      name: "Installed",
      runtimeType: "DECLARATIVE_MODULE",
      publisherId: "publisher-1",
      versions: [
        {
          id: "version-1",
          version: "1.0.0",
          lifecycleStatus: "PUBLISHED",
          packageStorageKey: null,
          assets: [],
        },
      ],
      installations: [
        {
          id: "installation-1",
          schoolId: "school-1",
          enabled: false,
          installedAt: new Date(),
          uninstalledAt: null,
        },
      ],
      _count: { records: 0 },
    });
    await expect(
      service.deleteExtension("extension-installed", actor),
    ).rejects.toThrow("Uninstall this extension from every school");
  });

  it("purges releases, storage, records, and fully uninstalled history", async () => {
    prisma.extension.findUnique.mockResolvedValueOnce({
      id: "extension-purge",
      key: "PURGE",
      name: "Purge",
      runtimeType: "THEME",
      publisherId: "publisher-1",
      versions: [
        {
          id: "version-1",
          version: "1.0.0",
          lifecycleStatus: "DEPRECATED",
          packageStorageKey: "packages/one.zip",
          assets: [{ storageKey: "assets/one.css" }],
        },
      ],
      installations: [
        {
          id: "installation-1",
          schoolId: "school-1",
          enabled: false,
          installedAt: new Date(),
          uninstalledAt: new Date(),
        },
      ],
      _count: { records: 4 },
    });

    await expect(
      service.deleteExtension("extension-purge", actor),
    ).resolves.toEqual({
      deleted: true,
      extensionId: "extension-purge",
      versions: 1,
      installations: 1,
      records: 4,
      storageObjects: 2,
    });
    expect(storage.deletePrivate).toHaveBeenCalledTimes(2);
    expect(prisma.extensionAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { extensionId: null, versionId: null } }),
    );
    expect(prisma.extensionDependency.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { extensionId: "extension-purge" },
          { requiredExtensionId: "extension-purge" },
        ],
      },
    });
    expect(prisma.extensionInstallation.deleteMany).toHaveBeenCalledWith({
      where: { extensionId: "extension-purge" },
    });
    expect(prisma.extension.delete).toHaveBeenCalledWith({
      where: { id: "extension-purge" },
    });
  });

  it("reports version adoption, validation failures, storage, and lifecycle activity", async () => {
    prisma.extension.findMany.mockResolvedValue([
      {
        id: "ext-1",
        key: "REWARDS",
        name: "Rewards",
        publisherEntity: { key: "WATTAMAN", status: "ACTIVE" },
        records: [
          {
            byteSize: 40,
            school: { id: "school-a", name: "School A", subdomain: "a" },
          },
        ],
        versions: [
          {
            id: "version-1",
            version: "1.0.0",
            lifecycleStatus: "PUBLISHED",
            publishedAt: new Date(),
            packageSize: 100,
            assets: [{ size: 25 }],
            validations: [{ status: "PASSED" }, { status: "FAILED" }],
            installations: [
              {
                enabled: true,
                school: { id: "school-a", name: "School A", subdomain: "a" },
              },
              {
                enabled: false,
                school: { id: "school-b", name: "School B", subdomain: "b" },
              },
            ],
          },
        ],
      },
    ]);
    prisma.auditLog.groupBy.mockResolvedValue([
      { action: "INSTALL", _count: { _all: 2 } },
    ]);

    const result = await service.health();

    expect(result.totals).toEqual({
      extensions: 1,
      versions: 1,
      activeInstallations: 1,
      storageBytes: 125,
      recordBytes: 40,
      failedValidations: 1,
    });
    expect(result.lifecycleActions).toEqual({ INSTALL: 2 });
    expect(result.versions[0].adoption.schools).toHaveLength(2);
    expect(result.schoolUsage).toEqual([
      expect.objectContaining({
        school: expect.objectContaining({ id: "school-a" }),
        recordBytes: 40,
        quotaBytes: 104857600,
      }),
    ]);
  });

  it("revokes a signing key and blocks every affected version and installation", async () => {
    prisma.extensionSigningKey.findUnique.mockResolvedValue({
      id: "key-1",
      keyId: "wattaman-2026",
      publisherId: "publisher-1",
      status: "ACTIVE",
    });
    prisma.extensionSigningKey.update.mockResolvedValue({
      id: "key-1",
      keyId: "wattaman-2026",
      publisherId: "publisher-1",
      status: "REVOKED",
    });
    prisma.extensionVersion.updateMany.mockResolvedValue({ count: 2 });

    await service.setSigningKeyStatus("key-1", "REVOKED", actor);

    expect(prisma.extensionVersion.updateMany).toHaveBeenCalledWith({
      where: {
        signingKeyId: "key-1",
        lifecycleStatus: { in: ["PUBLISHED", "DEPRECATED"] },
      },
      data: { lifecycleStatus: "BLOCKED" },
    });
    expect(prisma.extensionInstallation.updateMany).toHaveBeenCalledWith({
      where: { installedVersion: { signingKeyId: "key-1" }, enabled: true },
      data: { enabled: false },
    });
  });

  it("starts signing-key rotation with an overlapping active key", async () => {
    prisma.extensionSigningKey.findUnique
      .mockResolvedValueOnce({ id: "old-key", keyId: "wattaman-old", publisherId: "publisher-1", status: "ACTIVE" })
      .mockResolvedValueOnce(null);
    prisma.extensionSigningKey.findFirst.mockResolvedValue(null);
    prisma.extensionSigningKey.create.mockResolvedValue({ id: "new-key", keyId: "wattaman-new", publisherId: "publisher-1", status: "ACTIVE" });
    signing.normalizePublicKey.mockReturnValue("-----BEGIN PUBLIC KEY-----\nvalid\n-----END PUBLIC KEY-----");

    const result = await service.rotateSigningKey("publisher-1", "old-key", {
      newKeyId: "wattaman-new",
      publicKeyPem: "public key",
    }, actor);

    expect(result.currentKey.status).toBe("ACTIVE");
    expect(result.newKey.status).toBe("ACTIVE");
    expect(result.nextStep).toContain("EXTENSION_SIGNING_KEY_ID");
  });

  it("creates an audited draft catalog collection with ordered extensions", async () => {
    prisma.extensionCatalogCollection.findUnique.mockResolvedValue(null);
    prisma.extension.findMany.mockResolvedValue([{ id: "ext-1" }, { id: "ext-2" }]);
    prisma.extensionCatalogCollection.create.mockResolvedValue({
      id: "collection-1", title: "Back to school", status: "DRAFT", items: [],
    });
    const result = await service.createCatalogCollection({
      slug: "back-to-school",
      title: "Back to school",
      extensionIds: ["ext-1", "ext-2"],
    }, actor);
    expect(result.status).toBe("DRAFT");
    expect(prisma.extensionCatalogCollection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ items: { create: [
        { extensionId: "ext-1", position: 0 },
        { extensionId: "ext-2", position: 1 },
      ] } }),
    }));
  });

  it("refuses to publish an empty catalog collection", async () => {
    prisma.extensionCatalogCollection.findUnique.mockResolvedValue({
      id: "collection-1", title: "Empty", status: "DRAFT", items: [],
    });
    await expect(service.updateCatalogCollection("collection-1", { status: "PUBLISHED" }, actor))
      .rejects.toThrow("must contain at least one extension");
  });

  it("refuses to retire the signing key still configured for publication", async () => {
    process.env.EXTENSION_SIGNING_KEY_ID = "wattaman-current";
    prisma.extensionSigningKey.findUnique.mockResolvedValue({
      id: "key-current",
      keyId: "wattaman-current",
      publisherId: "publisher-1",
      status: "ACTIVE",
    });
    try {
      await expect(service.setSigningKeyStatus("key-current", "RETIRED", actor))
        .rejects.toThrow("switch the signing environment");
    } finally {
      delete process.env.EXTENSION_SIGNING_KEY_ID;
    }
  });

  it("rejects publication when required dependencies are unavailable", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-1",
      extensionId: "ext-1",
      version: "1.0.0",
      lifecycleStatus: "APPROVED",
      packageStorageKey: "quarantine/package.zip",
      packageChecksum: "checksum",
      manifest: { dependencies: [{ key: "MISSING_MODULE", optional: false }] },
      extension: {
        key: "REPORTS_PLUS",
        publisherId: "publisher-1",
        runtimeType: "DECLARATIVE_MODULE",
        publisherEntity: { status: "ACTIVE" },
      },
    });
    prisma.extension.findMany.mockResolvedValue([]);

    await expect(
      service.transition("version-1", "PUBLISHED", undefined, actor),
    ).rejects.toThrow("MISSING_MODULE");
    expect(signing.signForPublication).not.toHaveBeenCalled();
  });

  it("detects dependency cycles before publication", async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: "version-a",
      extensionId: "ext-a",
      version: "1.0.0",
      lifecycleStatus: "APPROVED",
      packageStorageKey: "quarantine/package.zip",
      packageChecksum: "checksum",
      manifest: { dependencies: [{ key: "MODULE_B", optional: false }] },
      extension: {
        key: "MODULE_A",
        publisherId: "publisher-1",
        runtimeType: "DECLARATIVE_MODULE",
        publisherEntity: { status: "ACTIVE" },
      },
    });
    prisma.extension.findMany.mockResolvedValue([
      {
        id: "ext-b",
        key: "MODULE_B",
        versions: [
          {
            version: "1.0.0",
            manifest: { dependencies: [{ key: "MODULE_A", optional: false }] },
          },
        ],
      },
    ]);

    await expect(
      service.transition("version-a", "PUBLISHED", undefined, actor),
    ).rejects.toThrow("cycle");
  });
});
