import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Client } from 'pg';

describe('Testcontainers spike: ephemeral Postgres', () => {
  let container: StartedPostgreSqlContainer;
  let client: Client;

  beforeAll(async () => {
    // TODO: start a postgres:17 container, then connect a pg Client to it
    container = await new PostgreSqlContainer('postgres:17').start();
    const connectionString = container.getConnectionUri();
    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    // TODO: end the client, stop the container
    await client.end();
    await container.stop();
  });

  it('writes and reads a row', async () => {
    // TODO: CREATE TABLE, INSERT a row, SELECT it, expect(...) the value
    await client.query(`
        CREATE TABLE uploads (
        id SERIAL PRIMARY KEY,
        text VARCHAR(255) NOT NULL
        )`);
    await client.query(`INSERT INTO uploads (text) VALUES ($1)`, [
      'Hello, world!',
    ]);
    const res = await client.query(`SELECT text FROM uploads LIMIT 1`);

    expect(res.rows[0].text).toBe('Hello, world!');
  });
});
