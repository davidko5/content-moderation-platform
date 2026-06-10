import { Inject, Injectable } from '@nestjs/common';
import { CreateContentRequestDto } from './dto/create-content-request.dto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZZLE } from '../db/db.module';
import { RabbitService } from '../rabbit/rabbit.service';

@Injectable()
export class ContentService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly rabbitService: RabbitService,
  ) {}

  async submit(dto: CreateContentRequestDto) {
    const [row] = await this.db
      .insert(schema.contentTable)
      .values({
        ...dto,
        status: 'pending',
      })
      .returning();

    await this.rabbitService.publishContentUploaded({
      contentId: row.id,
      tenantId: row.tenantId,
      type: row.type,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
    });

    return row;
  }
}
