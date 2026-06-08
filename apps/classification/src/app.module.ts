import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitModule } from './rabbit/rabbit.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RabbitModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
