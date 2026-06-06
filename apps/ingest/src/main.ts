import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields
      forbidNonWhitelisted: true, // 400 if client sends extras (e.g. status)
      transform: true, // turn body into the DTO class + coerce types
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
