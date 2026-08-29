import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const validBriefPayload = {
  title: 'Product launch campaign',
  brief: 'We need to introduce the new product to small business owners.',
};

interface CreateBriefResponseBody {
  id: string;
  status: string;
}

interface BriefListItemBody extends CreateBriefResponseBody {
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface BriefDetailBody extends BriefListItemBody {
  brief: string;
}

describe('App (e2e)', () => {
  let app: INestApplication<App>;
  let connection: Connection;

  async function createBrief(): Promise<CreateBriefResponseBody> {
    const response = await request(app.getHttpServer())
      .post('/briefs')
      .send(validBriefPayload)
      .expect(202);

    return response.body as CreateBriefResponseBody;
  }

  beforeAll(async () => {
    process.env.MONGODB_URI =
      'mongodb://localhost:27017/ai_brief_processor_test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    connection = moduleFixture.get<Connection>(getConnectionToken());
    await app.init();
  });

  afterEach(async () => {
    await connection.collection('briefs').deleteMany({});
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/briefs (POST) persists a pending brief', async () => {
    const responseBody = await createBrief();

    expect(Types.ObjectId.isValid(responseBody.id)).toBe(true);
    expect(responseBody.status).toBe('PENDING');

    const storedBrief = await connection.collection('briefs').findOne({
      _id: new Types.ObjectId(responseBody.id),
    });

    expect(storedBrief).not.toBeNull();
    expect(storedBrief?.title).toBe(validBriefPayload.title);
    expect(storedBrief?.brief).toBe(validBriefPayload.brief);
    expect(storedBrief?.status).toBe('PENDING');
  });

  it('/briefs (POST) rejects invalid input', async () => {
    await request(app.getHttpServer())
      .post('/briefs')
      .send({
        title: 'x',
        brief: 'too short',
      })
      .expect(400);

    await expect(
      connection.collection('briefs').countDocuments(),
    ).resolves.toBe(0);
  });

  it('/briefs (GET) lists brief summaries', async () => {
    const createdBrief = await createBrief();

    const response = await request(app.getHttpServer())
      .get('/briefs')
      .expect(200);
    const responseBody = response.body as BriefListItemBody[];

    expect(responseBody).toHaveLength(1);
    expect(responseBody[0]).toMatchObject({
      id: createdBrief.id,
      title: validBriefPayload.title,
      status: 'PENDING',
    });
    expect(responseBody[0]).not.toHaveProperty('brief');
    expect(typeof responseBody[0].createdAt).toBe('string');
    expect(typeof responseBody[0].updatedAt).toBe('string');
  });

  it('/briefs/:id (GET) returns the complete brief', async () => {
    const createdBrief = await createBrief();

    const response = await request(app.getHttpServer())
      .get(`/briefs/${createdBrief.id}`)
      .expect(200);
    const responseBody = response.body as BriefDetailBody;

    expect(responseBody).toMatchObject({
      id: createdBrief.id,
      title: validBriefPayload.title,
      brief: validBriefPayload.brief,
      status: 'PENDING',
    });
  });

  it('/briefs/:id (GET) distinguishes invalid and missing ids', async () => {
    await request(app.getHttpServer())
      .get('/briefs/not-an-object-id')
      .expect(400);

    await request(app.getHttpServer())
      .get(`/briefs/${new Types.ObjectId().toString()}`)
      .expect(404);
  });

  it('/briefs/:id (PATCH) updates only editable fields', async () => {
    const createdBrief = await createBrief();

    const response = await request(app.getHttpServer())
      .patch(`/briefs/${createdBrief.id}`)
      .send({ title: '  Updated launch campaign  ' })
      .expect(200);
    const responseBody = response.body as BriefDetailBody;

    expect(responseBody.title).toBe('Updated launch campaign');
    expect(responseBody.brief).toBe(validBriefPayload.brief);
    expect(responseBody.status).toBe('PENDING');

    const storedBrief = await connection.collection('briefs').findOne({
      _id: new Types.ObjectId(createdBrief.id),
    });

    expect(storedBrief?.title).toBe('Updated launch campaign');
  });

  it('/briefs/:id (PATCH) rejects empty or server-controlled changes', async () => {
    const createdBrief = await createBrief();

    await request(app.getHttpServer())
      .patch(`/briefs/${createdBrief.id}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/briefs/${createdBrief.id}`)
      .send({ status: 'COMPLETED' })
      .expect(400);
  });

  it('/briefs/:id (DELETE) removes the brief', async () => {
    const createdBrief = await createBrief();

    await request(app.getHttpServer())
      .delete(`/briefs/${createdBrief.id}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/briefs/${createdBrief.id}`)
      .expect(404);

    await expect(
      connection.collection('briefs').countDocuments(),
    ).resolves.toBe(0);
  });
});
