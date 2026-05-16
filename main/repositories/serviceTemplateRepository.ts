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
  list(
    db: AppDb,
    tenantId: number,
    filter: ServiceTemplateFilter = {},
  ): ServiceTemplateRow[] {
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
      .orderBy(asc(serviceTemplates.displayOrder), asc(serviceTemplates.name))
      .all();
  },

  findById(
    db: AppDb,
    tenantId: number,
    id: string,
  ): ServiceTemplateRow | undefined {
    return db
      .select()
      .from(serviceTemplates)
      .where(
        and(eq(serviceTemplates.tenantId, tenantId), eq(serviceTemplates.id, id)),
      )
      .get();
  },

  findByNameAndType(
    db: AppDb,
    tenantId: number,
    name: string,
    bikeTypeId: string,
  ): ServiceTemplateRow | undefined {
    return db
      .select()
      .from(serviceTemplates)
      .where(
        and(
          eq(serviceTemplates.tenantId, tenantId),
          eq(serviceTemplates.name, name),
          eq(serviceTemplates.bikeTypeId, bikeTypeId),
        ),
      )
      .get();
  },

  insert(db: AppDb, row: ServiceTemplateInsert): ServiceTemplateRow {
    return db.insert(serviceTemplates).values(row).returning().get();
  },

  update(
    db: AppDb,
    tenantId: number,
    id: string,
    patch: Partial<ServiceTemplateInsert>,
  ): ServiceTemplateRow | undefined {
    return db
      .update(serviceTemplates)
      .set(patch)
      .where(
        and(eq(serviceTemplates.tenantId, tenantId), eq(serviceTemplates.id, id)),
      )
      .returning()
      .get();
  },
};
