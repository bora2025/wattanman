import { Injectable, Logger } from '@nestjs/common';

const RAILWAY_GRAPHQL_URL = 'https://backboard.railway.app/graphql/v2';

/**
 * Provisions/deregisters a Railway-hosted `<subdomain>.up.railway.app`
 * domain on the frontend service for a school. This deployment has no
 * wildcard DNS (see Phase 18 of the conversion plan) — every school needs an
 * explicit Railway domain registered before TenantHostMiddleware's
 * Host-header lookup can ever resolve it, otherwise Railway's edge 404s the
 * request before it reaches the app at all.
 *
 * Railway's public API has no "create with a custom name" mutation — the
 * two-step create-then-rename sequence below (and the exact field names,
 * notably `serviceDomainId` rather than `id` on the update input) was
 * confirmed by live testing against the real Railway API + GraphQL schema
 * introspection, not from documentation alone.
 *
 * Soft-fails everywhere (never throws) — a Railway API hiccup must not block
 * school creation/deletion, which are otherwise complete, working
 * operations on their own.
 */
@Injectable()
export class RailwayDomainService {
  private readonly logger = new Logger(RailwayDomainService.name);
  private readonly token = process.env.RAILWAY_API_TOKEN;
  private readonly environmentId = process.env.RAILWAY_ENVIRONMENT_ID;
  private readonly serviceId = process.env.RAILWAY_FRONTEND_SERVICE_ID;
  private readonly targetPort = 8080;

  private get configured(): boolean {
    return !!(this.token && this.environmentId && this.serviceId);
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    // Railway Project API Tokens (Project Settings -> Tokens) authenticate
    // via a distinct `Project-Access-Token` header, not `Authorization:
    // Bearer` — that header is only for personal account tokens. Confirmed
    // live: using Bearer with a project token returns a generic "Not
    // Authorized" with no other indication of what's wrong.
    const res = await fetch(RAILWAY_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Project-Access-Token': this.token as string, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json: any = await res.json();
    if (json.errors?.length) {
      throw new Error(json.errors.map((e: any) => e.message).join('; '));
    }
    return json.data as T;
  }

  private async findExistingDomain(targetDomain: string): Promise<{ id: string; domain: string } | undefined> {
    const data = await this.graphql<{ serviceInstance: { domains: { serviceDomains: { id: string; domain: string }[] } } }>(
      'query($serviceId: String!, $environmentId: String!) { serviceInstance(serviceId: $serviceId, environmentId: $environmentId) { domains { serviceDomains { id domain } } } }',
      { serviceId: this.serviceId, environmentId: this.environmentId },
    );
    return data.serviceInstance.domains.serviceDomains.find((d) => d.domain === targetDomain);
  }

  /** Registers `<subdomain>.up.railway.app` pointed at the frontend service.
   * Never throws — callers should treat a `{ ok: false }` result as "school
   * creation still succeeded, but flag this for the platform admin." Safe to
   * call more than once for the same subdomain (e.g. a platform admin
   * clicking "retry" on an already-working school) — checks for an existing
   * match first rather than creating a stray duplicate domain. */
  async provisionDomain(subdomain: string): Promise<{ ok: true; domain: string } | { ok: false; reason: string }> {
    if (!this.configured) {
      this.logger.warn('Railway domain automation is not configured — skipping domain provisioning.');
      return { ok: false, reason: 'Domain automation is not configured on this deployment' };
    }
    const desiredDomain = `${subdomain}.up.railway.app`;
    try {
      const existing = await this.findExistingDomain(desiredDomain);
      if (existing) {
        return { ok: true, domain: desiredDomain };
      }
      const created = await this.graphql<{ serviceDomainCreate: { id: string } }>(
        'mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { id } }',
        { input: { environmentId: this.environmentId, serviceId: this.serviceId, targetPort: this.targetPort } },
      );
      const serviceDomainId = created.serviceDomainCreate.id;
      await this.graphql<{ serviceDomainUpdate: boolean }>(
        'mutation($input: ServiceDomainUpdateInput!) { serviceDomainUpdate(input: $input) }',
        {
          input: {
            serviceDomainId,
            environmentId: this.environmentId,
            serviceId: this.serviceId,
            domain: desiredDomain,
            targetPort: this.targetPort,
          },
        },
      );
      return { ok: true, domain: desiredDomain };
    } catch (err: any) {
      this.logger.error(`Failed to provision domain for subdomain "${subdomain}": ${err.message}`);
      return { ok: false, reason: err.message || 'Unknown error provisioning domain' };
    }
  }

  /** Removes the Railway domain matching this subdomain, if one exists —
   * best-effort cleanup on school deletion so a stale DNS entry doesn't
   * linger (subdomain-takeover prevention, Phase 2a-iii). Silently no-ops if
   * automation isn't configured or no matching domain is found. */
  async deregisterDomain(subdomain: string): Promise<void> {
    if (!this.configured) return;
    const targetDomain = `${subdomain}.up.railway.app`;
    try {
      const match = await this.findExistingDomain(targetDomain);
      if (!match) {
        this.logger.warn(`No Railway domain matching "${targetDomain}" found to deregister — skipping.`);
        return;
      }
      await this.graphql<{ serviceDomainDelete: boolean }>('mutation($id: String!) { serviceDomainDelete(id: $id) }', { id: match.id });
    } catch (err: any) {
      this.logger.error(`Failed to deregister domain for subdomain "${subdomain}": ${err.message}`);
    }
  }
}
