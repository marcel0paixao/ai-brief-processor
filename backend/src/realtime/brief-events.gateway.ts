import {
  BRIEF_EVENTS_CHANNEL,
  BRIEF_UPDATED_EVENT,
  BriefStatus,
  type BriefUpdatedEvent,
} from '@ai-brief/shared';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import IORedis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';

const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

function parseBriefUpdatedEvent(
  payload: string,
): BriefUpdatedEvent | undefined {
  try {
    const event = JSON.parse(payload) as Partial<BriefUpdatedEvent>;
    const validStatuses = Object.values(BriefStatus) as string[];

    if (
      typeof event.briefId !== 'string' ||
      typeof event.tenantId !== 'string' ||
      typeof event.occurredAt !== 'string' ||
      !validStatuses.includes(event.status ?? '')
    ) {
      return undefined;
    }

    return event as BriefUpdatedEvent;
  } catch {
    return undefined;
  }
}

@WebSocketGateway({
  namespace: '/brief-events',
  transports: ['websocket'],
  cors: { origin: allowedOrigins },
})
export class BriefEventsGateway
  implements OnGatewayConnection, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BriefEventsGateway.name);
  private subscriber?: IORedis;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = new IORedis({
      host: this.configService.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(this.configService.get<string>('REDIS_PORT') ?? 6379),
      db: Number(this.configService.get<string>('REDIS_DB') ?? 0),
      connectionName: 'brief-events-subscriber',
      maxRetriesPerRequest: null,
    });
    this.subscriber.on('message', (channel, payload) => {
      this.handleRedisMessage(channel, payload);
    });
    this.subscriber.on('error', (error) => {
      this.logger.error(`Brief event subscriber error: ${error.message}`);
    });

    await this.subscriber.subscribe(BRIEF_EVENTS_CHANNEL);
    this.logger.log(`Subscribed to Redis channel ${BRIEF_EVENTS_CHANNEL}`);
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = this.readAccessToken(client);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const user = await this.authService.authenticateAccessToken(token);
      await client.join(tenantRoom(user.tenantId));
    } catch {
      client.disconnect(true);
    }
  }

  handleRedisMessage(channel: string, payload: string): void {
    if (channel !== BRIEF_EVENTS_CHANNEL) return;

    const event = parseBriefUpdatedEvent(payload);
    if (!event || !this.server) return;

    const { tenantId, ...clientEvent } = event;
    this.server.to(tenantRoom(tenantId)).emit(BRIEF_UPDATED_EVENT, clientEvent);
  }

  async onModuleDestroy(): Promise<void> {
    const subscriber = this.subscriber;
    this.subscriber = undefined;
    if (!subscriber) return;

    try {
      await subscriber.quit();
    } catch {
      subscriber.disconnect();
    }
  }

  private readAccessToken(client: Socket): string | undefined {
    const handshakeAuth: unknown = client.handshake.auth;
    const authToken =
      typeof handshakeAuth === 'object' &&
      handshakeAuth !== null &&
      'token' in handshakeAuth
        ? (handshakeAuth as { token?: unknown }).token
        : undefined;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const authorization = client.handshake.headers.authorization;
    if (typeof authorization !== 'string') return undefined;

    const [type, token] = authorization.split(' ');
    return type?.toLowerCase() === 'bearer' ? token : undefined;
  }
}
