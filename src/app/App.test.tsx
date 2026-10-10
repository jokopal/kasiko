import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the kasir placeholder on the root route', () => {
    render(<App />)
    expect(screen.getByText(/area kasir/i)).toBeInTheDocument()
  })
})
