import { BullModule } from '@nestjs/bullmq';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BriefsModule } from './briefs/briefs.module';
import { BRIEF_QUEUE_CONFIG } from './briefs/queue/briefs-queue.constants';
import { UsersModule } from './users/users.module';
import { BriefEventsGateway } from './realtime/brief-events.gateway';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env', 'backend/.env'],
      isGlobal: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        base: { service: 'backend' },
        redact: {
          paths: ['req.headers.authorization', 'req.body.password'],
          censor: '[REDACTED]',
        },
        autoLogging: {
          ignore: (request) =>
            request.url === '/health' || request.url === '/metrics',
        },
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    BullModule.forRootAsync(BRIEF_QUEUE_CONFIG, {
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(configService.get<string>('REDIS_PORT') ?? 6379),
          db: Number(configService.get<string>('REDIS_DB') ?? 0),
          connectionName: 'brief-producer',
          connectTimeout: 3_000,
          maxRetriesPerRequest: 1,
        },
        skipWaitingForReady: true,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2_000,
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      }),
    }),
    AuthModule,
    UsersModule,
    BriefsModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    BriefEventsGateway,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
    },
  ],
})
export class AppModule {}
