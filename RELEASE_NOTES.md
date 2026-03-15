## What's new in v3.7.0

**Improved:**
- Installed `lucide-react` icon library — replaced emoji navigation icons with sharp, consistent SVG icons across all tabs and page headers
- All pages now use the shared `PageHeader` component — unified structure across Home, Stats, Skills, Cooking, and all other pages
- BottomNav primary tabs and More popup now use Lucide icons (Home, Zap, Users, BarChart3, MoreHorizontal, Sword, ShoppingCart, Hammer, Sprout, Package, User, Settings)
- BackButton now uses Lucide `ChevronLeft` (replaced hand-written SVG)
- Each page header now shows a color-coded Lucide icon matching the page (e.g. red Sword for Arena, green Sprout for Farm, orange Hammer for Craft)
- CookingPage CSS island removed — animations moved to global CSS for consistent behavior; page now uses standard container and PageHeader
- HomePage bottom zone spacing fixed (pb-20 for proper bottom nav clearance)
- Marketplace lazy-load fallback standardized to shared PageLoading component
- Close buttons (✕) across Inventory, Marketplace, and Goal widget replaced with Lucide X icon

---
Released: 2026-03-15

---

## What's new in v3.6.0

**New:**
- 4 new arena zones: Slime Dungeon, Wolf Forest, Troll Cavern, Dragon Lair — each with miniboss mobs before the boss
- Login with username (in addition to email)
- Escape key closes modals (arena result, streak, what's new)
- Remote patch notes fetched from server
- Admin skill XP override support

**Improved:**
- Cooking: richer animations (confetti, shake, golden flash, ring burn/bonus effects)
- Cooking: rarity-scaled completion sounds + error/discovery sounds
- Navbar icons support custom images from dashboard
- Auth screen: animated sign-in ↔ sign-up transition
- Chef XP now syncs correctly across devices

**Fixed:**
- Arena victory gold not being awarded in some cases

---
Released: 2026-03-14
