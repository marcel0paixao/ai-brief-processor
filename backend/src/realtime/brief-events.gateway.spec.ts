import {
  BRIEF_EVENTS_CHANNEL,
  BRIEF_UPDATED_EVENT,
  BriefStatus,
  UserRole,
} from '@ai-brief/shared';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { BriefEventsGateway } from './brief-events.gateway';

describe('BriefEventsGateway', () => {
  const user = {
    id: 'user-1',
    name: 'User',
    email: 'user@example.com',
    role: UserRole.MEMBER,
    tenantId: 'tenant-1',
    tenantName: 'Tenant',
    tenantSlug: 'tenant',
  };
  const authenticateAccessToken = jest.fn();
  const gateway = new BriefEventsGateway(
    {} as ConfigService,
    { authenticateAccessToken } as unknown as AuthService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authenticates the socket and joins only its tenant room', async () => {
    authenticateAccessToken.mockResolvedValue(user);
    const join = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn();
    const client = {
      handshake: { auth: { token: 'valid-token' }, headers: {} },
      data: {},
      join,
      disconnect,
    } as unknown as Socket;

    await gateway.handleConnection(client);

    expect(authenticateAccessToken).toHaveBeenCalledWith('valid-token');
    expect(join).toHaveBeenCalledWith('tenant:tenant-1');
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a socket with an invalid token', async () => {
    authenticateAccessToken.mockRejectedValue(new Error('invalid token'));
    const join = jest.fn();
    const disconnect = jest.fn();
    const client = {
      handshake: { auth: { token: 'invalid-token' }, headers: {} },
      data: {},
      join,
      disconnect,
    } as unknown as Socket;

    await gateway.handleConnection(client);

    expect(join).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('emits a brief update only to the event tenant room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as unknown as Server;

    gateway.handleRedisMessage(
      BRIEF_EVENTS_CHANNEL,
      JSON.stringify({
        briefId: 'brief-1',
        tenantId: 'tenant-1',
        status: BriefStatus.COMPLETED,
        occurredAt: '2026-08-31T20:00:00.000Z',
      }),
    );

    expect(to).toHaveBeenCalledWith('tenant:tenant-1');
    expect(emit).toHaveBeenCalledWith(BRIEF_UPDATED_EVENT, {
      briefId: 'brief-1',
      status: BriefStatus.COMPLETED,
      occurredAt: '2026-08-31T20:00:00.000Z',
    });
  });
});
