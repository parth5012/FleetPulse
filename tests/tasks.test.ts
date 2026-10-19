import { describe, it, expect } from 'vitest';

describe('tasks and services helpers', () => {
  it('builds query params for task filters correctly', () => {
    const params = new URLSearchParams({
      sort_by: 'memory',
      order: 'desc',
      limit: '50',
    });
    params.set('search', 'uvicorn');
    expect(params.toString()).toBe('sort_by=memory&order=desc&limit=50&search=uvicorn');
  });

  it('builds query params for service scope correctly', () => {
    const params = new URLSearchParams({
      scope: 'user',
      state: 'running',
      sort_by: 'ram',
      order: 'desc',
    });
    expect(params.get('scope')).toBe('user');
    expect(params.get('sort_by')).toBe('ram');
  });
});
