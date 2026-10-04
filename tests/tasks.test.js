// UNIT tests: test small pieces of logic in isolation.
const { validateTask, createTaskStore } = require('../src/tasks');

describe('validateTask', () => {
  test('accepts a valid task', () => {
    expect(validateTask({ title: 'Write tests' })).toEqual([]);
  });

  test('rejects a missing title', () => {
    expect(validateTask({})).toContain('title is required');
  });

  test('rejects a blank title', () => {
    expect(validateTask({ title: '   ' })).toContain('title is required');
  });

  test('rejects a title that is too long', () => {
    expect(validateTask({ title: 'x'.repeat(101) })).toContain(
      'title must be 100 characters or fewer'
    );
  });
});

describe('task store', () => {
  test('adds tasks with incrementing ids', () => {
    const store = createTaskStore();
    expect(store.add('a').id).toBe(1);
    expect(store.add('b').id).toBe(2);
    expect(store.list()).toHaveLength(2);
  });

  test('toggles a task', () => {
    const store = createTaskStore();
    const task = store.add('a');
    expect(store.toggle(task.id).done).toBe(true);
    expect(store.toggle(task.id).done).toBe(false);
  });

  test('returns undefined when toggling an unknown task', () => {
    expect(createTaskStore().toggle(99)).toBeUndefined();
  });
});
