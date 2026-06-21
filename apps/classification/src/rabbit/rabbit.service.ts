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
import { DecisionService } from '../decision/decision.service';
import { DRIZZLE } from '../db/db.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

const EXCHANGE = 'moderation';
const QUEUE = 'classification.content-uploaded';

const FAKE_SCORE = 0;
const THRESHOLD = 0.7;

@Injectable()
export class RabbitService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RabbitService.name);
  private connection!: AmqpConnectionManager;
  private channel!: ChannelWrapper;

  constructor(
    private decisionService: DecisionService,
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  onModuleInit() {
    this.connection = amqp.connect([process.env.RABBITMQ_URL!]);
    this.channel = this.connection.createChannel({
      json: true,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
        await ch.assertQueue(QUEUE, { durable: true });
        await ch.bindQueue(QUEUE, EXCHANGE, CONTENT_UPLOADED);
        await ch.prefetch(1);
        await ch.consume(QUEUE, (msg) => {
          this.handle(ch, msg).catch((error) =>
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

  private async handle(ch: ConfirmChannel, msg: ConsumeMessage | null) {
    if (!msg) return;
    const event = JSON.parse(msg.content.toString()) as ContentUploaded;
    this.logger.log('Received event:', event);

    const decision = this.decisionService.decide(FAKE_SCORE, THRESHOLD);

    await this.db.insert(schema.decisionsTable).values({
      tenantId: event.tenantId,
      contentId: event.contentId,
      decision: decision,
    });

    const contentDecidedEvent: ContentDecided = {
      contentId: event.contentId,
      tenantId: event.tenantId,
      decision: decision,
      decidedAt: new Date().toISOString(),
    };

    await this.publishContentDecided(contentDecidedEvent);

    ch.ack(msg);
  }

  async publishContentDecided(event: ContentDecided) {
    await this.channel.publish(EXCHANGE, CONTENT_DECIDED, event, {
      persistent: true,
      messageId: event.contentId,
    });
  }
}
