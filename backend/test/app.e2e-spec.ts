import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@ai-brief/shared';
import { Queue } from 'bullmq';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  ANALYZE_BRIEF_JOB,
  AnalyzeBriefJobData,
  BRIEF_ANALYSIS_QUEUE,
} from './../src/briefs/queue/briefs-queue.constants';

const validBriefPayload = {
  title: 'Product launch campaign',
  brief: 'We need to introduce the new product to small business owners.',
};

interface AuthResponseBody {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    tenant: { id: string; name: string; slug: string };
  };
}

interface CreateBriefResponseBody {
  id: string;
  status: string;
}

interface BriefListItemBody extends CreateBriefResponseBody {
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface BriefListResponseBody {
  items: BriefListItemBody[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    statusCounts: Record<string, number>;
  };
}

interface BriefDetailBody extends BriefListItemBody {
  brief: string;
  attemptCount: number;
}

describe('App (e2e)', () => {
  let app: INestApplication<App>;
  let connection: Connection;
  let briefQueue: Queue<AnalyzeBriefJobData>;

  async function registerTenant(label = 'primary'): Promise<AuthResponseBody> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: `Admin ${label}`,
        email: `admin-${label}@example.com`,
        password: 'SecurePass123',
        tenantName: `Tenant ${label}`,
      })
      .expect(201);

