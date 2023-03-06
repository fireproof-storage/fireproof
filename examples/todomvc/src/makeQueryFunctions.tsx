import { Fireproof } from '@fireproof/core'

export function makeQueryFunctions({ ready, database }): {
  fetchAllLists: () => Promise<any>
  fetchListWithTodos: (_id: any) => Promise<{ list: any; todos: any }>
  addList: (title: any) => Promise<any>
  addTodo: (listId: any, title: any) => Promise<any>
  toggle: ({ completed, ...doc }: { [x: string]: any; completed: any }) => Promise<any>
  destroy: ({ _id }: { _id: any }) => Promise<any>
  updateTitle: (doc: any, title: any) => Promise<any>
  clearCompleted: (listId: any) => Promise<void>
} {
  const fetchAllLists = async () => {
    const lists = ready && database.allLists ? await database.allLists.query({ range: ['list', 'listx'] }) : []
    return lists.rows.map(({ value }) => value)
  }

  const fetchListWithTodos = async (_id) => {
    if (!ready || !database.todosByList)
      return Promise.resolve({ list: { title: '', type: 'list', _id: '' }, todos: [] })

    const list = await database.get(_id)
    const todos = await database.todosByList.query({
      range: [
        [_id, '0'],
        [_id, '9'],
      ],
    })
    return { list, todos: todos.rows.map((row) => row.value) }
  }

  const addList = async (title) => {
    return ready && (await database.put({ title, type: 'list' }))
  }

  const addTodo = async (listId, title) => {
    return (
      ready &&
      (await database.put({ completed: false, title, listId, type: 'todo', createdAt: new Date().toISOString() }))
    )
  }

  const toggle = async ({ completed, ...doc }) => {
    return ready && (await database.put({ completed: !completed, ...doc }))
  }

  const destroy = async ({ _id }) => {
    return ready && (await database.del(_id))
  }

  const updateTitle = async (doc, title) => {
    doc.title = title
    return ready && (await database.put(doc))
  }

  const clearCompleted = async (listId) => {
    const todos = (
      (await ready) &&
      database.todosByList.query({
        range: [
          [listId, '1'],
          [listId, 'x'],
        ],
      })
    ).rows.map((row) => row.value)
    const todosToDelete = todos.filter((todo) => todo.completed)
    for (const todoToDelete of todosToDelete) {
      ;(await ready) && database.del(todoToDelete._id)
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
