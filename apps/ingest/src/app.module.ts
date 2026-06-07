import { Module } from '@nestjs/common';
import { ContentModule } from './content/content.module';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // loads .env into process.env
    DbModule,
    ContentModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
