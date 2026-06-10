import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitModule } from './rabbit/rabbit.module';
import { DecisionService } from './decision/decision.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RabbitModule],
  controllers: [],
  providers: [DecisionService],
})
export class AppModule {}
