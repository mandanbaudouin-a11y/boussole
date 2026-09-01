// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LanguageToggle from '../../src/components/LanguageToggle'
import { LanguageProvider } from '../../src/i18n/LanguageContext'

beforeEach(() => {
  window.localStorage.clear()
})

function renderToggle() {
  return render(
    <LanguageProvider>
      <LanguageToggle />
    </LanguageProvider>
  )
}

describe('LanguageToggle', () => {
  it('demarre en français par defaut', () => {
    renderToggle()
    expect(screen.getByRole('button', { name: 'FR' })).toHaveClass('active')
    expect(screen.getByRole('button', { name: 'EN' })).not.toHaveClass('active')
  })

  it('passe en anglais au clic et le memorise', async () => {
    const user = userEvent.setup()
    renderToggle()
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('button', { name: 'EN' })).toHaveClass('active')
    expect(window.localStorage.getItem('repere-lang')).toBe('en')
  })
})
