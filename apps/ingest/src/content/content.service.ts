import { Inject, Injectable } from '@nestjs/common';
import { CreateContentRequestDto } from './dto/create-content-request.dto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZZLE } from 'src/db/db.module';

@Injectable()
export class ContentService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async submit(dto: CreateContentRequestDto) {
    const [row] = await this.db
      .insert(schema.contentTable)
      .values({
        ...dto,
        status: 'pending',
      })
      .returning();

    return row;
  }
}
