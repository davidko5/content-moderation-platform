import { timestamp } from 'drizzle-orm/pg-core';
import { varchar } from 'drizzle-orm/pg-core';
import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const tenantsTable = pgTable('tenants', {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});
