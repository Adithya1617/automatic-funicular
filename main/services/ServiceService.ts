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
  ServiceEventLineWithCost,
  ServiceEventWithCost,
  ServiceEventWithLines,
  SetServiceEventStatusInput,
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
  row: ReturnType<typeof serviceEventRepository.findById>,
): ServiceEvent {
  if (!row) throw new Error('toEvent called with empty row');
  return row as unknown as ServiceEvent;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const ServiceService = {
  list(db: AppDb, tenantId: number, filter: ListServiceEventsInput): ServiceEvent[] {
    return serviceEventRepository
      .list(db, tenantId, filter)
      .map((r) => r as unknown as ServiceEvent);
  },

  get(db: AppDb, tenantId: number, id: string): ServiceEventWithLines {
    const row = serviceEventRepository.findById(db, tenantId, id);
    if (!row) throw new NotFoundError('ServiceEvent', id);
    const lines = serviceEventLineRepository.listForEvent(db, id);
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
  listWithLines(
    db: AppDb,
    tenantId: number,
    filter: ListServiceEventsInput,
  ): ServiceEventWithCost[] {
    const events = serviceEventRepository.list(db, tenantId, filter);
    const lineRows = serviceEventLineRepository.listForEvents(
      db,
      events.map((e) => e.id),
    );

    // Net snapshot cost per line id, from its consumption / reversal movements.
    const movements = stockMovementRepository.listByReferenceIds(
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
  create(
    db: AppDb,
    tenantId: number,
    input: CreateServiceEventInput,
    actorId: string = SYSTEM_USER_ID,
  ): ServiceEventWithLines {
    const bike = bikeRepository.findById(db, tenantId, input.bikeId);
    if (!bike) throw new NotFoundError('Bike', input.bikeId);

    const template = serviceTemplateRepository.findById(
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

    const recipe = recipeRepository.findActiveVersion(db, {
      tenantId,
      parentId: template.id,
      parentType: 'service_template',
    });
    if (!recipe) {
      throw new ValidationError(
        `Service template "${template.name}" has no active recipe — add parts to the template before starting a service`,
      );
    }

    const recipeRows = recipeRepository.ingredientsForVersion(db, recipe.id);
    if (recipeRows.length === 0) {
      throw new ValidationError(
        `Service template "${template.name}" has an active version but no parts — add at least one part row before starting a service`,
      );
    }

    return db.transaction((tx) => {
      const now = Date.now();
      const event = serviceEventRepository.insert(tx, {
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

      const lines = serviceEventLineRepository.insertMany(
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
  createAdHoc(
    db: AppDb,
    tenantId: number,
    input: CreateAdHocServiceEventInput,
    actorId: string = SYSTEM_USER_ID,
  ): ServiceEventWithLines {
    const bike = bikeRepository.findById(db, tenantId, input.bikeId);
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
      const ing = ingredientRepository.findById(db, tenantId, line.ingredientId);
      if (!ing) throw new NotFoundError('Ingredient', line.ingredientId);
      toBase(line.quantity, line.unit, ing.baseUnit, {
        densityGPerMl: ing.densityGPerMl ?? undefined,
      });
    }

    return db.transaction((tx) => {
      const now = Date.now();
      const event = serviceEventRepository.insert(tx, {
        id: newId(),
        tenantId,
        bikeId: input.bikeId,
        kind,
        serviceTemplateId: null,
        serviceTemplateVersionId: null,
        status,
        startedAt: now,
        completedAt: status === 'completed' ? now : null,
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
          : serviceEventLineRepository.insertMany(
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
          InventoryService.applyMovement(
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
  setStatus(
    db: AppDb,
    tenantId: number,
    input: SetServiceEventStatusInput,
    actorId: string = SYSTEM_USER_ID,
  ): ServiceEventWithLines {
    const existing = serviceEventRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('ServiceEvent', input.id);
    if (existing.status === input.status) {
      return ServiceService.get(db, tenantId, input.id);
    }
    if (existing.status === 'cancelled') {
      throw new ConflictError('A cancelled event is terminal — its status cannot change');
    }

    if (input.status === 'completed') {
      const lines = serviceEventLineRepository.listForEvent(db, input.id);
      if (existing.kind !== 'wash' && lines.length === 0) {
        throw new ValidationError(
          'Add at least one part before completing this event',
        );
      }
      db.transaction((tx) => {
        for (const line of lines) {
          InventoryService.applyMovement(
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
        serviceEventRepository.update(tx, tenantId, input.id, {
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
      serviceEventRepository.update(db, tenantId, input.id, {
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
  updateLines(
    db: AppDb,
    tenantId: number,
    input: UpdateServiceEventLinesInput,
    actorId: string = SYSTEM_USER_ID,
  ): ServiceEventWithLines {
    const existing = serviceEventRepository.findById(db, tenantId, input.id);
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
      const ing = ingredientRepository.findById(db, tenantId, line.ingredientId);
      if (!ing) throw new NotFoundError('Ingredient', line.ingredientId);
      // Throws ValidationError if unit can't convert.
      toBase(line.quantity, line.unit, ing.baseUnit, {
        densityGPerMl: ing.densityGPerMl ?? undefined,
      });
    }

    return db.transaction((tx) => {
      serviceEventLineRepository.replaceLines(
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
      serviceEventRepository.update(tx, tenantId, input.id, {
        updatedAt: Date.now(),
        updatedBy: actorId,
      });
      const fresh = serviceEventRepository.findById(tx, tenantId, input.id);
      const lines = serviceEventLineRepository.listForEvent(tx, input.id);
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
  complete(
    db: AppDb,
    tenantId: number,
    id: string,
    actorId: string = SYSTEM_USER_ID,
  ): ServiceEventWithLines {
    const existing = serviceEventRepository.findById(db, tenantId, id);
    if (!existing) throw new NotFoundError('ServiceEvent', id);
    if (existing.status === 'completed') {
      return ServiceService.get(db, tenantId, id);
    }
    if (existing.status === 'cancelled') {
      throw new ConflictError('Cannot complete a cancelled service event');
    }

    const lines = serviceEventLineRepository.listForEvent(db, id);
    if (lines.length === 0) {
      throw new ValidationError(
        'Service event has no parts to consume — edit the line list before completing',
      );
    }

    db.transaction((tx) => {
      for (const line of lines) {
        InventoryService.applyMovement(
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
      serviceEventRepository.update(tx, tenantId, id, {
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
  cancel(
    db: AppDb,
    tenantId: number,
    input: CancelServiceEventInput,
    actorId: string = SYSTEM_USER_ID,
  ): ServiceEventWithLines {
    const existing = serviceEventRepository.findById(db, tenantId, input.id);
    if (!existing) throw new NotFoundError('ServiceEvent', input.id);
    if (existing.status === 'cancelled') {
      return ServiceService.get(db, tenantId, input.id);
    }

    if (existing.status === 'completed' && input.partsUsed === undefined) {
      throw new ValidationError(
        'Cancelling a completed service event requires partsUsed (true if the parts were already installed, false otherwise)',
      );
    }

    const lines = serviceEventLineRepository.listForEvent(db, input.id);
    const reason: 'service_reversal' | 'wastage' | null =
      existing.status === 'completed'
        ? input.partsUsed
          ? 'wastage'
          : 'service_reversal'
        : null;

    db.transaction((tx) => {
      if (reason && lines.length > 0) {
        for (const line of lines) {
          // service_reversal restores stock (direction +1); wastage continues
          // to deduct (direction -1) — the original consumption stays put and
          // this wastage records the loss for cost reporting.
          const direction = reason === 'service_reversal' ? 1 : -1;
          InventoryService.applyMovement(
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
      serviceEventRepository.update(tx, tenantId, input.id, {
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
};
