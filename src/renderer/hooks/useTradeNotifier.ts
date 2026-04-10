import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useTradeStore, type TradeOffer } from '../stores/tradeStore'
import { useNotificationStore } from '../stores/notificationStore'

/**
 * Global trade realtime listener — runs at App level so trade notifications
 * fire regardless of which tab the user is on.
 *
 * Also does an initial DB check immediately + after subscription connects to
 * catch trades that arrived before the WebSocket connection was ready.
 */
export function useTradeNotifier() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const notifiedIds = useRef(new Set<string>())

  function pushTradeNotification(offer: TradeOffer) {
    if (notifiedIds.current.has(offer.id)) return
    notifiedIds.current.add(offer.id)
    const name = offer.initiator_username ?? 'Someone'
    useNotificationStore.getState().push({
      type: 'trade_offer',
      icon: '⇄',
      title: 'Trade Offer',
      body: `${name} wants to trade with you`,
      tradeOffer: { offerId: offer.id, initiatorName: name },
    })
  }

  useEffect(() => {
    if (!supabase || !userId) return

    // Fetch pending incoming trades, enrich with usernames, populate store + notify
    async function initialCheck() {
      if (!supabase) return
      const { data } = await supabase
        .from('trade_offers')
        .select('*')
        .eq('recipient_id', userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (!data?.length) return

      const ids = [...new Set((data as TradeOffer[]).map((o) => o.initiator_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', ids)
      const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p] as [string, { username?: string; avatar_url?: string }]))

      const { incomingOffers, setIncomingOffers, setIncomingOffer } = useTradeStore.getState()
      const knownIds = new Set(incomingOffers.map((o) => o.id))

      const enriched: TradeOffer[] = (data as TradeOffer[]).map((o) => ({
        ...o,
        initiator_username: profileMap[o.initiator_id]?.username ?? null,
        initiator_avatar: profileMap[o.initiator_id]?.avatar_url ?? null,
      }))

      // Populate store with full list
      setIncomingOffers(enriched)

      // Notify about any offers we didn't already know about
      for (const offer of enriched) {
        if (!knownIds.has(offer.id)) {
          // Set banner only for the newest unknown offer
          if (offer === enriched.find((o) => !knownIds.has(o.id))) {
            setIncomingOffer(offer)
          }
          pushTradeNotification(offer)
        }
      }
    }

    // Run immediately — don't wait for SUBSCRIBED so users see notifications right away
    initialCheck().catch(() => {})

    const channel = supabase
      .channel('global-trade-notifier')
      // New incoming offer
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trade_offers', filter: `recipient_id=eq.${userId}` },
        async (payload) => {
          if (!supabase) return
          const offer = payload.new as TradeOffer
          const { data: p } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', offer.initiator_id)
            .single()
          const enriched: TradeOffer = {
            ...offer,
            initiator_username: (p as { username?: string } | null)?.username ?? null,
            initiator_avatar: (p as { avatar_url?: string } | null)?.avatar_url ?? null,
          }
          const { setIncomingOffer, addIncomingOffer } = useTradeStore.getState()
          setIncomingOffer(enriched)
          addIncomingOffer(enriched)
          pushTradeNotification(enriched)
        },
      )
      // Incoming offer cancelled/expired by initiator
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trade_offers', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as TradeOffer
          if (updated.status !== 'pending') {
            const { incomingOffer, setIncomingOffer, removeIncomingOffer } = useTradeStore.getState()
            if (incomingOffer?.id === updated.id) setIncomingOffer(null)
            removeIncomingOffer(updated.id)
          }
        },
      )
      // Outgoing offer accepted/declined/expired
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trade_offers', filter: `initiator_id=eq.${userId}` },
        async (payload) => {
          const updated = payload.new as TradeOffer
          if (updated.status === 'accepted' || updated.status === 'completed') {
            // Notify the initiator that their offer was accepted
            if (supabase) {
              const { data: p } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', updated.recipient_id)
                .single()
              const name = (p as { username?: string } | null)?.username ?? 'Someone'
              useNotificationStore.getState().push({
                type: 'trade_offer',
                icon: '✓',
                title: 'Trade Accepted',
                body: `${name} accepted your trade offer`,
              })
            }
          }
          if (updated.status !== 'pending') {
            useTradeStore.getState().removeOutgoingOffer(updated.id)
          }
        },
      )
      .subscribe((status) => {
        // Also run on SUBSCRIBED as a catch-all for any race during connection
        if (status === 'SUBSCRIBED') {
          initialCheck().catch(() => {})
        }
      })

    return () => {
      supabase.removeChannel(channel).catch(() => {})
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps
}
