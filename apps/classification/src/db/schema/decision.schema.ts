import { pgEnum } from 'drizzle-orm/pg-core';
import { timestamp } from 'drizzle-orm/pg-core';
import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const decisionEnum = pgEnum('decision_enum', ['approved', 'rejected']);

export const decisionsTable = pgTable('decisions', {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid().notNull(),
  contentId: uuid().notNull(),
  decision: decisionEnum().notNull(),
  decidedAt: timestamp().notNull().defaultNow(),
});
