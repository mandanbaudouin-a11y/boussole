// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthScreen from '../../src/components/AuthScreen'
import { LanguageProvider } from '../../src/i18n/LanguageContext'

beforeEach(() => {
  window.localStorage.clear()
})

function renderAuth(props) {
  return render(
    <LanguageProvider>
      <AuthScreen {...props} />
    </LanguageProvider>
  )
}

describe('AuthScreen — connexion', () => {
  it("appelle onSubmit avec le nom d'utilisateur, le mot de passe et le role choisi", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue()
    renderAuth({ mode: 'login', onSubmit })

    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'prof')
    await user.type(screen.getByLabelText('Mot de passe'), 'test1234')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(onSubmit).toHaveBeenCalledWith('prof', 'test1234', 'enseignant')
  })

  it('transmet le role EA quand il est selectionne', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue()
    renderAuth({ mode: 'login', onSubmit })

    await user.click(screen.getByRole('button', { name: 'EA' }))
    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'assistant')
    await user.type(screen.getByLabelText('Mot de passe'), 'test1234')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(onSubmit).toHaveBeenCalledWith('assistant', 'test1234', 'ea')
  })

  it('affiche le message d erreur passe en prop', () => {
    renderAuth({ mode: 'login', onSubmit: vi.fn(), message: 'Session expirée, reconnectez-vous.' })
    expect(screen.getByText('Session expirée, reconnectez-vous.')).toBeInTheDocument()
  })

  it("affiche l erreur renvoyee par onSubmit sans planter", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new Error('Nom d\'utilisateur ou mot de passe incorrect.'))
    renderAuth({ mode: 'login', onSubmit })

    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'prof')
    await user.type(screen.getByLabelText('Mot de passe'), 'mauvais')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByText("Nom d'utilisateur ou mot de passe incorrect.")).toBeInTheDocument()
  })
})

describe('AuthScreen — creation de compte (validation cote client)', () => {
  async function fillMinimalValidSetup(user) {
    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'prof')
    await user.type(screen.getByLabelText('Mot de passe'), 'test1234')
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'test1234')
    await user.type(screen.getByLabelText('Nom complet'), 'Baudouin Mandan')
    await user.type(screen.getByLabelText('Courriel'), 'prof@ecole.ca')
  }

  it("refuse un nom d'utilisateur trop court sans appeler onSubmit", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderAuth({ mode: 'setup', onSubmit })

    await fillMinimalValidSetup(user)
    await user.clear(screen.getByLabelText("Nom d'utilisateur"))
    await user.type(screen.getByLabelText("Nom d'utilisateur"), 'ab')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText("Le nom d'utilisateur doit contenir au moins 3 caractères.")).toBeInTheDocument()
  })

  it('refuse une confirmation de mot de passe qui ne correspond pas', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderAuth({ mode: 'setup', onSubmit })

    await fillMinimalValidSetup(user)
    await user.clear(screen.getByLabelText('Confirmer le mot de passe'))
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'autre-chose')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Les deux mots de passe ne correspondent pas.')).toBeInTheDocument()
  })

  it('appelle onSubmit avec le profil quand tout est valide', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue()
    renderAuth({ mode: 'setup', onSubmit })

    await fillMinimalValidSetup(user)
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    expect(onSubmit).toHaveBeenCalledWith(
      'prof',
      'test1234',
      undefined,
      expect.objectContaining({ nomComplet: 'Baudouin Mandan', courriel: 'prof@ecole.ca' })
    )
  })
})
