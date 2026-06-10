import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
  Logger,
  Inject,
} from '@nestjs/common';
import amqp, {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  CONTENT_DECIDED,
  CONTENT_UPLOADED,
  ContentDecided,
  ContentUploaded,
} from '@moderation/events';
import { DRIZZLE } from '../db/db.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { eq } from 'drizzle-orm';

const EXCHANGE = 'moderation';
const QUEUE_DECIDED = 'ingest.content-decided';

@Injectable()
export class RabbitService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RabbitService.name);
  private connection!: AmqpConnectionManager;
  private channel!: ChannelWrapper;

  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  onModuleInit() {
    this.connection = amqp.connect([process.env.RABBITMQ_URL!]);
    this.channel = this.connection.createChannel({
      json: true,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
        await ch.assertQueue(QUEUE_DECIDED, { durable: true });
        await ch.bindQueue(QUEUE_DECIDED, EXCHANGE, CONTENT_DECIDED);
        await ch.prefetch(1);
        await ch.consume(QUEUE_DECIDED, (msg) => {
          this.handleContentDecided(ch, msg).catch((error) =>
            this.logger.error(
              'Error occurred while processing message:',
              error,
            ),
          );
        });
      },
    });
  }

  async onApplicationShutdown() {
    await this.channel.close();
    await this.connection.close();
  }

  async publishContentUploaded(event: ContentUploaded) {
    await this.channel.publish(EXCHANGE, CONTENT_UPLOADED, event, {
      persistent: true,
      messageId: event.contentId,
    });
  }

  private async handleContentDecided(
    ch: ConfirmChannel,
    msg: ConsumeMessage | null,
  ) {
    if (!msg) return;
    const event = JSON.parse(msg.content.toString()) as ContentDecided;
    this.logger.log('Received event:', event);

    await this.db
      .update(schema.contentTable)
      .set({ status: event.decision })
      .where(eq(schema.contentTable.id, event.contentId));

    ch.ack(msg);
  }
}
