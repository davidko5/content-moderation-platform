import { Module } from '@nestjs/common';
import { RabbitService } from './rabbit.service';
import { DecisionService } from '../decision/decision.service';

@Module({
  providers: [RabbitService, DecisionService],
})
export class RabbitModule {}
