import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication<App>;
  let connection: Connection;

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
    const response = await request(app.getHttpServer())
      .post('/briefs')
      .send({
        title: 'Product launch campaign',
        brief: 'We need to introduce the new product to small business owners.',
      })
      .expect(202);
    const responseBody = response.body as { id: string; status: string };

    expect(Types.ObjectId.isValid(responseBody.id)).toBe(true);
    expect(responseBody.status).toBe('PENDING');

    const storedBrief = await connection.collection('briefs').findOne({
      _id: new Types.ObjectId(responseBody.id),
    });

    expect(storedBrief).not.toBeNull();
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
});
