import { pgEnum, varchar } from 'drizzle-orm/pg-core';
import { timestamp } from 'drizzle-orm/pg-core';
import { uuid } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { DEV_TENANT_ID } from '../../content/constants';

export const contentTypeEnum = pgEnum('content_type_enum', ['text', 'image']);
export const contentStatusEnum = pgEnum('content_status_enum', [
  'pending',
  'approved',
  'rejected',
  'needs_review',
]);

export const contentTable = pgTable('content', {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid().notNull().default(DEV_TENANT_ID),
  type: contentTypeEnum().notNull(),
  text: varchar('text', { length: 10_000 }).notNull(),
  status: contentStatusEnum().notNull().default('pending'),
  createdAt: timestamp().notNull().defaultNow(),
});
