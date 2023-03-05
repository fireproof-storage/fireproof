import { Fireproof } from '@fireproof/core'

export function makeQueryFunctions(database: Fireproof) {
  const fetchAllLists = async () => {
    console.log('fetchAllLists', database.allLists)
    const lists = await database.allLists.query({ range: ['list', 'listx'] })
    return lists.rows.map((row) => row.value)
  }

  const fetchListWithTodos = async (_id) => {
    const list = await database.get(_id)
    const todos = await database.todosbyList.query({
      range: [
        [_id, '0'],
        [_id, '9'],
      ],
    })
    return { list, todos: todos.rows.map((row) => row.value) }
  }

  const addList = async (title) => {
    return await database.put({ title, type: 'list' })
  }

  const addTodo = async (listId, title) => {
    return await database.put({ completed: false, title, listId, type: 'todo', createdAt: new Date().toISOString() })
  }

  const toggle = async ({ completed, ...doc }) => {
    return await database.put({ completed: !completed, ...doc })
  }

  const destroy = async ({ _id }) => {
    return await database.del(_id)
  }

  const updateTitle = async (doc, title) => {
    doc.title = title
    return await database.put(doc)
  }

  const clearCompleted = async (listId) => {
    const todos = (
      await database.todosbyList.query({
        range: [
          [listId, '1'],
          [listId, 'x'],
        ],
      })
    ).rows.map((row) => row.value)
    const todosToDelete = todos.filter((todo) => todo.completed)
    for (const todoToDelete of todosToDelete) {
      await database.del(todoToDelete._id)
    }
  }
  return {
    fetchAllLists,
    fetchListWithTodos,
    addList,
    addTodo,
    toggle,
    destroy,
    updateTitle,
    clearCompleted,
  }
}
