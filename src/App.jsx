import { useEffect, useState } from 'react'
import { api } from './api'
import { auth } from './auth'
import { useIdleTimer } from './hooks/useIdleTimer'
import { useRoute, studentIdFromPath, studentPath } from './router'
import { useLanguage } from './i18n/LanguageContext'
import AuthScreen from './components/AuthScreen'
import Dashboard from './components/Dashboard'
import StudentPage from './components/StudentPage'
import AccountsAdmin from './components/AccountsAdmin'
import UpcomingReviews from './components/UpcomingReviews'
import CompletionDashboard from './components/CompletionDashboard'
import LanguageToggle from './components/LanguageToggle'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000

const ROLE_LABELS = { enseignant: 'Enseignant', ea: 'EA', direction: 'Direction' }

export default function App() {
  const { t } = useLanguage()
  const [authStatus, setAuthStatus] = useState('loading') // loading | setup | login | authenticated
  const [authMessage, setAuthMessage] = useState(null)
  const [username, setUsername] = useState(null)
  const [role, setRole] = useState(null) // 'enseignant' | 'ea'

  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { path, navigate } = useRoute()
  const [strategiesLibrary, setStrategiesLibrary] = useState([])
  const [adaptationsLibrary, setAdaptationsLibrary] = useState([])
  const [forcesBesoinsLibrary, setForcesBesoinsLibrary] = useState([])

  // Détermine l'écran d'accueil par défaut : un collaborateur non-propriétaire
  // avec au moins une assignation active (typiquement un enseignant-ressource
  // suivant plusieurs classes) atterrit sur le Tour de contrôle plutôt que le
  // tableau de bord standard. landedOnDefault évite de refaire cette
  // redirection si l'utilisateur navigue ensuite lui-même vers "/".
  const [defaultView, setDefaultView] = useState(null)
  const [landedOnDefault, setLandedOnDefault] = useState(false)

  useEffect(() => {
    auth
      .status()
      .then((s) => {
        if (s.needsSetup) setAuthStatus('setup')
        else if (s.authenticated) {
          setUsername(s.username)
          setRole(s.role)
          setAuthStatus('authenticated')
        } else {
          setAuthStatus('login')
        }
      })
      .catch(() => setAuthStatus('login'))
  }, [])

  const loadStudents = () => {
    setLoading(true)
    return api
      .getStudents()
      .then(setStudents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    loadStudents()
    api.getStrategiesLibrary().then(setStrategiesLibrary).catch((e) => setError(e.message))
    api.getAdaptationsLibrary().then(setAdaptationsLibrary).catch((e) => setError(e.message))
    api.getForcesBesoinsLibrary().then(setForcesBesoinsLibrary).catch((e) => setError(e.message))
  }, [authStatus])

  useEffect(() => {
    // Ne calcule (et ne fige) rien tant qu'on n'est pas réellement connecté —
    // sinon la valeur provisoire "/" posée ici pendant l'écran de connexion
    // ferait croire à l'effet de redirection ci-dessous que la décision est
    // déjà prise, avant même que le vrai calcul (profil + assignations) ait
    // eu lieu.
    if (authStatus !== 'authenticated') return
    // Direction voit toute l'école sans assignation — contrairement à
    // l'enseignant-ressource, la destination ne dépend d'aucun appel
    // supplémentaire (profil/assignations), toujours le Tour de contrôle.
    if (role === 'direction') {
      setDefaultView('/tour-de-controle')
      return
    }
    if (role !== 'enseignant') {
      setDefaultView('/')
      return
    }
    auth
      .getProfile()
      .then(async (profile) => {
        if (profile.isOwner) return setDefaultView('/')
        const assignments = await auth.getAssignments()
        const hasResourceAssignment = assignments.some((a) => a.resourceUsername === username)
        setDefaultView(hasResourceAssignment ? '/tour-de-controle' : '/')
      })
      .catch(() => setDefaultView('/'))
  }, [authStatus, role, username])

  // Redirection unique à la connexion (pas à chaque retour manuel sur "/").
  useEffect(() => {
    if (landedOnDefault || !defaultView || path !== '/') return
    setLandedOnDefault(true)
    if (defaultView !== '/') navigate(defaultView)
  }, [defaultView, landedOnDefault, path])

  // Un lien vers un élève supprimé ou inexistant retombe sur le tableau de bord
  // plutôt que d'afficher une page cassée.
  useEffect(() => {
    if (loading) return
    const studentId = studentIdFromPath(path)
    if (studentId && !students.find((s) => s.id === studentId)) {
      navigate('/')
    }
  }, [path, students, loading])

  const handleDataRestored = () => {
    navigate('/')
    loadStudents()
  }

  const withErrorHandling = (fn) => async (...args) => {
    try {
      await fn(...args)
    } catch (e) {
      if (e.authRequired) {
        setAuthStatus('login')
        setAuthMessage(t('Votre session a expiré. Veuillez vous reconnecter.'))
      } else {
        setError(e.message)
      }
    }
  }

  const handleSetup = async (usernameInput, password, _role, profile) => {
    const result = await auth.setup(usernameInput, password, profile)
    setUsername(result.username)
    setRole(result.role)
    setAuthMessage(null)
    setAuthStatus('authenticated')
  }

  const handleLogin = async (usernameInput, password, roleInput) => {
    const result = await auth.login(usernameInput, password, roleInput)
    setUsername(result.username)
    setRole(result.role)
    setAuthMessage(null)
    setAuthStatus('authenticated')
  }

  const handleLogout = async (message) => {
    try {
      await auth.logout()
    } catch {
      // la session locale est de toute façon réinitialisée ci-dessous
    }
    setStudents([])
    navigate('/')
    setUsername(null)
    setRole(null)
    setDefaultView(null)
    setLandedOnDefault(false)
    setAuthMessage(message || null)
    setAuthStatus('login')
  }

  useIdleTimer(
    IDLE_TIMEOUT_MS,
    () => handleLogout(t("Déconnexion automatique après 30 minutes d'inactivité.")),
    authStatus === 'authenticated'
  )

  const addGoal = withErrorHandling(async (studentId, label) => {
    const goal = await api.createGoal(studentId, label)
    setStudents((prev) => prev.map((s) => (s.id !== studentId ? s : { ...s, goals: [...s.goals, goal] })))
  })

  const editGoal = withErrorHandling(async (studentId, goalId, label) => {
    const updated = await api.updateGoal(goalId, { label })
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId ? s : { ...s, goals: s.goals.map((g) => (g.id === goalId ? updated : g)) }
      )
    )
  })

  const changeGoalStatus = withErrorHandling(async (studentId, goalId, status) => {
    const updated = await api.updateGoal(goalId, { status })
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId ? s : { ...s, goals: s.goals.map((g) => (g.id === goalId ? updated : g)) }
      )
    )
  })

  const removeGoal = withErrorHandling(async (studentId, goalId) => {
    await api.deleteGoal(goalId)
    setStudents((prev) =>
      prev.map((s) => (s.id !== studentId ? s : { ...s, goals: s.goals.filter((g) => g.id !== goalId) }))
    )
  })

  const addStrategy = withErrorHandling(async (studentId, goalId, label, category) => {
    const strategy = await api.addStrategy(goalId, label, category)
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId
          ? s
          : {
              ...s,
              goals: s.goals.map((g) =>
                g.id !== goalId ? g : { ...g, strategies: [...g.strategies, strategy] }
              ),
            }
      )
    )
  })

  const removeStrategy = withErrorHandling(async (studentId, goalId, strategyId) => {
    await api.deleteStrategy(strategyId)
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId
          ? s
          : {
              ...s,
              goals: s.goals.map((g) =>
                g.id !== goalId ? g : { ...g, strategies: g.strategies.filter((st) => st.id !== strategyId) }
              ),
            }
      )
    )
  })

  const saveNarrativeReport = withErrorHandling(async (studentId, text) => {
    const updated = await api.saveNarrativeReport(studentId, text)
    setStudents((prev) => prev.map((s) => (s.id !== studentId ? s : updated)))
  })

  const addAdaptation = withErrorHandling(async (studentId, data) => {
    const adaptation = await api.addAdaptation(studentId, data)
    setStudents((prev) =>
      prev.map((s) => (s.id !== studentId ? s : { ...s, adaptations: [...s.adaptations, adaptation] }))
    )
  })

  const removeAdaptation = withErrorHandling(async (studentId, adaptationId) => {
    await api.deleteAdaptation(adaptationId)
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId ? s : { ...s, adaptations: s.adaptations.filter((a) => a.id !== adaptationId) }
      )
    )
  })

  const addModification = withErrorHandling(async (studentId, data) => {
    const modification = await api.addModification(studentId, data)
    setStudents((prev) =>
      prev.map((s) => (s.id !== studentId ? s : { ...s, modifications: [...s.modifications, modification] }))
    )
  })

  const removeModification = withErrorHandling(async (studentId, modificationId) => {
    await api.deleteModification(modificationId)
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId ? s : { ...s, modifications: s.modifications.filter((m) => m.id !== modificationId) }
      )
    )
  })

  const addTransitionGoal = withErrorHandling(async (studentId, data) => {
    const goal = await api.addTransitionGoal(studentId, data)
    setStudents((prev) =>
      prev.map((s) => (s.id !== studentId ? s : { ...s, transitionGoals: [...s.transitionGoals, goal] }))
    )
  })

  const removeTransitionGoal = withErrorHandling(async (studentId, goalId) => {
    await api.deleteTransitionGoal(goalId)
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId ? s : { ...s, transitionGoals: s.transitionGoals.filter((g) => g.id !== goalId) }
      )
    )
  })

  const addTransitionStep = withErrorHandling(async (studentId, goalId, description) => {
    const step = await api.addTransitionStep(goalId, description)
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId
          ? s
          : {
              ...s,
              transitionGoals: s.transitionGoals.map((g) =>
                g.id !== goalId ? g : { ...g, steps: [...g.steps, step] }
              ),
            }
      )
    )
  })

  const removeTransitionStep = withErrorHandling(async (studentId, goalId, stepId) => {
    await api.deleteTransitionStep(stepId)
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId
          ? s
          : {
              ...s,
              transitionGoals: s.transitionGoals.map((g) =>
                g.id !== goalId ? g : { ...g, steps: g.steps.filter((st) => st.id !== stepId) }
              ),
            }
      )
    )
  })

  const addNote = withErrorHandling(async (studentId, text) => {
    const note = await api.createNote(studentId, text)
    setStudents((prev) =>
      prev.map((s) => (s.id !== studentId ? s : { ...s, notes: [note, ...s.notes] }))
    )
  })

  const editNote = withErrorHandling(async (studentId, noteId, text) => {
    const updated = await api.updateNote(noteId, text)
    setStudents((prev) =>
      prev.map((s) =>
        s.id !== studentId ? s : { ...s, notes: s.notes.map((n) => (n.id === noteId ? updated : n)) }
      )
    )
  })

  const removeNote = withErrorHandling(async (studentId, noteId) => {
    await api.deleteNote(noteId)
    setStudents((prev) =>
      prev.map((s) => (s.id !== studentId ? s : { ...s, notes: s.notes.filter((n) => n.id !== noteId) }))
    )
  })

  const addStudent = withErrorHandling(async (data) => {
    const student = await api.createStudent(data)
    setStudents((prev) => [...prev, student])
  })

  // Pas de withErrorHandling ici : ImportPeiModal doit recevoir l'erreur pour
  // l'afficher dans la fenêtre d'import et laisser l'enseignant réessayer.
  const importStudent = async ({ name, grade, nextReviewDate, goals }) => {
    const student = await api.createStudent({ name, grade, nextReviewDate })
    let created = student
    for (const label of goals) {
      const goal = await api.createGoal(student.id, label)
      created = { ...created, goals: [...created.goals, goal] }
    }
    setStudents((prev) => [...prev, created])
  }

  const editStudent = withErrorHandling(async (studentId, data) => {
    const updated = await api.updateStudent(studentId, data)
    setStudents((prev) => prev.map((s) => (s.id !== studentId ? s : updated)))
  })

  const removeStudent = withErrorHandling(async (studentId) => {
    await api.deleteStudent(studentId)
    setStudents((prev) => prev.filter((s) => s.id !== studentId))
    if (studentIdFromPath(path) === studentId) navigate('/')
  })

  const openStudent = (studentId) => navigate(studentPath(studentId))

  const activeStudentId = studentIdFromPath(path)
  const activeStudentIndex = activeStudentId ? students.findIndex((s) => s.id === activeStudentId) : -1
  const activeStudent = activeStudentIndex >= 0 ? students[activeStudentIndex] : undefined

  const navItems = [
    { key: '/', label: t('Tableau de bord') },
    { key: '/tour-de-controle', label: t('Tour de contrôle') },
    { key: '/revisions', label: t('Révisions'), badge: (() => {
      const n = students.filter((s) => s.reviewInDays <= 30).length
      return n > 0 ? n : null
    })() },
    ...(role === 'enseignant' ? [{ key: '/comptes', label: t('Comptes') }] : []),
  ]

  if (authStatus === 'loading') {
    return (
      <div className="auth-shell">
        <p className="page-date">{t('Chargement…')}</p>
      </div>
    )
  }

  if (authStatus === 'setup') {
    return <AuthScreen mode="setup" onSubmit={handleSetup} />
  }

  if (authStatus === 'login') {
    return <AuthScreen mode="login" onSubmit={handleLogin} message={authMessage} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/logo-repere-icon.svg" alt="" className="brand-icon" />
            <p className="brand">Repère</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 32px' }}>
          <img
            src="/logo-ecole-riviere-rouge.png"
            alt=""
            style={{ width: 22, height: 22, borderRadius: 6, background: '#fff', padding: 2, objectFit: 'contain', flexShrink: 0 }}
          />
          <p className="brand-sub" style={{ margin: 0 }}>{t('École Rivière-Rouge · Prototype')}</p>
        </div>
        <LanguageToggle className="on-dark" style={{ marginBottom: 20 }} />
        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${path === item.key ? 'active' : ''}`}
              onClick={() => navigate(item.key)}
            >
              <span className="dot" />
              {item.label}
              {!!item.badge && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {username && (
            <div className="sidebar-user-row">
              <span className="role-pill">{t(ROLE_LABELS[role]) || role}</span>
              <span className="sidebar-user">{username}</span>
            </div>
          )}
          <button className="logout-btn" onClick={() => handleLogout()}>
            {t('Déconnexion')}
          </button>
          <p>{t('Base de données SQLite locale — les changements sont enregistrés sur ce poste.')}</p>
        </div>
      </aside>

      <main className="main">
        {error && (
          <div className="alert alert-urgent" style={{ marginBottom: 16 }} onClick={() => setError(null)}>
            {error} {t('(cliquer pour fermer)')}
          </div>
        )}

        {loading && <p className="page-date">{t('Chargement des données…')}</p>}

        {!loading && path === '/' && (
          <Dashboard
            students={students}
            role={role}
            onOpenStudent={openStudent}
            onAddStudent={addStudent}
            onRemoveStudent={removeStudent}
            onImportStudent={importStudent}
            onDataRestored={handleDataRestored}
          />
        )}

        {!loading && activeStudent && (
          <StudentPage
            student={activeStudent}
            role={role}
            onBack={() => navigate('/')}
            onPrev={activeStudentIndex > 0 ? () => navigate(studentPath(students[activeStudentIndex - 1].id)) : null}
            onNext={
              activeStudentIndex >= 0 && activeStudentIndex < students.length - 1
                ? () => navigate(studentPath(students[activeStudentIndex + 1].id))
                : null
            }
            positionLabel={activeStudentIndex >= 0 ? `${activeStudentIndex + 1} / ${students.length}` : null}
            onAddGoal={addGoal}
            onEditGoal={editGoal}
            onRemoveGoal={removeGoal}
            onChangeGoalStatus={changeGoalStatus}
            onAddStrategy={addStrategy}
            onRemoveStrategy={removeStrategy}
            strategiesLibrary={strategiesLibrary}
            adaptationsLibrary={adaptationsLibrary}
            forcesBesoinsLibrary={forcesBesoinsLibrary}
            onAddNote={addNote}
            onEditNote={editNote}
            onRemoveNote={removeNote}
            onEditStudent={editStudent}
            onRemoveStudent={removeStudent}
            onSaveNarrativeReport={saveNarrativeReport}
            onAddAdaptation={addAdaptation}
            onRemoveAdaptation={removeAdaptation}
            onAddModification={addModification}
            onRemoveModification={removeModification}
            onAddTransitionGoal={addTransitionGoal}
            onRemoveTransitionGoal={removeTransitionGoal}
            onAddTransitionStep={addTransitionStep}
            onRemoveTransitionStep={removeTransitionStep}
          />
        )}

        {!loading && path === '/revisions' && (
          <UpcomingReviews students={students} onOpenStudent={openStudent} />
        )}

        {path === '/tour-de-controle' && <CompletionDashboard onOpenStudent={openStudent} />}

        {path === '/comptes' && role === 'enseignant' && <AccountsAdmin />}
      </main>
    </div>
  )
}
