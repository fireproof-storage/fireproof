import { useState } from 'react'
import { useLoading, useProduceState } from '../hooks'

import { Fireproof, Index } from '../../../../'

// Fixture data
const lists = [
  {
    _id: 'bc6c751d-5461-4a32-b6e1-6e76b39107d5',
    data: {
      title: 'My Todo List',
      owner: 'did:github:jchris'
    },
  },
  {
    _id: '3722a2a2-025d-44b9-a0cc-ec43b9d15422',
    data: {
      title: 'Another Todo List',
      owner: 'did:github:jchris'
    },
  }
]

const todos = [
  {
    _id: 'f77d6f69-b92d-4cf1-98c5-925bea74e203',
    data: {
      title: 'My Todo',
      list: 'bc6c751d-5461-4a32-b6e1-6e76b39107d5',
      completed: false
    },
  },
  {
    _id: '1d5e5dc5-c5a4-4c7f-90ba-1ad8d3636b21',
    data: {
      title: 'Another Todo',
      list: 'bc6c751d-5461-4a32-b6e1-6e76b39107d5',
      completed: true
    },
  },
  {
    _id: '87a0d3a3-57c3-42b1-8a87-c56b2627f78d',
    data: {
      title: 'Yet Another Todo',
      list: '3722a2a2-025d-44b9-a0cc-ec43b9d15422',
      completed: false
    },
  }
]

const defineDatabase = async () => {
  const database = await Fireproof.storage()
  database.byType = new Index(database, function (doc, map) {
    map(doc.type)
  })
  database.byList = new Index(database, function (doc, map) {
    if (doc.type === 'todo') {
      map(doc.listId)
    }
  })
  return database
}

export default function useFireproof () {
  const [listsState, setLists] = useState(lists)
  const [database, setDatabase] = useProduceState(null, doListQuery)
  const [isLoading, load] = useLoading()
  const onAuthChange = async () => {
    setDatabase(defineDatabase())
  }

  async function doListQuery () {
    // Simulate a delay
    const lists = await database.byType.get('list')
    console.log('lists', lists)

    if (listsState.length === 0) {
      const me = '456'
      const defaultList = {
        _id: Math.floor(Math.random() * 1000).toString(),
        data: {
          title: 'Default Todo List',
          owner: me
        },
      }
      listsState.push(defaultList)
      await addTodo(defaultList, defaultList._id)('Default Todo')
    }

    setLists(listsState)
  }

  const fetchList = async (_id) => {
    // Simulate a delay
    await new Promise((resolve) => setTimeout(resolve, 100))
    const list = listsState.find((l) => l._id === _id) // todo load from db
    const todosForList = todos.filter((todo) => todo.data.list === _id)
    console.log('new state', { list, todos: todosForList })
    return { list, todos: todosForList }
  }

  const addList = async (title) => {
    const newList = {
      _id: {
        value: Math.floor(Math.random() * 1000).toString()
      },
      data: {
        title,
        owner: 'did:github:jchris'
      },
    }
    // Simulate a delay
    await new Promise((resolve) => setTimeout(resolve, 100))
    setLists([...listsState, newList]) // todo save to db
    await doListQuery()
  }

  const addTodo = async (list, _id) => async (title) => {
    const newTodo = {
      _id: {
        value: Math.floor(Math.random() * 1000).toString()
      },
      data: {
        title,
        list: list._id,
        completed: false
      },
    }
    // Simulate a delay
    await new Promise((resolve) => setTimeout(resolve, 100))
    todos.push(newTodo)
    return await fetchList(_id)
  }

  const toggle = async (todoToToggle, _id) => {
    const todo = todos.find((t) => t._id === todoToToggle._id)
    todo.data.completed = !todo.data.completed
    // Simulate a delay
    await new Promise((resolve) => setTimeout(resolve, 100))
    return await fetchList(_id)
  }
  const destroy = async (todo, _id) => {
    const todoIndex = todos.findIndex((t) => t._id === todo._id)
    if (todoIndex !== -1) {
      todos.splice(todoIndex, 1)
    }
    // Simulate a delay
    await new Promise((resolve) => setTimeout(resolve, 100))
    return await fetchList(_id)
  }

  const save = async (text) => async (todoToSave, _id) => {
    const todoIndex = todos.findIndex((t) => t._id === todoToSave._id)
    if (todoIndex !== -1) {
      todos[todoIndex].data.title = text
    }
    // Simulate a delay
    await new Promise((resolve) => setTimeout(resolve, 100))
    return await fetchList(_id)
  }

  const clearCompleted = async (list, _id) => {
    const todosToDelete = todos.filter((todo) => todo.data.list === list._id && todo.data.completed)
    todosToDelete.forEach((todoToDelete) => {
      const todoIndex = todos.findIndex((t) => t._id === todoToDelete._id)
      if (todoIndex !== -1) {
        todos.splice(todoIndex, 1)
      }
    })
    // Simulate a delay
    await new Promise((resolve) => setTimeout(resolve, 100))
    return await fetchList(_id)
  }

  return {
    lists: listsState,
    // list,
    fetchList,
    addList,
    addTodo,
    // toggleAll,
    doListQuery,
    load,
    toggle,
    destroy,
    save,
    clearCompleted,
    onAuthChange,
    isLoading
    // client,
  }
}
