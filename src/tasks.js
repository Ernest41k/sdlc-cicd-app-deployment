// Pure business logic - easy to unit test without starting a server.

function validateTask(input) {
  const errors = [];
  if (!input || typeof input.title !== 'string' || input.title.trim() === '') {
    errors.push('title is required');
  } else if (input.title.length > 100) {
    errors.push('title must be 100 characters or fewer');
  }
  return errors;
}

function createTaskStore() {
  const tasks = [];
  let nextId = 1;

  return {
    list: () => tasks,
    add(title) {
      const task = { id: nextId++, title: title.trim(), done: false };
      tasks.push(task);
      return task;
    },
    toggle(id) {
      const task = tasks.find((t) => t.id === id);
      if (task) task.done = !task.done;
      return task;
    },
  };
}

module.exports = { validateTask, createTaskStore };
