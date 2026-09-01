import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BriefAnalysisOutcome,
  type BriefAnalysisResult,
  UserRole,
} from '@ai-brief/shared';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import mongoose, { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  ANALYZE_BRIEF_JOB,
  AnalyzeBriefJobData,
  BRIEF_ANALYSIS_QUEUE,
} from './../src/briefs/queue/briefs-queue.constants';
import { createBriefProcessor } from '../../worker/src/briefs/brief-processor';
import { briefRepository } from '../../worker/src/briefs/brief-repository';

const fakeAnalysis: BriefAnalysisResult = {
  outcome: BriefAnalysisOutcome.ANALYZED,
  summary:
    'The briefing describes a product launch aimed at small business owners and contains enough context for a structured initial analysis.',
  mainObjective:
    'Introduce the new product to small business owners using only the audience and launch context explicitly provided in the briefing.',
  targetAudience: ['Small business owners'],
  communicationPillars: [],
  suggestedActions: [
    'Define the product facts and launch message before producing campaign materials.',
  ],
  risks: [
    'The briefing does not provide product benefits, channels, budget or success metrics.',
  ],
};

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
  result?: BriefAnalysisResult;
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
    await mongoose.connect(process.env.MONGODB_URI);
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
    await mongoose.disconnect();
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

  it('processes POST -> BullMQ -> fake worker -> GET without a real provider', async () => {
    const workerRedis = new IORedis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      db: Number(process.env.REDIS_DB),
      maxRetriesPerRequest: null,
    });
    let analyzerCalls = 0;
    const integrationWorker = new Worker<AnalyzeBriefJobData>(
      BRIEF_ANALYSIS_QUEUE,
      createBriefProcessor({
        repository: briefRepository,
        analyzeBrief: () => {
          analyzerCalls += 1;
          return Promise.resolve(fakeAnalysis);
        },
      }),
      { connection: workerRedis },
    );

    try {
      await integrationWorker.waitUntilReady();
      const completedJob = new Promise<string | undefined>(
        (resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Fake worker did not complete the job')),
            5_000,
          );

          integrationWorker.once('completed', (job) => {
            clearTimeout(timeout);
            resolve(job.id);
          });
          integrationWorker.once('failed', (_job, error) => {
            clearTimeout(timeout);
            reject(error);
          });
        },
      );

      const auth = await registerTenant('worker-flow');
      const created = await createBrief(auth.accessToken);

      await expect(completedJob).resolves.toBe(created.id);
      const detailResponse = await request(app.getHttpServer())
        .get(`/briefs/${created.id}`)
        .set('Authorization', `Bearer ${auth.accessToken}`)
        .expect(200);

      expect(detailResponse.body as BriefDetailBody).toMatchObject({
        id: created.id,
        status: 'COMPLETED',
        attemptCount: 1,
        result: fakeAnalysis,
      });
      expect(analyzerCalls).toBe(1);
    } finally {
      await integrationWorker.close();
      await workerRedis.quit();
    }
  });

  it('does not claim or update a brief through another tenant', async () => {
    const auth = await registerTenant('repository-scope');
    const created = await createBrief(auth.accessToken);
    const otherTenantId = new Types.ObjectId().toHexString();

    await expect(
      briefRepository.startAttempt(created.id, otherTenantId),
    ).rejects.toMatchObject({
      code: 'BRIEF_NOT_FOUND',
      retryable: false,
    });

    const storedBrief = await connection.collection('briefs').findOne({
      _id: new Types.ObjectId(created.id),
    });
    expect(storedBrief).toMatchObject({
      status: 'PENDING',
      attemptCount: 0,
      tenantId: new Types.ObjectId(auth.user.tenant.id),
    });
  });

  it('does not replace COMPLETED with a late failure', async () => {
    const auth = await registerTenant('late-failure');
    const created = await createBrief(auth.accessToken);
    const scope = {
      _id: new Types.ObjectId(created.id),
      tenantId: new Types.ObjectId(auth.user.tenant.id),
    };
    await connection.collection('briefs').updateOne(scope, {
      $set: { status: 'PROCESSING' },
    });

    await expect(
      briefRepository.complete(created.id, auth.user.tenant.id, fakeAnalysis),
    ).resolves.toBe(true);
    await expect(
      briefRepository.fail(created.id, auth.user.tenant.id, {
        code: 'LLM_TIMEOUT',
        message: 'A late attempt timed out.',
        retryable: true,
      }),
    ).resolves.toBe(false);

    const storedBrief = await connection.collection('briefs').findOne(scope);
    expect(storedBrief).toMatchObject({
      status: 'COMPLETED',
      result: fakeAnalysis,
    });
    expect(storedBrief).not.toHaveProperty('error');
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
