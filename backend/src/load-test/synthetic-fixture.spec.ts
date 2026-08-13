import { CERTIFICATION_SCALE, fixtureManifest, schoolFixture } from './synthetic-fixture';

describe('synthetic load fixture', () => {
  it('is deterministic and tenant-explicit', () => {
    const first = schoolFixture('certification-2026', 7, { ...CERTIFICATION_SCALE, usersPerSchool: 10 });
    expect(schoolFixture('certification-2026', 7, { ...CERTIFICATION_SCALE, usersPerSchool: 10 })).toEqual(first);
    expect(first.users.every((row) => row.schoolId === first.school.id)).toBe(true);
    expect(first.records.every((row) => row.schoolId === first.school.id)).toBe(true);
  });

  it('defines the approved 1,000-school and 500,000-user certification scale', () => {
    expect(fixtureManifest('certification-2026', CERTIFICATION_SCALE).totals).toEqual(expect.objectContaining({ schools: 1000, users: 500000, installations: 8000 }));
  });
});
