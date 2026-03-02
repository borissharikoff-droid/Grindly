import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'

export function TopBar() {
  const { user, signOut } = useAuthStore()

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-discord-dark/90 backdrop-blur shrink-0">
      <div className="flex items-center">
        <h1 className="font-mono text-xl font-semibold text-white tracking-wide">
          Grindly
        </h1>
        <span className="ml-3 font-mono text-xs text-gray-500 border-l border-white/10 pl-3">
          [ productivity tracker ]
        </span>
      </div>
      {supabase && user && (
        <button
          onClick={() => signOut()}
          className="text-xs text-gray-400 hover:text-white font-mono"
        >
          Sign out
        </button>
      )}
    </header>
  )
}
