import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
  Logger,
} from '@nestjs/common';
import amqp, {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { CONTENT_UPLOADED, ContentUploaded } from '@moderation/events';

const EXCHANGE = 'moderation';
const QUEUE = 'classification.content-uploaded';

@Injectable()
export class RabbitService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RabbitService.name);
  private connection!: AmqpConnectionManager;
  private channel!: ChannelWrapper;

  onModuleInit() {
    this.connection = amqp.connect([process.env.RABBITMQ_URL!]);
    this.channel = this.connection.createChannel({
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
        await ch.assertQueue(QUEUE, { durable: true });
        await ch.bindQueue(QUEUE, EXCHANGE, CONTENT_UPLOADED);
        await ch.prefetch(1);
        await ch.consume(QUEUE, (msg) => this.handle(ch, msg));
      },
    });
  }

  async onApplicationShutdown() {
    await this.channel.close();
    await this.connection.close();
  }

  private handle(ch: ConfirmChannel, msg: ConsumeMessage | null) {
    if (!msg) return;
    const event = JSON.parse(msg.content.toString()) as ContentUploaded;
    this.logger.log('Received event:', event);
    ch.ack(msg);
  }
}
