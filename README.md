# ZPL - Zoom Premier League

A real-time multiplayer hand cricket game where two players can play online using a room code.

## Features

- **Room System**: Create or join rooms with 6-digit codes
- **Real-time Gameplay**: Instant synchronization using Supabase Realtime
- **Hand Cricket Rules**:
  - Both players select numbers 1-6
  - Same number = OUT
  - Different numbers = runs for batter
- **Two Innings**: Each player gets 10 balls per innings
- **Beautiful UI**: Built with shadcn/ui and Framer Motion animations
- **Anonymous Play**: No registration required

## Tech Stack

### Frontend
- React + TypeScript + Vite
- Tailwind CSS for styling
- Framer Motion for animations
- shadcn/ui components
- React Router for navigation

### Backend
- Supabase (PostgreSQL database)
- Supabase Realtime for live updates
- Supabase Auth (anonymous login)

## Setup Instructions

### 1. Database Setup

The Supabase database is already configured with:

**Tables:**
- `rooms` - Stores game room information
- `moves` - Records each player's number selection
- `scores` - Tracks game scores and wickets

**Row Level Security (RLS):**
- All tables have RLS enabled
- Only players in a room can access room data
- Secure policies prevent data leakage

### 2. Environment Variables

Already configured in `.env`:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 5. Build for Production

```bash
npm run build
```

## How to Play

### Creating a Room

1. Click **Create Room** on the home page
2. A 6-digit room code will be generated
3. Share this code with your opponent
4. Wait in the waiting room until they join

### Joining a Room

1. Click **Join Room** on the home page
2. Enter the 6-digit room code
3. Click **Join Room** to start playing

### Gameplay

**First Innings:**
- One player is randomly assigned as the first batter
- Each ball, both players select a number (1-6)
- If numbers match → OUT (wicket)
- If different → runs = batter's number
- Innings ends after 10 balls or 1 wicket

**Second Innings:**
- Players switch roles
- Second batter chases the target
- Game ends after 10 balls or 1 wicket

**Winning:**
- Higher score wins
- Equal scores = Draw

## Game Flow

```
Home → Create/Join Room → Waiting Room → Game Screen → Result
```

## Real-time Features

The game uses Supabase Realtime subscriptions to sync:
- Player joins
- Number selections
- Score updates
- Game state changes

Both players see updates instantly without page refreshes.

## Database Schema

### rooms
```sql
id              uuid (PK)
room_code       text (unique, 6 digits)
player1_id      uuid
player2_id      uuid
status          text (waiting/playing/finished)
current_turn    text (player1/player2)
current_innings integer (1 or 2)
first_batter    text (player1/player2)
```

### moves
```sql
id              uuid (PK)
room_id         uuid (FK)
player_id       uuid
selected_number integer (1-6)
ball_number     integer
innings         integer (1 or 2)
```

### scores
```sql
id              uuid (PK)
room_id         uuid (FK, unique)
player1_score   integer
player2_score   integer
player1_wickets integer
player2_wickets integer
balls_played    integer
```

## UI Components Used

- Card, CardHeader, CardContent, CardTitle, CardDescription
- Button (with variants: default, outline)
- Input
- Badge
- Spinner
- Toaster (for notifications)

## Animations

Framer Motion animations include:
- Page transitions (fade + scale)
- Button hover/tap effects
- Score updates (scale pulse)
- Turn indicators
- Result reveals

## Security

- Row Level Security (RLS) enabled on all tables
- Anonymous authentication for quick play
- Players can only access their own room data
- Real-time updates secured by RLS policies

## Mobile Responsive

The app is fully responsive and works on:
- Desktop (1400x900+)
- Tablets
- Mobile devices

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Troubleshooting

**"Failed to sign in" error:**
- Ensure Supabase anonymous auth is enabled in your Supabase project
- Check that environment variables are correct

**Room not found:**
- Verify the room code is correct (6 digits)
- Ensure the room hasn't expired

**Not receiving real-time updates:**
- Check your Supabase Realtime is enabled
- Verify network connection
- Check browser console for errors

## Development Notes

- Uses Vite for fast development
- TypeScript for type safety
- ESLint configured
- Supabase client configured with proper types
- Clean component architecture with separate pages

## Future Enhancements

- Player usernames
- Game history
- Leaderboards
- Sound effects
- Multiple innings
- Tournament mode
- Chat feature

## License

Non-Commercial Software License (See `LICENSE.txt` for details)

## Credits

Built with ❤️ using:
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Supabase](https://supabase.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Framer Motion](https://www.framer.com/motion/)
- [Tailwind CSS](https://tailwindcss.com/)
