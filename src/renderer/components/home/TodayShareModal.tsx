import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../stores/authStore'
import { useFriends } from '../../hooks/useFriends'
import { useToastStore } from '../../stores/toastStore'
import { supabase } from '../../lib/supabase'
import {
  renderTodayShareCard,
  buildTodayShareText,
  buildTodayShareChatBody,
  type TodayCardInput,
} from '../../lib/shareCard'
import { playClickSound } from '../../lib/sounds'
import { X } from '../../lib/icons'
import { AvatarWithFrame } from '../shared/AvatarWithFrame'

interface Props {
  input: TodayCardInput
  onClose: () => void
}

type Step = 'menu' | 'friends' | 'sending' | 'done'

export function TodayShareModal({ input, onClose }: Props) {
  const { user } = useAuthStore()
  const { friends, loading: friendsLoading } = useFriends()
  const pushToast = useToastStore((s) => s.push)

  const [step, setStep] = useState<Step>('menu')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [cardBlob, setCardBlob] = useState<Blob | null>(null)
  const [busyFriendId, setBusyFriendId] = useState<string | null>(null)
  const [xSharing, setXSharing] = useState(false)
  const [friendQuery, setFriendQuery] = useState('')

  const filteredFriends = useMemo(() => {
    const q = friendQuery.trim().toLowerCase()
    if (!q) return friends
    return friends.filter((f) => (f.username || '').toLowerCase().includes(q))
  }, [friends, friendQuery])

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    renderTodayShareCard(input)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setCardBlob(blob)
        setPreviewUrl(url)
      })
      .catch(() => { /* ignore */ })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [input])

  const sendToFriend = async (friendId: string, username: string | null) => {
    if (!supabase || !user?.id) return
    setBusyFriendId(friendId)
    const body = buildTodayShareChatBody(input)
    const { error } = await supabase
      .from('messages')
      .insert({ sender_id: user.id, receiver_id: friendId, body })
    setBusyFriendId(null)
    if (error) {
      pushToast({ kind: 'generic', type: 'error', message: `Send failed: ${error.message}` })
      return
    }
    pushToast({ kind: 'generic', type: 'success', message: `Sent to ${username || 'friend'}` })
    onClose()
  }

  const shareToX = async () => {
    setXSharing(true)
    try {
      if (cardBlob) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardBlob })])
          pushToast({ kind: 'generic', type: 'success', message: 'Image copied — paste (Ctrl+V) into the X post' })
        } catch {
          pushToast({ kind: 'generic', type: 'error', message: 'Could not copy image — download and attach manually' })
        }
      }
      const text = buildTodayShareText(input)
      const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}`
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setXSharing(false)
    }
  }

  const copyImage = async () => {
    if (!cardBlob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardBlob })])
      pushToast({ kind: 'generic', type: 'success', message: 'Card image copied to clipboard' })
    } catch {
      pushToast({ kind: 'generic', type: 'error', message: 'Clipboard blocked — use Download instead' })
    }
  }

  const downloadCard = () => {
    if (!cardBlob || !previewUrl) return
    const a = document.createElement('a')
    a.href = previewUrl
    a.download = `grindly-today-${new Date().toISOString().slice(0, 10)}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    pushToast({ kind: 'generic', type: 'success', message: 'Card saved to downloads' })
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0f141c] p-4 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => { playClickSound(); onClose() }}
            className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-sm font-semibold text-white mb-3">Share today</h3>

          {/* Preview */}
          <div className="rounded-xl bg-black/40 border border-white/10 p-2 mb-3 aspect-square overflow-hidden flex items-center justify-center">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Today preview"
                className="max-w-full max-h-full rounded-lg"
              />
            ) : (
              <div className="text-xs text-gray-500">Rendering card...</div>
            )}
          </div>

          {step === 'menu' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => { playClickSound(); setStep('friends') }}
                className="w-full rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors px-3 py-2.5 text-left flex items-center gap-3"
              >
                <span className="text-lg shrink-0">💬</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">Send to a friend</p>
                  <p className="text-xs text-gray-500">Post summary into their DM</p>
                </div>
                <span className="text-gray-600">›</span>
              </button>

              <button
                type="button"
                disabled={!cardBlob || xSharing}
                onClick={() => { playClickSound(); shareToX() }}
                className="w-full rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-3 py-2.5 text-left flex items-center gap-3"
              >
                <span className="text-lg shrink-0">𝕏</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">Share on X (Twitter)</p>
                  <p className="text-xs text-gray-500">Copy image + open draft with text</p>
                </div>
                <span className="text-gray-600">↗</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!cardBlob}
                  onClick={() => { playClickSound(); copyImage() }}
                  className="rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-colors px-3 py-2 text-left flex items-center gap-2 text-xs text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="shrink-0">📋</span>
                  <span className="flex-1">Copy image</span>
                </button>
                <button
                  type="button"
                  disabled={!cardBlob}
                  onClick={() => { playClickSound(); downloadCard() }}
                  className="rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-colors px-3 py-2 text-left flex items-center gap-2 text-xs text-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="shrink-0">⬇</span>
                  <span className="flex-1">Download PNG</span>
                </button>
              </div>
            </div>
          )}

          {step === 'friends' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => { playClickSound(); setStep('menu'); setFriendQuery('') }}
                className="text-xs text-gray-500 hover:text-white mb-1"
              >
                ‹ Back
              </button>
              <div className="relative">
                <input
                  type="text"
                  value={friendQuery}
                  onChange={(e) => setFriendQuery(e.target.value)}
                  placeholder="Search friends…"
                  className="w-full bg-white/5 border border-white/10 focus:border-accent/50 focus:outline-none rounded-md px-3 py-2 text-sm text-white placeholder:text-gray-600"
                  autoFocus
                />
                {friendQuery && (
                  <button
                    type="button"
                    onClick={() => setFriendQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs px-1"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              {friendsLoading ? (
                <p className="text-xs text-gray-500 text-center py-4">Loading friends...</p>
              ) : friends.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">
                  No friends to share with yet.
                </p>
              ) : filteredFriends.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">
                  No matches for "{friendQuery}".
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {filteredFriends.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={busyFriendId !== null}
                      onClick={() => { playClickSound(); sendToFriend(f.id, f.username) }}
                      className="w-full rounded-md bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2.5 py-2 text-left flex items-center gap-2.5"
                    >
                      <AvatarWithFrame
                        avatar={f.avatar_url || '🤖'}
                        frameId={f.equipped_frame}
                        sizeClass="w-9 h-9"
                        textClass="text-base"
                        ringOpacity={0.8}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{f.username || 'friend'}</p>
                        <p className={`text-xs truncate ${f.is_online ? 'text-emerald-400/80' : 'text-gray-500'}`}>
                          {busyFriendId === f.id ? 'Sending…' : f.is_online ? 'Online' : 'Offline'}
                          {f.level > 0 ? ` · Lv ${f.level}` : ''}
                        </p>
                      </div>
                      <span className="text-gray-500 text-[10px] uppercase tracking-wider shrink-0 bg-accent/10 border border-accent/30 text-accent px-2 py-1 rounded">Send</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
