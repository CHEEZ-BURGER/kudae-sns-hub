import { describe, expect, it } from 'vitest';
import { adminEmailForId, isValidAdminId, normalizeAdminId } from './admin-auth';

describe('admin ID helpers', () => {
  it('normalizes an ID and maps it to a non-deliverable auth email', () => {
    expect(normalizeAdminId('  Desk.Editor_1 ')).toBe('desk.editor_1');
    expect(adminEmailForId('Desk.Editor_1')).toBe('desk.editor_1@admin.kudae.invalid');
  });

  it('rejects unsafe or ambiguous IDs', () => {
    expect(isValidAdminId('ab')).toBe(false);
    expect(isValidAdminId('desk editor')).toBe(false);
    expect(isValidAdminId('desk@kunews.ac.kr')).toBe(false);
  });
});
