import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitModule } from './rabbit/rabbit.module';
import { DecisionService } from './decision/decision.service';
import { DbModule } from './db/db.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RabbitModule, DbModule],
  controllers: [],
  providers: [DecisionService],
})
export class AppModule {}
