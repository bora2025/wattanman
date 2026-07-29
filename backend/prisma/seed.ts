import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../src/tenancy/constants';

const prisma = new PrismaClient();

async function main() {
  // Platform sentinel row — see backend/src/tenancy/constants.ts. Not a real school;
  // exists so PLATFORM_ADMIN users have a non-null schoolId.
  await prisma.school.upsert({
    where: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN },
    update: {},
    create: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN, name: 'Wattaman Platform' },
  });

  // Dev/test school — the tenant all the seeded demo users/data below belong to.
  const school = await prisma.school.upsert({
    where: { subdomain: 'demo' },
    update: {},
    create: { subdomain: 'demo', name: 'Demo School' },
  });
  const schoolId = school.id;

  // Create default departments (per-school — see Department's @@unique([schoolId, name]))
  const departments = [
    { name: 'Human Resources', nameKh: 'ធនធានមនុស្ស', description: 'HR & personnel management' },
    { name: 'Finance', nameKh: 'ហិរញ្ញវត្ថុ', description: 'Accounting & finance' },
    { name: 'Administration', nameKh: 'រដ្ឋបាល', description: 'Administration & operations' },
    { name: 'Security', nameKh: 'សន្តិសុខ', description: 'Security & safety' },
    { name: 'Academics', nameKh: 'សិក្សា', description: 'Academic affairs' },
    { name: 'IT', nameKh: 'ព័ត៌មានវិទ្យា', description: 'Information technology' },
    { name: 'Maintenance', nameKh: 'ថែទាំ', description: 'Facilities & maintenance' },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { schoolId_name: { schoolId, name: dept.name } },
      update: {},
      create: { ...dept, schoolId },
    });
  }
  console.log('Departments seeded');

  // Create users
  const admin = await prisma.user.create({
    data: {
      schoolId,
      email: 'admin@test.com',
      password: await bcrypt.hash('password', 10),
      name: 'Admin',
      role: 'ADMIN',
    },
  });

  const teacher = await prisma.user.create({
    data: {
      schoolId,
      email: 'teacher@test.com',
      password: await bcrypt.hash('password', 10),
      name: 'Teacher',
      role: 'TEACHER',
    },
  });

  const studentUser = await prisma.user.create({
    data: {
      schoolId,
      email: 'student@test.com',
      password: await bcrypt.hash('password', 10),
      name: 'Student',
      role: 'STUDENT',
    },
  });

  const parent = await prisma.user.create({
    data: {
      schoolId,
      email: 'parent@test.com',
      password: await bcrypt.hash('password', 10),
      name: 'Parent',
      role: 'PARENT',
    },
  });

  // Create class
  const class1 = await prisma.class.create({
    data: {
      schoolId,
      name: 'Class 1',
      teacherId: teacher.id,
    },
  });

  // Create student
  const student = await prisma.student.create({
    data: {
      schoolId,
      userId: studentUser.id,
      classId: class1.id,
      parentId: parent.id,
      qrCode: 'QR123', // Placeholder
    },
  });

  console.log('Test data created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
