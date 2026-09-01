import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getAccessToken, type BriefStatus } from './api'

const BRIEF_UPDATED_EVENT = 'brief.updated'

export interface BriefUpdatedClientEvent {
  briefId: string
  status: BriefStatus
  occurredAt: string
}

function realtimeOrigin(): string {
  const apiUrl = import.meta.env.VITE_API_URL?.trim()
  if (!apiUrl || apiUrl.startsWith('/')) return window.location.origin
  return new URL(apiUrl, window.location.origin).origin
}

export function useBriefUpdates(
  onUpdate: (event: BriefUpdatedClientEvent) => void,
): boolean {
  const callbackRef = useRef(onUpdate)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    callbackRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    const token = getAccessToken()
    if (!token) return

    const socket = io(`${realtimeOrigin()}/brief-events`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    })

    const handleUpdate = (event: BriefUpdatedClientEvent) => {
      callbackRef.current(event)
    }

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on(BRIEF_UPDATED_EVENT, handleUpdate)

    return () => {
      socket.off(BRIEF_UPDATED_EVENT, handleUpdate)
      socket.disconnect()
    }
  }, [])

  return connected
}
