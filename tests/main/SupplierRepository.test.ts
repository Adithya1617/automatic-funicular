import { describe, expect, it } from 'vitest';
import { supplierRepository } from '../../main/repositories/supplierRepository';

describe('supplierRepository.findByGstin', () => {
  it('exists and is callable', () => {
    expect(typeof supplierRepository.findByGstin).toBe('function');
  });
});
