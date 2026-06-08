import { Module } from '@nestjs/common';
import { ContentModule } from './content/content.module';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { RabbitModule } from './rabbit/rabbit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // loads .env into process.env
    DbModule,
    ContentModule,
    RabbitModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
