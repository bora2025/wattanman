import { REQUIRES_ADDON_KEY, SKIP_ADDON_CHECK_KEY } from '../school-addons/requires-addon.decorator';
import { ClassesController } from './classes.controller';

describe('ClassesController extension boundaries', () => {
  it('gates class management behind the Class Management extension', () => {
    expect(Reflect.getMetadata(REQUIRES_ADDON_KEY, ClassesController)).toBe('CLASSES');
  });

  it.each(['getClasses', 'getMyClasses', 'getStudentsInClass', 'getStudentsByClasses'])(
    'keeps shared capability %s available to dependent extensions',
    (method) => {
      expect(
        Reflect.getMetadata(
          SKIP_ADDON_CHECK_KEY,
          ClassesController.prototype[method],
        ),
      ).toBe(true);
    },
  );

  it.each([
    'updateStudent',
    'addStudentToClass',
    'bulkAddStudentsFromCsv',
    'cleanupOrphanedStudents',
    'removeStudentFromClass',
    'getAvailableStudents',
  ])('assigns student operation %s to Student Portal', (method) => {
    expect(
      Reflect.getMetadata(
        REQUIRES_ADDON_KEY,
        ClassesController.prototype[method],
      ),
    ).toBe('STUDENT_PORTAL');
  });
});
