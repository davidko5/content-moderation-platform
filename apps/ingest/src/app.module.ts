import { Module } from '@nestjs/common';
import { ContentModule } from './content/content.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ContentModule,
    ConfigModule.forRoot({ isGlobal: true }), // loads .env into process.env
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
