# ZPL Setup Guide

## Quick Start

Your ZPL application is ready! Follow these steps to get it running:

## 1. Enable Anonymous Authentication

**Important:** You must enable anonymous sign-in in Supabase for the app to work.

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Scroll to **Anonymous Sign-ins**
5. **Enable** anonymous sign-ins
6. Save changes

## 2. Verify Database Tables

Your database already has these tables set up:
- ✅ `rooms` - Game room information
- ✅ `moves` - Player selections
- ✅ `scores` - Game scores

All tables have **Row Level Security (RLS)** enabled with proper policies.

## 3. Environment Variables

Already configured in `.env`:
```
VITE_SUPABASE_URL=https://tgjqezodqcvaxepdbaml.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 4. Run the Application

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev
```

Visit: `http://localhost:5173`

## 5. Test the Game

### Create a Room:
1. Click **Create Room**
2. Copy the 6-digit code
3. Share with a friend

### Join a Room:
1. Open the app in another browser/tab
2. Click **Join Room**
3. Enter the 6-digit code
4. Click **Join Room**

### Play:
- Select numbers 1-6 each ball
- Same number = OUT
- Different numbers = runs for batter
- 10 balls per innings
- Switch roles after first innings

## Architecture Overview

```
┌─────────────┐
│   React UI  │ (Vite + TypeScript)
└──────┬──────┘
       │
       ↓
┌─────────────────┐
│  Supabase SDK   │
└──────┬──────────┘
       │
       ↓
┌─────────────────────────────────┐
│  Supabase Backend               │
│  • PostgreSQL Database          │
│  • Realtime Subscriptions       │
│  • Anonymous Authentication     │
│  • Row Level Security (RLS)     │
└─────────────────────────────────┘
```

## Real-time Features

The game uses **Supabase Realtime** to sync:
- ✅ Player joins → Both players notified instantly
- ✅ Number selections → Revealed simultaneously
- ✅ Score updates → Live score tracking
- ✅ Game state → Turn indicators, innings changes

## Security Features

**Row Level Security (RLS) Policies:**
```sql
-- Only players in a room can view room data
-- Only players in a room can update room data
-- Only players in a room can insert moves
-- Only players in a room can view/update scores
```

This ensures:
- Players can only see their own games
- No unauthorized access to game data
- Secure real-time updates

## Troubleshooting

### "Failed to sign in" Error
**Solution:** Enable anonymous authentication in Supabase (see step 1 above)

### Room Code Not Working
**Possible causes:**
- Code was mistyped (must be exactly 6 digits)
- Room already has 2 players
- Room game already finished

### Real-time Updates Not Working
**Check:**
1. Supabase Realtime is enabled (enabled by default)
2. Browser console for errors
3. Network connectivity

### Build Warnings
The build shows a warning about chunk sizes. This is normal for the initial bundle and can be optimized later with:
```js
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion'],
          'supabase-vendor': ['@supabase/supabase-js']
        }
      }
    }
  }
})
```

## Testing Locally with Two Players

**Option 1: Two Browser Windows**
1. Open `localhost:5173` in regular window
2. Open `localhost:5173` in incognito/private window
3. Create room in window 1
4. Join room in window 2

**Option 2: Two Different Browsers**
1. Open in Chrome
2. Open in Firefox/Safari/Edge
3. Create/join from different browsers

**Option 3: Two Devices**
1. Run dev server: `npm run dev -- --host`
2. Access from phone: `http://YOUR_LOCAL_IP:5173`
3. Access from computer: `http://localhost:5173`

## Production Deployment

### Deploy to Vercel
```bash
npm install -g vercel
vercel --prod
```

### Deploy to Netlify
```bash
npm run build
# Upload dist/ folder to Netlify
```

### Environment Variables for Production
Add these to your hosting platform:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## What's Included

✅ **6 Pages:**
- Home Page
- Create Room Page
- Join Room Page
- Waiting Room Page
- Game Page
- Result Page

✅ **Supabase Integration:**
- PostgreSQL database with 3 tables
- Real-time subscriptions
- Anonymous authentication
- Row Level Security

✅ **UI Components:**
- shadcn/ui components
- Framer Motion animations
- Mobile responsive design
- Dark mode support (press 'D' key)

✅ **Game Logic:**
- Room creation with random codes
- Player matching
- Turn-based gameplay
- Score tracking
- Automatic innings switching
- Winner calculation

## Next Steps

1. Enable anonymous auth (step 1 above)
2. Run `npm run dev`
3. Open in two browsers
4. Test the game!

## Support

If you encounter issues:
1. Check Supabase Dashboard for auth settings
2. Verify environment variables in `.env`
3. Check browser console for errors
4. Review RLS policies in Supabase

Enjoy playing ZPL! 🏏