    return response.body as AuthResponseBody;
  }

  async function createBrief(
    accessToken: string,
    payload = validBriefPayload,
  ): Promise<CreateBriefResponseBody> {
    const response = await request(app.getHttpServer())
      .post('/briefs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(202);

    return response.body as CreateBriefResponseBody;
  }

  beforeAll(async () => {
    process.env.MONGODB_URI =
      process.env.TEST_MONGODB_URI ??
      'mongodb://localhost:27017/ai_brief_processor_test?serverSelectionTimeoutMS=5000&connectTimeoutMS=5000';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_DB = '15';
    process.env.JWT_SECRET =
      'e2e-test-secret-that-is-long-and-not-for-production';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    connection = moduleFixture.get<Connection>(getConnectionToken());
    briefQueue = moduleFixture.get<Queue<AnalyzeBriefJobData>>(
      getQueueToken(BRIEF_ANALYSIS_QUEUE),
    );
    await app.init();
    await briefQueue.waitUntilReady();
  });

  afterEach(async () => {
    await Promise.all([
      connection.collection('briefs').deleteMany({}),
      connection.collection('users').deleteMany({}),
      connection.collection('tenants').deleteMany({}),
      briefQueue.drain(true),
    ]);
  });

  afterAll(async () => {
    await briefQueue.obliterate({ force: true });
    await app.close();
  });

  it('/ (GET) stays public', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('protects application endpoints without a bearer token', async () => {
    await request(app.getHttpServer()).get('/briefs').expect(401);
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('registers the first tenant administrator and restores the session', async () => {
    const auth = await registerTenant();

    expect(auth.accessToken).toEqual(expect.any(String));
    expect(auth.user).toMatchObject({
      email: 'admin-primary@example.com',
      role: UserRole.ADMIN,
      tenant: { name: 'Tenant primary' },
    });
    expect(Types.ObjectId.isValid(auth.user.id)).toBe(true);
    expect(Types.ObjectId.isValid(auth.user.tenant.id)).toBe(true);

    const session = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200);

    expect(session.body).toEqual(auth.user);
  });

  it('logs in with valid credentials and rejects invalid credentials', async () => {
    await registerTenant();

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin-primary@example.com', password: 'WrongPass123' })
      .expect(401);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ' ADMIN-PRIMARY@example.com ', password: 'SecurePass123' })
      .expect(200);

    expect((response.body as AuthResponseBody).accessToken).toEqual(
      expect.any(String),
    );
  });

  it('/briefs (POST) persists tenant ownership and enqueues a scoped job', async () => {
    const auth = await registerTenant();
    const responseBody = await createBrief(auth.accessToken);

    expect(Types.ObjectId.isValid(responseBody.id)).toBe(true);
    expect(responseBody.status).toBe('PENDING');

    const storedBrief = await connection.collection('briefs').findOne({
      _id: new Types.ObjectId(responseBody.id),
    });

    expect(storedBrief).toMatchObject({
      title: validBriefPayload.title,
      brief: validBriefPayload.brief,
      status: 'PENDING',
      attemptCount: 0,
      tenantId: new Types.ObjectId(auth.user.tenant.id),
      createdBy: new Types.ObjectId(auth.user.id),
    });

    const queuedJob = await briefQueue.getJob(responseBody.id);
    expect(queuedJob).not.toBeNull();
    expect(queuedJob?.name).toBe(ANALYZE_BRIEF_JOB);
    expect(queuedJob?.data).toEqual({
      briefId: responseBody.id,
      tenantId: auth.user.tenant.id,
    });
    expect(queuedJob?.opts.attempts).toBe(3);
  });

  it('/briefs validates input and returns filtered paginated summaries', async () => {
    const auth = await registerTenant();

    await request(app.getHttpServer())
      .post('/briefs')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ title: 'x', brief: 'too short', tenantId: new Types.ObjectId() })
      .expect(400);

    const firstBrief = await createBrief(auth.accessToken);
    await createBrief(auth.accessToken, {
      title: 'Brand repositioning study',
      brief:
        'We need to reposition an established brand for a younger audience.',
    });

    const response = await request(app.getHttpServer())
      .get(
        '/briefs?search=launch&status=PENDING&page=1&limit=10&sortBy=title&sortOrder=asc',
      )
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200);
    const body = response.body as BriefListResponseBody;

    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: firstBrief.id,
      title: validBriefPayload.title,
      status: 'PENDING',
    });
    expect(body.items[0]).not.toHaveProperty('brief');
    expect(body.meta).toMatchObject({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    expect(body.meta.statusCounts.PENDING).toBe(1);
  });

  it('prevents one tenant from listing or reading another tenant records', async () => {
    const tenantA = await registerTenant('alpha');
    const tenantB = await registerTenant('beta');
    const createdBrief = await createBrief(tenantA.accessToken);

    const listResponse = await request(app.getHttpServer())
      .get('/briefs')
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .expect(200);

    expect((listResponse.body as BriefListResponseBody).items).toEqual([]);

    await request(app.getHttpServer())
      .get(`/briefs/${createdBrief.id}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .expect(404);
  });

  it('enforces MEMBER and ADMIN permissions', async () => {
    const admin = await registerTenant();
    const createdBrief = await createBrief(admin.accessToken);

    const memberResponse = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Workspace Member',
        email: 'member@example.com',
        password: 'SecurePass123',
        role: UserRole.MEMBER,
      })
      .expect(201);

    const member = memberResponse.body as { id: string; role: UserRole };
    expect(member.role).toBe(UserRole.MEMBER);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'member@example.com', password: 'SecurePass123' })
      .expect(200);
    const memberToken = (loginResponse.body as AuthResponseBody).accessToken;

    await request(app.getHttpServer())
      .post('/briefs')
      .set('Authorization', `Bearer ${memberToken}`)
      .send(validBriefPayload)
      .expect(202);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/briefs/${createdBrief.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ title: 'Member cannot rename this brief' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/briefs/${createdBrief.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);

    const promotionResponse = await request(app.getHttpServer())
      .patch(`/users/${member.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role: UserRole.ADMIN })
      .expect(200);

    expect((promotionResponse.body as { role: UserRole }).role).toBe(
      UserRole.ADMIN,
    );
  });

  it('allows administrators to update and delete only their tenant briefs', async () => {
    const admin = await registerTenant();
    const createdBrief = await createBrief(admin.accessToken);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/briefs/${createdBrief.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ title: '  Updated launch campaign  ' })
      .expect(200);

    expect((updateResponse.body as BriefDetailBody).title).toBe(
      'Updated launch campaign',
    );

    await request(app.getHttpServer())
      .delete(`/briefs/${createdBrief.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/briefs/${createdBrief.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(404);
  });
});
