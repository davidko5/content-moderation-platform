import { Inject, Injectable } from '@nestjs/common';
import { CreateContentRequestDto } from './dto/create-content-request.dto';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZZLE } from '../db/db.module';
import { RabbitService } from '../rabbit/rabbit.service';
import { DEV_TENANT_ID } from './constants';
import { createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class ContentService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly rabbitService: RabbitService,
  ) {}

  async submit(dto: CreateContentRequestDto) {
    const canonicalText = dto.text.normalize('NFC').trim();
    const contentHash = createHash('sha256')
      .update(canonicalText)
      .digest('hex');

    const [row] = await this.db
      .insert(schema.contentTable)
      .values({
        ...dto,
        tenantId: DEV_TENANT_ID,
        contentHash,
        status: 'pending',
      })
      .onConflictDoNothing({
        target: [schema.contentTable.tenantId, schema.contentTable.contentHash],
      })
      .returning();

    if (!row) {
      const [existing] = await this.db
        .select()
        .from(schema.contentTable)
        .where(
          and(
            eq(schema.contentTable.tenantId, DEV_TENANT_ID),
            eq(schema.contentTable.contentHash, contentHash),
          ),
        );

      return existing;
    }

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
