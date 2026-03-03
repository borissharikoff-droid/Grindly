import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { playClickSound } from '../../lib/sounds'
import { useAuthStore } from '../../stores/authStore'
import type { FriendProfile as FriendProfileType } from '../../hooks/useFriends'
import type { ChatMessage } from '../../hooks/useChat'
import { MOTION } from '../../lib/motion'
import { BackButton } from '../shared/BackButton'
import { EmptyState } from '../shared/EmptyState'
import { ErrorState } from '../shared/ErrorState'
import { SkeletonBlock } from '../shared/PageLoading'

interface ChatThreadProps {
  profile: FriendProfileType
  onBack: () => void
  onOpenProfile?: () => void
  messages: ChatMessage[]
  loading: boolean
  sending: boolean
  sendError?: string | null
  getConversation: (otherUserId: string) => Promise<ChatMessage[]>
  sendMessage: (receiverId: string, body: string) => Promise<void>
  markConversationRead: (otherUserId: string) => Promise<void>
}

const NEAR_BOTTOM_THRESHOLD = 100

export function ChatThread({ profile, onBack, onOpenProfile, messages, loading, sending, sendError, getConversation, sendMessage, markConversationRead }: ChatThreadProps) {
  const { user } = useAuthStore()
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const wasAtBottomRef = useRef(true)
  const prevMessageCountRef = useRef(0)

  useEffect(() => {
    getConversation(profile.id)
    markConversationRead(profile.id)
    prevMessageCountRef.current = 0
  }, [profile.id, getConversation, markConversationRead])

  // Mark new messages as read when they arrive while chat is open
  useEffect(() => {
    if (messages.length > 0) {
      markConversationRead(profile.id)
    }
  }, [messages.length, profile.id, markConversationRead])

  // Track if user is near bottom (for scroll-on-new-message decision)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const check = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_THRESHOLD
    }
    el.addEventListener('scroll', check, { passive: true })
    check()
    return () => el.removeEventListener('scroll', check)
  }, [])

  // Scroll to bottom: useLayoutEffect so it runs before paint — no visible scroll
  useLayoutEffect(() => {
    if (loading || messages.length === 0) return
    const el = listRef.current
    if (!el) return

    const lastMsg = messages[messages.length - 1]
    const isIncoming = lastMsg.sender_id !== user?.id
    const prevCount = prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    const isInitialLoad = prevCount === 0
    const shouldScrollOnIncoming = isIncoming && wasAtBottomRef.current
    const shouldScrollOnSend = !isIncoming

    if (isInitialLoad || shouldScrollOnIncoming || shouldScrollOnSend) {
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' })
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' }))
    }
    wasAtBottomRef.current = true
  }, [loading, messages, user?.id])

  useEffect(() => {
    inputRef.current?.focus()
  }, [profile.id])

  // Auto-resize textarea when content changes (for Shift+Enter multi-line)
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const h = Math.min(el.scrollHeight, 120)
    el.style.height = `${Math.max(h, 40)}px`
    el.style.overflowY = h >= 120 ? 'auto' : 'hidden'
  }, [input])

  const handleSend = () => {
    const text = input.trim()
    if (!text || sending) return
    sendMessage(profile.id, text)
    setInput('')
    playClickSound()
  }

  const groupedMessages = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: ChatMessage[] }> = []
    for (const m of messages) {
      const d = new Date(m.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const prev = groups[groups.length - 1]
      if (!prev || prev.key !== key) {
        groups.push({ key, label, items: [m] })
      } else {
        prev.items.push(m)
      }
    }
    return groups
  }, [messages])

  return (
    <motion.div
      initial={MOTION.subPage.initial}
      animate={MOTION.subPage.animate}
      transition={{ duration: MOTION.duration.base, ease: MOTION.easing }}
      className="flex flex-col flex-1 min-h-0"
    >
      <div className="relative flex items-center justify-center shrink-0 py-3 mb-1">
        <div className="absolute left-0">
          <BackButton onClick={() => { onBack(); playClickSound() }} />
        </div>
        <button
          type="button"
          onClick={() => { onOpenProfile?.(); playClickSound() }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <span className={`w-2 h-2 rounded-full ${profile.is_online ? 'bg-emerald-400' : 'bg-gray-500'} shrink-0`} />
          <span className="text-sm text-white font-medium truncate max-w-[140px]">{profile.username || 'Friend'}</span>
          <span className="text-[11px] text-gray-500">{profile.is_online ? 'Online' : 'Offline'}</span>
        </button>
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-[#1e1e2e]/90 border border-white/[0.06] p-4 space-y-3 mb-3"
      >
        {loading ? (
          <div className="space-y-3 py-2">
            <div className="flex justify-center">
              <SkeletonBlock className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex justify-start">
              <SkeletonBlock className="h-12 w-40 rounded-2xl rounded-bl-sm" />
            </div>
            <div className="flex justify-end">
              <SkeletonBlock className="h-10 w-32 rounded-2xl rounded-br-sm bg-cyber-neon/10" />
            </div>
            <div className="flex justify-start">
              <SkeletonBlock className="h-14 w-36 rounded-2xl rounded-bl-sm" />
            </div>
            <div className="flex justify-end">
              <SkeletonBlock className="h-8 w-28 rounded-2xl rounded-br-sm bg-cyber-neon/10" />
            </div>
            <div className="flex justify-center">
              <SkeletonBlock className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex justify-start">
              <SkeletonBlock className="h-10 w-44 rounded-2xl rounded-bl-sm" />
            </div>
            <div className="flex justify-end">
              <SkeletonBlock className="h-12 w-40 rounded-2xl rounded-br-sm bg-cyber-neon/10" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <EmptyState title="No messages yet" description="Say hi to start the conversation." icon="💬" className="bg-transparent border-white/5" />
        ) : (
          groupedMessages.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-center py-1">
                <span className="text-[11px] text-gray-500 font-medium px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
                  {group.label}
                </span>
              </div>
              {group.items.map((m) => {
                const isMe = m.sender_id === user?.id
                return (
                  <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                        isMe
                          ? 'bg-cyber-neon/15 text-cyber-neon border border-cyber-neon/25 rounded-br-sm rounded-bl-2xl'
                          : 'bg-white/[0.08] text-gray-100 border border-white/[0.08] rounded-bl-sm rounded-br-2xl'
                      }`}
                    >
                      <p className="break-words leading-relaxed whitespace-pre-wrap">{m.body}</p>
                      <p className={`text-[10px] mt-1 ${isMe ? 'text-cyber-neon/70' : 'text-gray-500'}`}>
                        {new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <ErrorState message={sendError} className="mb-2 py-2 shrink-0" />
      )}
      <div className="shrink-0 rounded-2xl bg-[#1e1e2e]/90 border border-white/[0.06] p-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) return
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Message..."
            rows={1}
            className="flex-1 resize-none min-h-[40px] rounded-xl bg-[#11111b] border border-white/[0.08] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-neon/50 focus:ring-1 focus:ring-cyber-neon/20 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-cyber-neon/25 text-cyber-neon border border-cyber-neon/35 hover:bg-cyber-neon/35 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-medium"
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
