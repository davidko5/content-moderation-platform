import { pgEnum, unique, varchar } from 'drizzle-orm/pg-core';
import { timestamp } from 'drizzle-orm/pg-core';
import { uuid } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { tenantsTable } from './tenant.schema';

export const contentTypeEnum = pgEnum('content_type_enum', ['text', 'image']);
export const contentStatusEnum = pgEnum('content_status_enum', [
  'pending',
  'approved',
  'rejected',
  'needs_review',
]);

export const contentTable = pgTable(
  'content',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenantsTable.id),
    contentHash: varchar({ length: 64 }).notNull(),
    type: contentTypeEnum().notNull(),
    text: varchar({ length: 10_000 }).notNull(),
    status: contentStatusEnum().notNull().default('pending'),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (table) => [unique().on(table.tenantId, table.contentHash)],
);
