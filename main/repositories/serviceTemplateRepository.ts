import { and, asc, eq, like } from 'drizzle-orm';
import type { AppDb } from '../db/client';
import {
  serviceTemplates,
  type ServiceTemplateRow,
  type ServiceTemplateInsert,
} from '../db/schema';

export type ServiceTemplateFilter = {
  search?: string;
  bikeTypeId?: string;
  includeInactive?: boolean;
};

export const serviceTemplateRepository = {
  async list(
    db: AppDb,
    tenantId: number,
    filter: ServiceTemplateFilter = {},
  ): Promise<ServiceTemplateRow[]> {
    const conditions = [eq(serviceTemplates.tenantId, tenantId)];
    if (!filter.includeInactive)
      conditions.push(eq(serviceTemplates.isActive, true));
    if (filter.bikeTypeId)
      conditions.push(eq(serviceTemplates.bikeTypeId, filter.bikeTypeId));
    if (filter.search) {
      conditions.push(like(serviceTemplates.name, `%${filter.search.toLowerCase()}%`));
    }
    return db
      .select()
      .from(serviceTemplates)
      .where(and(...conditions))
      .orderBy(asc(serviceTemplates.displayOrder), asc(serviceTemplates.name));
  },

  async findById(
    db: AppDb,
    tenantId: number,
    id: string,
  ): Promise<ServiceTemplateRow | undefined> {
    const rows = await db
      .select()
      .from(serviceTemplates)
      .where(and(eq(serviceTemplates.tenantId, tenantId), eq(serviceTemplates.id, id)));
    return rows[0];
  },

  async findByNameAndType(
    db: AppDb,
    tenantId: number,
    name: string,
    bikeTypeId: string,
  ): Promise<ServiceTemplateRow | undefined> {
    const rows = await db
      .select()
      .from(serviceTemplates)
      .where(
        and(
          eq(serviceTemplates.tenantId, tenantId),
          eq(serviceTemplates.name, name),
          eq(serviceTemplates.bikeTypeId, bikeTypeId),
        ),
      );
    return rows[0];
  },

  async insert(db: AppDb, row: ServiceTemplateInsert): Promise<ServiceTemplateRow> {
    const [inserted] = await db.insert(serviceTemplates).values(row).returning();
    if (!inserted) throw new Error('service template insert returned no row');
    return inserted;
  },

  async update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<ServiceTemplateInsert>,
  ): Promise<ServiceTemplateRow | undefined> {
    const [updated] = await db
      .update(serviceTemplates)
      .set(patch)
      .where(and(eq(serviceTemplates.tenantId, tenantId), eq(serviceTemplates.id, id)))
      .returning();
    return updated;
  },
};
