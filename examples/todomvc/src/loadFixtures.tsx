function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(1) // determinstic fixtures

export default async function loadFixtures(database: {
  put: (arg0: any) => any
  allLists: { query: () => Promise<any> }
  todosByList: { query: () => Promise<any> }
}) {
  const nextId = (prefix = '') => prefix + rand().toString(32).slice(2)
  const listTitles = ['Building Apps', 'Having Fun', 'Getting Groceries']
  const todoTitles = [
    [
      'In the browser',
      'On the phone',
      'With or without Redux',
      'Login components',
      'GraphQL queries',
      'Automatic replication and versioning'
    ],
    ['Rollerskating meetup', 'Motorcycle ride', 'Write a sci-fi story with ChatGPT'],
    ['Macadamia nut milk', 'Avocado toast', 'Coffee', 'Bacon', 'Sourdough bread', 'Fruit salad']
  ]
  let ok: { id: any }
  for (let j = 0; j < 3; j++) {
    ok = await database.put({ title: listTitles[j], type: 'list', _id: nextId('' + j) })
    for (let i = 0; i < todoTitles[j].length; i++) {
      await database.put({
        _id: nextId(),
        title: todoTitles[j][i],
        listId: ok.id,
        completed: rand() > 0.75,
        type: 'todo',
        createdAt: '2' + i
      })
    }
  }

  await reproduceBug(database)
}

const reproduceBug = async (database) => {
  const id = '02pkji8'
  const doc = await database.get(id)
  // (await database.put({ completed: !completed, ...doc }))
  const ok = await database.put(doc)
  await database.todosByList.query({
    range: [1, 2]
  })
  const ok2 = await database.put(doc)
  await database.todosByList.query({
    range: [1, 2]
  })
  console.log('ok', ok)
}
