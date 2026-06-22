import type { AppDb } from '../db/client';
import { newId } from '../lib/ids';
import { bikeRepository } from '../repositories/bikeRepository';
import { ingredientRepository } from '../repositories/ingredientRepository';
import { recipeRepository } from '../repositories/recipeRepository';
import { serviceEventLineRepository } from '../repositories/serviceEventLineRepository';
import { serviceEventRepository } from '../repositories/serviceEventRepository';
import { serviceTemplateRepository } from '../repositories/serviceTemplateRepository';
import { stockMovementRepository } from '../repositories/stockMovementRepository';
import { InventoryService } from './InventoryService';
import type {
  CancelServiceEventInput,
  CreateAdHocServiceEventInput,
  CreateServiceEventInput,
  ListServiceEventsInput,
  ServiceEvent,
  ServiceEventLine,
  ServiceEventLineInput,
  ServiceEventLineWithCost,
  ServiceEventWithCost,
  ServiceEventWithLines,
  SetServiceEventStatusInput,
  UpdateServiceEventInput,
  UpdateServiceEventLinesInput,
} from '@shared/schemas/serviceEvent';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@shared/errors/DomainError';
import { SYSTEM_USER_ID } from '@shared/constants/system';
import { toBase } from '@shared/utils/unitConverter';

function toEvent(
  row: Awaited<ReturnType<typeof serviceEventRepository.findById>>,
): ServiceEvent {
  if (!row) throw new Error('toEvent called with empty row');
  return row as unknown as ServiceEvent;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Stock-relevant identity of a line: which part, how much, in what unit. */
function lineKey(l: { ingredientId: string; quantity: number; unit: string }): string {
  return `${l.ingredientId}|${l.quantity}|${l.unit}`;
}

/**
 * True when two line sets are the same multiset of (part, quantity, unit) —
 * used by `update` to decide whether stock actually needs re-reconciling. If
 * the parts are untouched (only odometer/notes/date changed) we leave the
 * existing lines and their consumption movements in place.
 */
function sameLineSet(
  a: ReadonlyArray<{ ingredientId: string; quantity: number; unit: string }>,
  b: ReadonlyArray<{ ingredientId: string; quantity: number; unit: string }>,
): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const l of a) counts.set(lineKey(l), (counts.get(lineKey(l)) ?? 0) + 1);
  for (const l of b) {
    const k = lineKey(l);
    const c = counts.get(k);
    if (!c) return false;
    counts.set(k, c - 1);
  }
  return true;
}

