import { Global, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: () =>
        drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), {
          schema: schema,
          casing: 'snake_case',
        }),
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule {}
