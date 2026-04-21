import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import ProfileMenu from '../components/ProfileMenu.jsx'
import './BrowseEvents.css'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'
const EVENT_TYPE_OPTIONS = ['All', 'Study Group', 'Party', 'Club Meeting', 'Mixer', 'Professional Development', 'Other']
const ACCESS_LEVEL_OPTIONS = ['All', 'Public', 'RSVP']
const MAX_RELIABLE_DISTANCE_MILES = 5758.9

function BrowseEvents() {
  const navigate = useNavigate()
  const { user, logout } = useAuth0()
  const [events, setEvents] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [radiusMiles, setRadiusMiles] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('All')
  const [accessLevelFilter, setAccessLevelFilter] = useState('All')
  const [userCoords, setUserCoords] = useState(null)
  const [locationStatus, setLocationStatus] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [registeredEventIds, setRegisteredEventIds] = useState([])
  const [signingUpEventId, setSigningUpEventId] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [actionErrorMessage, setActionErrorMessage] = useState('')

  function haversineMiles(latitude1, longitude1, latitude2, longitude2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180
    const earthRadiusMiles = 3958.8

    const deltaLatitude = toRadians(latitude2 - latitude1)
    const deltaLongitude = toRadians(longitude2 - longitude1)
    const latitude1Radians = toRadians(latitude1)
    const latitude2Radians = toRadians(latitude2)

    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(latitude1Radians) * Math.cos(latitude2Radians) * Math.sin(deltaLongitude / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return earthRadiusMiles * c
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation is unavailable in this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }
        console.log('Browser geolocation:', coords)
        setUserCoords(coords)
        setLocationStatus('')
      },
      () => {
        setLocationStatus('Enable location to use radius filtering.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  useEffect(() => {
    async function loadEvents() {
      setIsLoading(true)
      setError('')
      try {
        const response = await fetch(`${API_BASE}/events`)
        const data = await response.json()
        setEvents(Array.isArray(data) ? data : [])
      } catch {
        setEvents([])
        setError('Unable to load events right now.')
      } finally {
        setIsLoading(false)
      }
    }

    loadEvents()
  }, [])

  useEffect(() => {
    async function loadUserRegistrationContext() {
      const userEmail = String(user?.email ?? '').toLowerCase().trim()
      if (!userEmail) {
        setCurrentUserId(null)
        setRegisteredEventIds([])
        return
      }

      try {
        const [usersResponse, registrationsResponse] = await Promise.all([
          fetch(`${API_BASE}/users`),
          fetch(`${API_BASE}/registrations`),
        ])

        const [usersData, registrationsData] = await Promise.all([
          usersResponse.json(),
          registrationsResponse.json(),
        ])

        if (!usersResponse.ok || !registrationsResponse.ok) {
          throw new Error('Unable to load user filter data.')
        }

        const users = Array.isArray(usersData) ? usersData : []
        const registrations = Array.isArray(registrationsData) ? registrationsData : []
        const currentUser = users.find(
          (candidate) => String(candidate.email ?? '').toLowerCase().trim() === userEmail,
        )

        if (!currentUser?.user_id) {
          setCurrentUserId(null)
          setRegisteredEventIds([])
          return
        }

        const eventIds = registrations
          .filter((registration) => Number(registration.user_id) === Number(currentUser.user_id))
          .filter((registration) => {
            const normalizedStatus = String(registration.status ?? '').toLowerCase().trim()
            return ['pending', 'waitlisted', 'registered', 'confirmed', 'approved'].includes(normalizedStatus)
          })
          .map((registration) => Number(registration.event_id))

        setCurrentUserId(Number(currentUser.user_id))
        setRegisteredEventIds(eventIds)
      } catch {
        setCurrentUserId(null)
        setRegisteredEventIds([])
      }
    }

    loadUserRegistrationContext()
  }, [user?.email])

  const filteredEvents = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    const radiusValue = Number(radiusMiles)
    const registeredEventIdSet = new Set(registeredEventIds)

    const eventsWithDistance = events.map((event) => {
      const eventLatitude = event.latitude != null ? Number(event.latitude) : NaN
      const eventLongitude = event.longitude != null ? Number(event.longitude) : NaN
      const hasEventCoordinates = !Number.isNaN(eventLatitude) && !Number.isNaN(eventLongitude)
      const hasUserCoordinates = Boolean(userCoords)

      if (event.event_id <= 3) {
        console.log(`Event ${event.event_id}:`, {
          latitude: event.latitude,
          longitude: event.longitude,
          eventLatitude,
          eventLongitude,
          hasEventCoordinates,
          hasUserCoordinates,
        })
      }

      if (!hasEventCoordinates || !hasUserCoordinates) {
        return {
          ...event,
          distance_miles: null,
        }
      }

      const computedDistance = haversineMiles(
        userCoords.latitude,
        userCoords.longitude,
        eventLatitude,
        eventLongitude
      )

      return {
        ...event,
        distance_miles: computedDistance > MAX_RELIABLE_DISTANCE_MILES ? null : computedDistance,
      }
    })

    return eventsWithDistance
      .filter((event) => {
        if (!normalizedKeyword) {
          return true
        }

        const haystack = [
          event.title,
          event.description,
          event.location,
          event.event_type,
          event.registration_type,
          event.creator_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return haystack.includes(normalizedKeyword)
      })
      .filter((event) => {
        if (eventTypeFilter === 'All') {
          return true
        }

        return String(event.event_type ?? '') === eventTypeFilter
      })
      .filter((event) => {
        if (accessLevelFilter === 'All') {
          return true
        }

        return String(event.registration_type ?? '') === accessLevelFilter
      })
      .filter((event) => {
        if (!radiusMiles.trim()) {
          return true
        }

        if (Number.isNaN(radiusValue) || radiusValue <= 0) {
          return true
        }

        if (!userCoords || event.distance_miles == null) {
          return false
        }

        return Number(event.distance_miles) <= radiusValue
      })
      .filter((event) => {
        if (currentUserId == null) {
          return true
        }

        return Number(event.creator_id) !== Number(currentUserId)
      })
      .filter((event) => {
        return !registeredEventIdSet.has(Number(event.event_id))
      })
  }, [
    accessLevelFilter,
    currentUserId,
    eventTypeFilter,
    events,
    keyword,
    radiusMiles,
    registeredEventIds,
    userCoords,
  ])

  async function ensureCurrentUserId() {
    if (currentUserId != null) {
      return currentUserId
    }

    const userEmail = String(user?.email ?? '').toLowerCase().trim()
    if (!userEmail) {
      throw new Error('Missing account email.')
    }

    const usersResponse = await fetch(`${API_BASE}/users`)
    const usersData = await usersResponse.json()
    const users = Array.isArray(usersData) ? usersData : []

    if (!usersResponse.ok) {
      throw new Error('Unable to load user profile.')
    }

    const existingUser = users.find(
      (candidate) => String(candidate.email ?? '').toLowerCase().trim() === userEmail,
    )

    if (existingUser?.user_id) {
      const resolvedUserId = Number(existingUser.user_id)
      setCurrentUserId(resolvedUserId)
      return resolvedUserId
    }

    const fallbackName = String(user?.name ?? user?.nickname ?? userEmail.split('@')[0] ?? 'User').trim()
    const createdUserResponse = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: fallbackName || 'User',
        email: userEmail,
      }),
    })

    const createdUserData = await createdUserResponse.json()
    if (!createdUserResponse.ok || !createdUserData?.user_id) {
      throw new Error(createdUserData?.error ?? 'Unable to create your user profile.')
    }

    const resolvedUserId = Number(createdUserData.user_id)
    setCurrentUserId(resolvedUserId)

    return resolvedUserId
  }

  async function handleSignUp(event) {
    setSuccessMessage('')
    setActionErrorMessage('')
    setSigningUpEventId(event.event_id)

    try {
      const userId = await ensureCurrentUserId()
      const isPublicEvent = String(event?.registration_type ?? '').toLowerCase().trim() === 'public'
      const registrationStatus = isPublicEvent ? 'registered' : 'pending'
      const response = await fetch(`${API_BASE}/registrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          event_id: event.event_id,
          status: registrationStatus,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to sign up for this event.')
      }

      setRegisteredEventIds((previousIds) => {
        if (previousIds.includes(Number(event.event_id))) {
          return previousIds
        }

        return [...previousIds, Number(event.event_id)]
      })
      setSuccessMessage(
        isPublicEvent ? 'Successfully registered for the event!' : 'Registration submitted for approval!',
      )
    } catch (registrationError) {
      setActionErrorMessage(
        registrationError instanceof Error
          ? registrationError.message
          : 'Unable to sign up for this event right now.',
      )
    } finally {
      setSigningUpEventId(null)
    }
  }

  return (
    <div className="browse-events-page">
      <header className="events-nav" aria-label="Browse events navigation">
        <div className="events-nav-left">
          <button type="button" className="back-button" onClick={() => navigate('/home')} aria-label="Back to Home">
            ←
          </button>
          <p className="brand">Browse Events</p>
        </div>

        <div className="events-nav-right">
          <button type="button" className="secondary-action" onClick={() => navigate('/my-events')}>
            My Events
          </button>
          <ProfileMenu
            user={user}
            onEditName={() => navigate('/edit-name')}
            onLogout={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          />
        </div>
      </header>

      <section className="browse-filters" aria-label="Browse filters">
        <div className="browse-field-group">
          <label htmlFor="event-search">Search keywords</label>
          <input
            id="event-search"
            type="text"
            placeholder="Search title, description, location..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        <div className="browse-field-group">
          <label htmlFor="event-radius">Radius (miles)</label>
          <input
            id="event-radius"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 10"
            value={radiusMiles}
            onChange={(event) => setRadiusMiles(event.target.value)}
          />
          {locationStatus && <p className="browse-location-note">{locationStatus}</p>}
        </div>

        <div className="browse-filter-buttons">
          <div className="browse-field-group">
            <label htmlFor="event-type-filter">Event Type</label>
            <select
              id="event-type-filter"
              value={eventTypeFilter}
              onChange={(event) => setEventTypeFilter(event.target.value)}
            >
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="browse-field-group">
            <label htmlFor="access-level-filter">Access Level</label>
            <select
              id="access-level-filter"
              value={accessLevelFilter}
              onChange={(event) => setAccessLevelFilter(event.target.value)}
            >
              {ACCESS_LEVEL_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

      </section>

      <section className="browse-results" aria-label="Browse event results">
        {successMessage && (
          <p className="events-success-message" role="status">
            {successMessage}
          </p>
        )}
        {actionErrorMessage && (
          <p className="events-error-message" role="alert">
            {actionErrorMessage}
          </p>
        )}

        {isLoading && <p className="events-empty">Loading events...</p>}
        {!isLoading && error && <p className="events-empty">{error}</p>}
        {!isLoading && !error && filteredEvents.length === 0 && (
          <p className="events-empty">No events match your current filters.</p>
        )}

        {!isLoading && !error && filteredEvents.length > 0 && (
          <div className="events-list">
            {filteredEvents.map((event) => (
              <article key={event.event_id} className="event-card">
                <div className="browse-event-header">
                  <h3>{event.title}</h3>
                  <button
                    type="button"
                    className="browse-sign-up-button"
                    onClick={() => handleSignUp(event)}
                    disabled={signingUpEventId === event.event_id}
                  >
                    {signingUpEventId === event.event_id ? 'Signing Up...' : 'Sign Up'}
                  </button>
                </div>
                <p>{event.description}</p>
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
                  <div>
                    <dt>Distance</dt>
                    <dd>{event.distance_miles != null ? `${event.distance_miles.toFixed(1)} miles` : 'Distance unavailable'}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default BrowseEvents