export const ServiceService = {
  async list(db: AppDb, tenantId: number, filter: ListServiceEventsInput): Promise<ServiceEvent[]> {
    const rows = await serviceEventRepository.list(db, tenantId, filter);
    return rows.map((r) => r as unknown as ServiceEvent);
  },

  async get(db: AppDb, tenantId: number, id: string): Promise<ServiceEventWithLines> {
    const row = await serviceEventRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('ServiceEvent', id);
    const lines = await serviceEventLineRepository.listForEvent(db, id);
    return {
      ...(row as unknown as ServiceEvent),
      lines: lines as unknown as ServiceEventLine[],
    };
  },

  /**
   * Like `list`, but each event carries its parts lines and the actual parts
   * cost — used by the section list pages and per-bike history. Cost comes from
   * the immutable `cost_per_unit_at_time` snapshot on each consumption movement
   * (service_consumed minus any service_reversal, clamped at 0), so it reflects
   * what was really spent rather than today's average cost.
   */
  async listWithLines(
    db: AppDb,
    tenantId: number,
    filter: ListServiceEventsInput,
  ): Promise<ServiceEventWithCost[]> {
    const events = await serviceEventRepository.list(db, tenantId, filter);
    const lineRows = await serviceEventLineRepository.listForEvents(
      db,
      events.map((e) => e.id),
    );

    // Net snapshot cost per line id, from its consumption / reversal movements.
    const movements = await stockMovementRepository.listByReferenceIds(
      db,
      tenantId,
      'service_event_line',
      lineRows.map((l) => l.id),
    );
    const costByLine = new Map<string, number>();
    for (const m of movements) {
      if (!m.referenceId) continue;
      if (m.reason !== 'service_consumed' && m.reason !== 'service_reversal') continue;
      const cost = (m.costPerUnitAtTime ?? 0) * Math.abs(m.changeQuantity);
      const signed = m.reason === 'service_consumed' ? cost : -cost;
      costByLine.set(m.referenceId, (costByLine.get(m.referenceId) ?? 0) + signed);
    }

    const byEvent = new Map<string, ServiceEventLineWithCost[]>();
    for (const l of lineRows) {
      const arr = byEvent.get(l.serviceEventId) ?? [];
      arr.push({
        ...(l as unknown as ServiceEventLine),
        cost: round2(Math.max(0, costByLine.get(l.id) ?? 0)),
      });
      byEvent.set(l.serviceEventId, arr);
    }
    for (const arr of byEvent.values()) {
      arr.sort((a, b) => a.displayOrder - b.displayOrder);
    }

    return events.map((e) => {
      const lines = byEvent.get(e.id) ?? [];
      const partsCost = round2(lines.reduce((acc, l) => acc + l.cost, 0));
      return {
        ...(e as unknown as ServiceEvent),
        lines,
        partsCost,
      };
    });
  },

  /**
   * Start a new service event for one bike. Captures the active recipe version
   * for the chosen template (Path A snapshot) and copies its rows into
   * service_event_lines so the operator can tweak quantities per-event before
   * completing.
   */
  async create(
    db: AppDb,
    tenantId: number,
    input: CreateServiceEventInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<ServiceEventWithLines> {
    const bike = await bikeRepository.findById(db, tenantId, input.bikeId);
    if (!bike) throw new NotFoundError('Bike', input.bikeId);

    const template = await serviceTemplateRepository.findById(
      db,
      tenantId,
      input.serviceTemplateId,
    );
    if (!template) throw new NotFoundError('ServiceTemplate', input.serviceTemplateId);

    if (template.bikeTypeId !== bike.bikeTypeId) {
      throw new ValidationError(
        `Service template "${template.name}" is for a different bike model — pick a template that matches this bike's type`,
      );
    }

    const recipe = await recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId: template.id,
      parentType: 'service_template',
    });
    if (!recipe) {
      throw new ValidationError(
        `Service template "${template.name}" has no active recipe — add parts to the template before starting a service`,
      );
    }

    const recipeRows = await recipeRepository.ingredientsForVersion(db, recipe.id);
    if (recipeRows.length === 0) {
      throw new ValidationError(
        `Service template "${template.name}" has an active version but no parts — add at least one part row before starting a service`,
      );
    }

    return db.transaction(async (tx) => {
      const now = Date.now();
      const event = await serviceEventRepository.insert(tx, {
        id: newId(),
        tenantId,
        bikeId: input.bikeId,
        kind: 'service',
        serviceTemplateId: template.id,
        serviceTemplateVersionId: recipe.id,
        status: 'in_progress',
        startedAt: now,
        completedAt: null,
        cancelledAt: null,
        cancelledPartsUsed: null,
        odometerKm: input.odometerKm ?? null,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      });

      const lines = await serviceEventLineRepository.insertMany(
        tx,
        recipeRows.map((row, idx) => ({
          id: newId(),
          serviceEventId: event.id,
          ingredientId: row.childIngredientId,
          quantity: row.quantity,
          unit: row.unit,
          notes: row.notes ?? null,
          displayOrder: row.displayOrder || idx,
        })),
      );

      return {
        ...(event as unknown as ServiceEvent),
        lines: lines as unknown as ServiceEventLine[],
      };
    });
  },

  /**
   * One-shot maintenance create. Drives the three section pages:
   *   service / repair → lines come from the operator's selection.
   *   wash             → no parts: zero lines, no stock movements.
   * `status` (default 'completed') sets the workflow state at creation:
   *   'requested' / 'in_progress' record the (planned) parts but DO NOT touch
   *     stock — deduction is deferred until the event is marked completed.
   *   'completed' deducts every line's stock via InventoryService.applyMovement
   *     in the same transaction; if any line fails the whole thing rolls back.
   * `kind` defaults to 'service' when omitted so legacy callers keep working.
   */
  async createAdHoc(
    db: AppDb,
    tenantId: number,
    input: CreateAdHocServiceEventInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<ServiceEventWithLines> {
    const bike = await bikeRepository.findById(db, tenantId, input.bikeId);
    if (!bike) throw new NotFoundError('Bike', input.bikeId);

    const kind = input.kind ?? 'service';
    const status = input.status ?? 'completed';
    const inputLines = input.lines ?? [];

    if (kind === 'wash') {
      if (inputLines.length > 0) {
        throw new ValidationError('A wash event cannot consume parts');
      }
    } else if (inputLines.length === 0) {
      throw new ValidationError(
        `Tick at least one part for this ${kind}`,
      );
    }

    // Validate every line up-front so we don't half-write an event then fail
    // on the third applyMovement call.
    for (const line of inputLines) {
      const ing = await ingredientRepository.findById(db, tenantId, line.ingredientId);
      if (!ing) throw new NotFoundError('Ingredient', line.ingredientId);
      toBase(line.quantity, line.unit, ing.baseUnit, {
        densityGPerMl: ing.densityGPerMl ?? undefined,
      });
    }

    return db.transaction(async (tx) => {
      const now = Date.now();
      // Domain date of the maintenance — backdated when the operator logs a
      // past record, else now. Audit columns (created/updated) always reflect
      // when the row was actually entered.
      const occurredAt = input.occurredAt ?? now;
      const event = await serviceEventRepository.insert(tx, {
        id: newId(),
        tenantId,
        bikeId: input.bikeId,
        kind,
        serviceTemplateId: null,
        serviceTemplateVersionId: null,
        status,
        startedAt: occurredAt,
        completedAt: status === 'completed' ? occurredAt : null,
        cancelledAt: null,
        cancelledPartsUsed: null,
        odometerKm: input.odometerKm ?? null,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        updatedBy: actorId,
      });

      const lines =
        inputLines.length === 0
          ? []
          : await serviceEventLineRepository.insertMany(
              tx,
              inputLines.map((line, idx) => ({
                id: newId(),
                serviceEventId: event.id,
                ingredientId: line.ingredientId,
                quantity: line.quantity,
                unit: line.unit,
                notes: line.notes ?? null,
                displayOrder: idx,
              })),
            );

      // Stock only moves when the event is created already completed.
      if (status === 'completed') {
        for (const line of lines) {
          await InventoryService.applyMovement(
            tx,
            tenantId,
            {
              ingredientId: line.ingredientId,
              quantity: line.quantity,
              unit: line.unit,
              reason: 'service_consumed',
              referenceType: 'service_event_line',
              referenceId: line.id,
              direction: -1,
            },
            actorId,
            { skipAvailabilityRecompute: true },
          );
        }
      }

      return {
        ...(event as unknown as ServiceEvent),
        lines: lines as unknown as ServiceEventLine[],
      };
    });
  },

  /**
   * Move an event through the workflow (requested → in_progress → completed).
   * Reaching 'completed' deducts every line's stock (service/repair); a wash
   * just flips to completed with no movements. Moving a completed event back is
   * refused — cancel it instead. Cancelled events are terminal.
   */
  async setStatus(
    db: AppDb,
    tenantId: number,
    input: SetServiceEventStatusInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<ServiceEventWithLines> {
    const existing = await serviceEventRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('ServiceEvent', input.id);
    if (existing.status === input.status) {
      return ServiceService.get(db, tenantId, input.id);
    }
    if (existing.status === 'cancelled') {
      throw new ConflictError('A cancelled event is terminal — its status cannot change');
    }

    if (input.status === 'completed') {
      const lines = await serviceEventLineRepository.listForEvent(db, input.id);
      if (existing.kind !== 'wash' && lines.length === 0) {
        throw new ValidationError(
          'Add at least one part before completing this event',
        );
      }
      await db.transaction(async (tx) => {
        for (const line of lines) {
          await InventoryService.applyMovement(
            tx,
            tenantId,
            {
              ingredientId: line.ingredientId,
              quantity: line.quantity,
              unit: line.unit,
              reason: 'service_consumed',
              referenceType: 'service_event_line',
              referenceId: line.id,
              direction: -1,
            },
            actorId,
            { skipAvailabilityRecompute: true },
          );
        }
        const now = Date.now();
        await serviceEventRepository.update(tx, tenantId, input.id, {
          status: 'completed',
          completedAt: now,
          updatedAt: now,
          updatedBy: actorId,
        });
      });
    } else {
      // requested / in_progress — only from a not-yet-completed state.
      if (existing.status === 'completed') {
        throw new ConflictError(
          'Cannot move a completed event back — cancel it instead',
        );
      }
      const now = Date.now();
      await serviceEventRepository.update(db, tenantId, input.id, {
        status: input.status,
        completedAt: null,
        updatedAt: now,
        updatedBy: actorId,
      });
    }

    return ServiceService.get(db, tenantId, input.id);
  },

  /**
   * Replace the lines of an in-progress event. Used by the editor when the
   * operator tweaks quantities before completing (e.g. extra oil top-up).
   * Refuses completed / cancelled events.
   */
  async updateLines(
    db: AppDb,
    tenantId: number,
    input: UpdateServiceEventLinesInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<ServiceEventWithLines> {
    const existing = await serviceEventRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('ServiceEvent', input.id);
    if (existing.status !== 'in_progress') {
      throw new ConflictError(
        `Cannot edit lines on a ${existing.status} service event`,
      );
    }

    // Validate every line's ingredient + unit convertibility before mutating.
    // Catches typos and wrong-unit-for-this-part early so we don't half-replace
    // a line set and then fail.
    for (const line of input.lines) {
      const ing = await ingredientRepository.findById(db, tenantId, line.ingredientId);
      if (!ing) throw new NotFoundError('Ingredient', line.ingredientId);
      // Throws ValidationError if unit can't convert.
      toBase(line.quantity, line.unit, ing.baseUnit, {
        densityGPerMl: ing.densityGPerMl ?? undefined,
      });
    }

    return db.transaction(async (tx) => {
      await serviceEventLineRepository.replaceLines(
        tx,
        input.id,
        input.lines.map((line, idx) => ({
          id: newId(),
          serviceEventId: input.id,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          notes: line.notes ?? null,
          displayOrder: line.displayOrder || idx,
        })),
      );
      await serviceEventRepository.update(tx, tenantId, input.id, {
        updatedAt: Date.now(),
        updatedBy: actorId,
      });
      const fresh = await serviceEventRepository.findById(tx, tenantId, input.id);
      const lines = await serviceEventLineRepository.listForEvent(tx, input.id);
      return {
        ...(fresh as unknown as ServiceEvent),
        lines: lines as unknown as ServiceEventLine[],
      };
    });
  },

  /**
   * Stock deduction trigger (locked decision §3.6 / Hyprride mirror): walks
   * every line and calls InventoryService.applyMovement with
   * reason='service_consumed' so the inventory chokepoint records the cost
   * snapshot, updates stock, and writes the stock_movement in one tx.
   * If any line fails (e.g. insufficient stock), the whole completion rolls
   * back — the event stays in_progress.
   */
  async complete(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<ServiceEventWithLines> {
    const existing = await serviceEventRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('ServiceEvent', id);
    if (existing.status === 'completed') {
      return ServiceService.get(db, tenantId, id);
    }
    if (existing.status === 'cancelled') {
      throw new ConflictError('Cannot complete a cancelled service event');
    }

    const lines = await serviceEventLineRepository.listForEvent(db, id);
    if (lines.length === 0) {
      throw new ValidationError(
        'Service event has no parts to consume — edit the line list before completing',
      );
    }

    await db.transaction(async (tx) => {
      for (const line of lines) {
        await InventoryService.applyMovement(
          tx,
          tenantId,
          {
            ingredientId: line.ingredientId,
            quantity: line.quantity,
            unit: line.unit,
            reason: 'service_consumed',
            referenceType: 'service_event_line',
            referenceId: line.id,
            direction: -1,
          },
          actorId,
          { skipAvailabilityRecompute: true },
        );
      }
      const now = Date.now();
      await serviceEventRepository.update(tx, tenantId, id, {
        status: 'completed',
        completedAt: now,
        updatedAt: now,
        updatedBy: actorId,
      });
    });

    return ServiceService.get(db, tenantId, id);
  },

  /**
   * Cancellation. Behaviour by current state (mirrors OrderService):
   *   in_progress → mark cancelled, no movements, `partsUsed` ignored.
   *   completed   → require `partsUsed`:
   *                  false → service_reversal movements (stock restored)
   *                  true  → wastage movements (stock NOT restored, double-deducts)
   *   cancelled   → idempotent; returns the existing record.
   */
  async cancel(
    db: AppDb,
    tenantId: number,
    input: CancelServiceEventInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<ServiceEventWithLines> {
    const existing = await serviceEventRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('ServiceEvent', input.id);
    if (existing.status === 'cancelled') {
      return ServiceService.get(db, tenantId, input.id);
    }

    if (existing.status === 'completed' && input.partsUsed === undefined) {
      throw new ValidationError(
        'Cancelling a completed service event requires partsUsed (true if the parts were already installed, false otherwise)',
      );
    }

    const lines = await serviceEventLineRepository.listForEvent(db, input.id);
    const reason: 'service_reversal' | 'wastage' | null =
      existing.status === 'completed'
        ? input.partsUsed
          ? 'wastage'
          : 'service_reversal'
        : null;

    await db.transaction(async (tx) => {
      if (reason && lines.length > 0) {
        for (const line of lines) {
          // service_reversal restores stock (direction +1); wastage continues
          // to deduct (direction -1) — the original consumption stays put and
          // this wastage records the loss for cost reporting.
          const direction = reason === 'service_reversal' ? 1 : -1;
          await InventoryService.applyMovement(
            tx,
            tenantId,
            {
              ingredientId: line.ingredientId,
              quantity: line.quantity,
              unit: line.unit,
              reason,
              referenceType: 'service_event_line',
              referenceId: line.id,
              direction,
            },
            actorId,
            { skipAvailabilityRecompute: true },
          );
        }
      }

      const now = Date.now();
      await serviceEventRepository.update(tx, tenantId, input.id, {
        status: 'cancelled',
        cancelledAt: now,
        cancelledPartsUsed:
          existing.status === 'completed' ? input.partsUsed ?? null : null,
        updatedAt: now,
        updatedBy: actorId,
      });
    });

    return ServiceService.get(db, tenantId, input.id);
  },

  /**
   * Full edit of an existing event — including a `completed` one, so staff can
   * correct a mistake (wrong quantity, wrong part, wrong bike/date/odometer).
   * Stock stays correct: if the parts changed (or the completed-ness changed)
   * the old consumption is reversed and the new line set re-consumed in one tx,
   * so inventory always reflects the saved lines. When only scalar fields move
   * (odometer / notes / date) the lines + their movements are left untouched so
   * the ledger and per-event cost don't churn. Cancelled events are terminal.
   */
  async update(
    db: AppDb,
    tenantId: number,
    input: UpdateServiceEventInput,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<ServiceEventWithLines> {
    const existing = await serviceEventRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('ServiceEvent', input.id);
    if (existing.status === 'cancelled') {
      throw new ConflictError('A cancelled event is terminal — it cannot be edited');
    }

    if (input.bikeId) {
      const bike = await bikeRepository.findById(db, tenantId, input.bikeId);
      if (!bike) throw new NotFoundError('Bike', input.bikeId);
    }

    const kind = existing.kind;
    const inputLines: ServiceEventLineInput[] = input.lines ?? [];
    if (kind === 'wash') {
      if (inputLines.length > 0) {
        throw new ValidationError('A wash event cannot consume parts');
      }
    } else if (inputLines.length === 0) {
      throw new ValidationError(`Add at least one part for this ${kind}`);
    }

    // Validate every line up-front (part exists + unit converts) so we never
    // half-apply a reconciliation then fail.
    for (const line of inputLines) {
      const ing = await ingredientRepository.findById(db, tenantId, line.ingredientId);
      if (!ing) throw new NotFoundError('Ingredient', line.ingredientId);
      toBase(line.quantity, line.unit, ing.baseUnit, {
        densityGPerMl: ing.densityGPerMl ?? undefined,
      });
    }

    const newStatus = input.status ?? existing.status;
    const wasDeducted = existing.status === 'completed';
    const willDeduct = newStatus === 'completed';

    const existingLines = await serviceEventLineRepository.listForEvent(db, input.id);
    const stockRelevant =
      !sameLineSet(existingLines, inputLines) || wasDeducted !== willDeduct;

    return db.transaction(async (tx) => {
      if (stockRelevant) {
        // 1) Undo the old deduction (restore the parts that were consumed).
        if (wasDeducted) {
          for (const line of existingLines) {
            await InventoryService.applyMovement(
              tx,
              tenantId,
              {
                ingredientId: line.ingredientId,
                quantity: line.quantity,
                unit: line.unit,
                reason: 'service_reversal',
                referenceType: 'service_event_line',
                referenceId: line.id,
                direction: 1,
              },
              actorId,
              { skipAvailabilityRecompute: true },
            );
          }
        }

        // 2) Swap in the new line set.
        const newLines = await serviceEventLineRepository.replaceLines(
          tx,
          input.id,
          inputLines.map((line, idx) => ({
            id: newId(),
            serviceEventId: input.id,
            ingredientId: line.ingredientId,
            quantity: line.quantity,
            unit: line.unit,
            notes: line.notes ?? null,
            displayOrder: line.displayOrder || idx,
          })),
        );

        // 3) Re-deduct against the new lines when the event is (still) completed.
        if (willDeduct) {
          for (const line of newLines) {
            await InventoryService.applyMovement(
              tx,
              tenantId,
              {
                ingredientId: line.ingredientId,
                quantity: line.quantity,
                unit: line.unit,
                reason: 'service_consumed',
                referenceType: 'service_event_line',
                referenceId: line.id,
                direction: -1,
              },
              actorId,
              { skipAvailabilityRecompute: true },
            );
          }
        }
      }

      const now = Date.now();
      const newStartedAt = input.occurredAt ?? existing.startedAt;
      const newCompletedAt = willDeduct
        ? input.occurredAt ?? existing.completedAt ?? existing.startedAt
        : null;
      await serviceEventRepository.update(tx, tenantId, input.id, {
        ...(input.bikeId ? { bikeId: input.bikeId } : {}),
        status: newStatus,
        startedAt: newStartedAt,
        completedAt: newCompletedAt,
        ...(input.odometerKm !== undefined ? { odometerKm: input.odometerKm } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: now,
        updatedBy: actorId,
      });

      const fresh = await serviceEventRepository.findById(tx, tenantId, input.id);
      const lines = await serviceEventLineRepository.listForEvent(tx, input.id);
      return {
        ...(fresh as unknown as ServiceEvent),
        lines: lines as unknown as ServiceEventLine[],
      };
    });
  },

  /**
   * Delete an event. When it was `completed`, every line's parts are first put
   * back into inventory via a `service_reversal` movement (append-only — the
   * original consumption rows stay), then the event + its lines are removed.
   * requested / in_progress events never deducted stock, so they're just
   * removed; cancelled events already settled their stock on cancel.
   */
  async remove(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): Promise<{ id: string }> {
    const existing = await serviceEventRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('ServiceEvent', id);
    const lines = await serviceEventLineRepository.listForEvent(db, id);

    await db.transaction(async (tx) => {
      if (existing.status === 'completed') {
        for (const line of lines) {
          await InventoryService.applyMovement(
            tx,
            tenantId,
            {
              ingredientId: line.ingredientId,
              quantity: line.quantity,
              unit: line.unit,
              reason: 'service_reversal',
              referenceType: 'service_event_line',
              referenceId: line.id,
              direction: 1,
            },
            actorId,
            { skipAvailabilityRecompute: true },
          );
        }
      }
      await serviceEventLineRepository.deleteForEvent(tx, id);
      await serviceEventRepository.delete(tx, tenantId, id);
    });

    return { id };
  },
};
