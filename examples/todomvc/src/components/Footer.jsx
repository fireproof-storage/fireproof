import React from 'react'
import { Link } from 'react-router-dom'
import classNames from 'classnames'

function TodoFooter ({ count, completedCount, onClearCompleted, nowShowing }) {
  const activeTodoWord = count > 1 ? 'items' : 'item'
  let clearButton = null

  if (completedCount > 0) {
    clearButton = (
      <button className='clear-completed' onClick={onClearCompleted}>
        Clear completed
      </button>
    )
  }

  return (
    <footer className='footer'>
      <span className='todo-count'>
        <strong>{count}</strong> {activeTodoWord} left
      </span>
      <ul className='filters'>
        <li>
          <Link to='' className={classNames({ selected: nowShowing === 'all' })}>
            All
          </Link>
        </li>{' '}
        <li>
          <Link to={`${nowShowing === 'active' ? '../' : ''}active`} className={classNames({ selected: nowShowing === 'active' })}>
            Active
          </Link>
        </li>{' '}
        <li>
          <Link to={`${nowShowing === 'completed' ? '../' : ''}completed`} className={classNames({ selected: nowShowing === 'completed' })}>
            Completed
          </Link>
        </li>
      </ul>
      {clearButton}
    </footer>
  )
}

export default TodoFooter
