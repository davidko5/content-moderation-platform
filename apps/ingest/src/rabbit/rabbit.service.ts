import {
  Injectable,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import amqp, {
  AmqpConnectionManager,
  ChannelWrapper,
} from 'amqp-connection-manager';
import { ConfirmChannel } from 'amqplib';
import { CONTENT_UPLOADED, ContentUploaded } from '@moderation/events';

const EXCHANGE = 'moderation';

@Injectable()
export class RabbitService implements OnModuleInit, OnApplicationShutdown {
  private connection!: AmqpConnectionManager;
  private channel!: ChannelWrapper;

  onModuleInit() {
    this.connection = amqp.connect([process.env.RABBITMQ_URL!]);
    this.channel = this.connection.createChannel({
      json: true,
      setup: async (ch: ConfirmChannel) => {
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
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
}
