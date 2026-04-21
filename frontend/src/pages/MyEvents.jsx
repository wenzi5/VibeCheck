import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useLocation, useNavigate } from 'react-router-dom'
import ProfileMenu from '../components/ProfileMenu.jsx'
import '../App.css'
import './MyEvents.css'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

function MyEvents() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth0()
  const [activeTab, setActiveTab] = useState('created')
  const [successMessage, setSuccessMessage] = useState('')
  const [createdEvents, setCreatedEvents] = useState([])
  const [createdEventsLoading, setCreatedEventsLoading] = useState(false)
  const [createdEventsError, setCreatedEventsError] = useState('')
  const [registeredEvents, setRegisteredEvents] = useState([])
  const [registeredEventsLoading, setRegisteredEventsLoading] = useState(false)
  const [registeredEventsError, setRegisteredEventsError] = useState('')

  useEffect(() => {
    const routedMessage = location.state?.successMessage
    if (!routedMessage) {
      return
    }

    setSuccessMessage(routedMessage)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  useEffect(() => {
    async function loadCreatedEvents() {
      if (activeTab !== 'created') {
        return
      }

      const userEmail = String(user?.email ?? '').toLowerCase().trim()
      if (!userEmail) {
        setCreatedEvents([])
        setCreatedEventsError('Missing email identity.')
        return
      }

      setCreatedEventsLoading(true)
      setCreatedEventsError('')

      try {
        const response = await fetch(`${API_BASE}/events`)
        const data = await response.json()
        const events = Array.isArray(data)
          ? data.filter((event) => String(event.creator_email ?? '').toLowerCase().trim() === userEmail)
          : []
        setCreatedEvents(events)
      } catch {
        setCreatedEvents([])
        setCreatedEventsError('Unable to load your created events.')
      } finally {
        setCreatedEventsLoading(false)
      }
    }

    loadCreatedEvents()
  }, [activeTab, user?.email])

  useEffect(() => {
    async function loadRegisteredEvents() {
      if (activeTab !== 'registered') {
        return
      }

      const userEmail = String(user?.email ?? '').toLowerCase().trim()
      if (!userEmail) {
        setRegisteredEvents([])
        setRegisteredEventsError('Missing email identity.')
        return
      }

      setRegisteredEventsLoading(true)
      setRegisteredEventsError('')

      try {
        const [usersResponse, registrationsResponse, eventsResponse] = await Promise.all([
          fetch(`${API_BASE}/users`),
          fetch(`${API_BASE}/registrations`),
          fetch(`${API_BASE}/events`),
        ])

        const [usersData, registrationsData, eventsData] = await Promise.all([
          usersResponse.json(),
          registrationsResponse.json(),
          eventsResponse.json(),
        ])

        if (!usersResponse.ok || !registrationsResponse.ok || !eventsResponse.ok) {
          throw new Error('Unable to load registration data.')
        }

        const users = Array.isArray(usersData) ? usersData : []
        const registrations = Array.isArray(registrationsData) ? registrationsData : []
        const events = Array.isArray(eventsData) ? eventsData : []

        const currentUser = users.find(
          (candidate) => String(candidate.email ?? '').toLowerCase().trim() === userEmail,
        )

        if (!currentUser?.user_id) {
          setRegisteredEvents([])
          setRegisteredEventsError('No user record found for your account yet.')
          return
        }

        const eventsById = new Map(events.map((event) => [event.event_id, event]))

        const mergedRegisteredEvents = registrations
          .filter((registration) => Number(registration.user_id) === Number(currentUser.user_id))
          .map((registration) => ({
            ...registration,
            event: eventsById.get(registration.event_id) ?? null,
          }))

        setRegisteredEvents(mergedRegisteredEvents)
      } catch {
        setRegisteredEvents([])
        setRegisteredEventsError('Unable to load your event registrations.')
      } finally {
        setRegisteredEventsLoading(false)
      }
    }

    loadRegisteredEvents()
  }, [activeTab, user?.email])

  async function handleDelete(eventId) {
    const shouldDelete = window.confirm('Delete this event?')
    if (!shouldDelete) {
      return
    }

    try {
      const response = await fetch(`${API_BASE}/events/${eventId}`, {
        method: 'DELETE',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to delete event.')
      }

      setCreatedEvents((previousEvents) =>
        previousEvents.filter((event) => event.event_id !== eventId),
      )
      setCreatedEventsError('')
      setSuccessMessage('Event deleted successfully!')
    } catch {
      setCreatedEventsError('Unable to delete the event right now.')
    }
  }

  async function handleCancelRegistration(registrationId) {
    const shouldCancel = window.confirm('Cancel this registration?')
    if (!shouldCancel) {
      return
    }

    try {
      const response = await fetch(`${API_BASE}/registrations/${registrationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to cancel registration.')
      }

      setRegisteredEvents((previousRegistrations) =>
        previousRegistrations.map((registration) =>
          registration.reg_id === registrationId
            ? { ...registration, status: data?.status ?? 'cancelled' }
            : registration,
        ),
      )
      setRegisteredEventsError('')
      setSuccessMessage('Registration cancelled successfully!')
    } catch {
      setRegisteredEventsError('Unable to cancel your registration right now.')
    }
  }

  function registrationStatusClass(status) {
    const normalizedStatus = String(status ?? '').toLowerCase().trim()

    if (normalizedStatus === 'registered' || normalizedStatus === 'confirmed' || normalizedStatus === 'approved') {
      return 'status-registered'
    }

    if (normalizedStatus === 'pending' || normalizedStatus === 'waitlisted') {
      return 'status-pending'
    }

    if (normalizedStatus === 'denied' || normalizedStatus === 'cancelled' || normalizedStatus === 'rejected') {
      return 'status-denied'
    }

    if (normalizedStatus === 'failed') {
      return 'status-failed'
    }

    return 'status-unknown'
  }

  function registrationStatusLabel(status) {
    const normalizedStatus = String(status ?? '').toLowerCase().trim()

    if (normalizedStatus === 'confirmed' || normalizedStatus === 'approved') {
      return 'registered'
    }

    if (normalizedStatus === 'rejected') {
      return 'denied'
    }

    if (normalizedStatus === 'cancelled') {
      return 'cancelled'
    }

    return normalizedStatus || 'unknown'
  }

  const createdEventsView = useMemo(() => {
    if (createdEventsLoading) {
      return <p className="events-empty">Loading your created events...</p>
    }

    if (createdEventsError) {
      return <p className="events-empty">{createdEventsError}</p>
    }

    if (createdEvents.length === 0) {
      return <p className="events-empty">You have not created any events yet.</p>
    }

    return (
      <div className="events-list">
        {createdEvents.map((event) => (
          <article key={event.event_id} className="event-card">
            <div className="event-card-header">
              <div>
                <h3>{event.title}</h3>
                <p>{event.description}</p>
              </div>
              <div className="event-card-actions">
                <button
                  type="button"
                  className="event-card-action"
                  onClick={() => navigate(`/events/${event.event_id}/registrations`, { state: { event } })}
                >
                  View Registrations
                </button>
                <button
                  type="button"
                  className="event-card-action"
                  onClick={() => navigate(`/events/edit/${event.event_id}`, { state: { event } })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="event-card-action danger"
                  onClick={() => handleDelete(event.event_id)}
                >
                  Delete
                </button>
              </div>
            </div>
            <dl>
              <div>
                <dt>When</dt>
                <dd>{new Date(event.start_time).toLocaleString()} - {new Date(event.end_time).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{event.location}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{event.registration_type}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{event.event_type}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    )
  }, [createdEvents, createdEventsError, createdEventsLoading])

  const registeredEventsView = useMemo(() => {
    if (registeredEventsLoading) {
      return <p className="events-empty">Loading your event registrations...</p>
    }

    if (registeredEventsError) {
      return <p className="events-empty">{registeredEventsError}</p>
    }

    if (registeredEvents.length === 0) {
      return <p className="events-empty">You have not registered for any events yet.</p>
    }

    return (
      <div className="events-list">
        {registeredEvents.map((registration) => {
          const event = registration.event

          return (
            <article key={registration.reg_id} className="event-card">
              <div className="event-card-header">
                <div>
                  <h3>{event?.title ?? registration.event_title ?? 'Untitled Event'}</h3>
                  <p>{event?.description ?? 'No description available.'}</p>
                </div>

                <div className="event-card-actions">
                  <div className="registration-status-wrap">
                    <span
                      className={`registration-status-icon ${registrationStatusClass(registration.status)}`}
                      aria-hidden="true"
                    />
                    <span className="registration-status-label">{registrationStatusLabel(registration.status)}</span>
                  </div>
                  {['pending', 'waitlisted', 'registered', 'confirmed', 'approved'].includes(
                    String(registration.status ?? '').toLowerCase().trim(),
                  ) && (
                    <button
                      type="button"
                      className="event-card-action danger"
                      onClick={() => handleCancelRegistration(registration.reg_id)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <dl>
                <div>
                  <dt>When</dt>
                  <dd>
                    {event?.start_time && event?.end_time
                      ? `${new Date(event.start_time).toLocaleString()} - ${new Date(event.end_time).toLocaleString()}`
                      : 'Time unavailable'}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{event?.location ?? 'Location unavailable'}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>{event?.registration_type ?? 'N/A'}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{event?.event_type ?? 'N/A'}</dd>
                </div>
                {String(registration.status ?? '').toLowerCase().trim() === 'waitlisted' && Number(registration.waitlist_position) > 0 && (
                  <div>
                    <dt>Waitlist Position</dt>
                    <dd>{Number(registration.waitlist_position)}</dd>
                  </div>
                )}
              </dl>
            </article>
          )
        })}
      </div>
    )
  }, [registeredEvents, registeredEventsError, registeredEventsLoading])

  function handleBack() {
    navigate('/home')
  }

  return (
    <div className="home-page my-events-page">
      <header className="events-nav" aria-label="My events navigation">
        <div className="events-nav-left">
          <button type="button" className="back-button" onClick={handleBack} aria-label="Back to Home">
            ←
          </button>

          <button
            type="button"
            className={activeTab === 'created' ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab('created')}
          >
            Events Created
          </button>
          <button
            type="button"
            className={activeTab === 'registered' ? 'tab-button active' : 'tab-button'}
            onClick={() => setActiveTab('registered')}
          >
            Events Registered
          </button>
        </div>

        <div className="events-nav-right">
          <button
            type="button"
            className="secondary-action"
            onClick={() => navigate('/browse-events')}
          >
            Browse Events
          </button>

          <button
            type="button"
            className="create-event-button"
            onClick={() => navigate('/events/new')}
          >
            Create Event
          </button>

          <ProfileMenu
            user={user}
            onEditName={() => navigate('/edit-name')}
            onLogout={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          />
        </div>
      </header>

      {successMessage && (
        <p className="events-success-message" role="status">
          {successMessage}
        </p>
      )}

      <section className="events-content" aria-label="My events content">
        {activeTab === 'created' ? (
          <div className="events-panel">
            <h2>Events Created</h2>
            {createdEventsView}
          </div>
        ) : (
          <div className="events-panel">
            <h2>Events Registered</h2>
            {registeredEventsView}
          </div>
        )}
      </section>
    </div>
  )
}

export default MyEvents
