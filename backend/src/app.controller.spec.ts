import { AppController } from './app.controller';

describe('AppController health probes', () => {
  const prisma = { $queryRaw: jest.fn() };
  const controller = new AppController({ getHello: () => 'Hello World!' } as any, prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('reports liveness without accessing dependencies', () => {
    expect(controller.getLiveness()).toMatchObject({ status: 'ok', service: 'SchoolSync API' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports readiness only after the database responds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(controller.getReadiness()).resolves.toMatchObject({
      status: 'ready',
      dependencies: { database: 'ready' },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('fails readiness when the database is unavailable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));
    await expect(controller.getReadiness()).rejects.toThrow('database unavailable');
  });
});
