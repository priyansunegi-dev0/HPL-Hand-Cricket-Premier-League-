import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Room = {
  id: string
  room_code: string
  player1_id: string
  player2_id: string | null
  status: 'waiting' | 'playing' | 'finished'
  current_turn: 'player1' | 'player2' | null
  current_innings: number
  first_batter: string | null
  game_status?: string
  ball_start_time?: string
  current_ball_number?: number
  created_at: string
  updated_at: string
}

export type Move = {
  id: string
  room_id: string
  player_id: string
  selected_number: number
  ball_number: number
  innings: number
  is_processed?: boolean
  created_at: string
}

export type Score = {
  id: string
  room_id: string
  player1_score: number
  player2_score: number
  player1_wickets: number
  player2_wickets: number
  balls_played: number
  created_at: string
  updated_at: string
}

export type GameState = {
  id: string
  room_id: string
  current_ball_number: number
  player1_choice: number | null
  player2_choice: number | null
  ball_result: string | null
  runs_scored: number
  ball_start_time: string | null
  both_players_submitted: boolean
  created_at: string
  updated_at: string
}
