import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase, type Room, type Score, type GameState } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface BallMessage {
  ball: number
  innings: number
  result: string
  p1_choice: number | null
  p2_choice: number | null
  p1_score: number
  p2_score: number
  timestamp: number
}

/**
 * REAL-TIME MULTIPLAYER HAND CRICKET GAME
 *
 * Architecture:
 * - Database is the SINGLE SOURCE OF TRUTH (rooms, scores, game_state tables)
 * - Real-time subscriptions keep both players perfectly synced
 * - Timer calculated from ball_start_time using server timestamp
 * - ONLY Player 1 (host) processes ball results to prevent race conditions
 */

export function GamePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()

  // Game State - read from DB via subscriptions
  const [room, setRoom] = useState<Room | null>(null)
  const [score, setScore] = useState<Score | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const previousBallRef = useRef<number>(0)
  // Track which ball number the player has SUBMITTED for, to avoid clearing selectedNumber
  const submittedForBallRef = useRef<number | null>(null)
  const [ballMessages, setBallMessages] = useState<BallMessage[]>([])
  // Dedup set: tracks "innings-ball" keys already added to ballMessages
  const addedMessagesRef = useRef<Set<string>>(new Set())
  // Track last balls_played seen (reliable alternative to oldScore.balls_played)
  const lastBallsPlayedRef = useRef<number>(0)
  const currentInnings = room?.current_innings || 1
  const currentInningsRef = useRef<number>(currentInnings)
  useEffect(() => { currentInningsRef.current = currentInnings }, [currentInnings])
  const [showResultModal, setShowResultModal] = useState(false)
  const [matchResult, setMatchResult] = useState<{ winner: string; targetScore: number; player1Score: number; player2Score: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // UI State
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [serverTimeOffset, setServerTimeOffset] = useState(0)
  const [remainingTime, setRemainingTime] = useState(13)
  const [opponentReady, setOpponentReady] = useState(false)
  const isProcessingRef = useRef(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [startCountdown, setStartCountdown] = useState<number | null>(null)
  const [isTossActive, setIsTossActive] = useState(false)
  const [headsPos, setHeadsPos] = useState<'top' | 'bottom'>('top')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep a ref of latest room/score/gameState so async callbacks always have fresh data
  const roomRef = useRef<Room | null>(null)
  const scoreRef = useRef<Score | null>(null)
  const gameStateRef = useRef<GameState | null>(null)
  const playerIdRef = useRef<string | null>(null)
  // Store player1_id from initial room load (never changes, avoids stale closure issues)
  const player1IdRef = useRef<string | null>(null)
  // Tracks whether the result modal has been triggered once — prevents X-button close
  // from immediately re-opening the modal (useEffect re-fires on state change otherwise).
  const hasShownResultRef = useRef(false)

  useEffect(() => { roomRef.current = room }, [room])
  useEffect(() => { scoreRef.current = score }, [score])
  useEffect(() => { gameStateRef.current = gameState }, [gameState])
  useEffect(() => { playerIdRef.current = playerId }, [playerId])

  // Initialize
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.error('Not authenticated')
        navigate('/')
        return
      }

      setPlayerId(user.id)

      // Get server time offset for synchronized timer
      const { data: serverTime } = await supabase.rpc('get_server_timestamp')
      if (serverTime) {
        setServerTimeOffset(Date.now() - new Date(serverTime).getTime())
      }

      setLoading(false)
    }

    init()
  }, [navigate])

  // Main subscription to all game data
  useEffect(() => {
    if (!roomId || !playerId) return

    let mounted = true

    const setupSubscriptions = async () => {
      // Fetch initial state
      const [roomRes, scoreRes, gameStateRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).single(),
        supabase.from('scores').select('*').eq('room_id', roomId).single(),
        supabase.from('game_state').select('*').eq('room_id', roomId).single(),
      ])

      if (mounted) {
        if (roomRes.data) {
          setRoom(roomRes.data)
          player1IdRef.current = roomRes.data.player1_id
        }
        if (scoreRes.data) {
          setScore(scoreRes.data)
          lastBallsPlayedRef.current = scoreRes.data.balls_played
        }
        if (gameStateRes.data) {
          setGameState(gameStateRes.data)
          previousBallRef.current = gameStateRes.data.current_ball_number
        }
      }

      const channels: any[] = []

      const roomChannel = supabase.realtime
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          (payload) => {
            if (!mounted) return
            const newRoom = payload.new as Room
            setRoom(prev => prev ? { ...prev, ...newRoom } : newRoom)
            // Update currentInnings state explicitly for both players
            if (newRoom.current_innings && newRoom.current_innings !== (roomRef.current?.current_innings || 1)) {
              if (newRoom.current_innings === 2) {
                toast.success('🔄 Innings 2 started! Roles switched — Batter becomes Bowler!')
              }
            }
          }
        )
        .on(
          'broadcast',
          { event: 'toss_won' },
          (payload) => {
            if (!mounted) return
            setRoom(prev => prev ? { ...prev, first_batter: payload.payload.winner } : null)
            setIsTossActive(false)
            setGameStarted(true)
            if (payload.payload.winner === playerIdRef.current) {
               // We won, already handled locally
            } else {
               toast.info('Opponent won the Toss! You are bowling first.')
            }
          }
        )
        .on(
          'broadcast',
          { event: 'match_complete' },
          (payload) => {
            if (!mounted) return
            const { winner, targetScore, player1Score, player2Score } = payload.payload
            // Set for BOTH players — processor already set it locally, this is idempotent
            setMatchResult({ winner, targetScore, player1Score, player2Score })
            setShowResultModal(true)
          }
        )
        .subscribe()
      channels.push(roomChannel)

      // Subscribe to game_state - main game logic
      const gameStateChannel = supabase.realtime
        .channel(`game_state:${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_state', filter: `id=eq.${gameStateRes.data?.id}` },
          (payload) => {
            if (!mounted) return
            // Merge to avoid partial payload overwriting full game state
            const newGameState = payload.new as GameState
            setGameState(prev => prev ? { ...prev, ...newGameState } : newGameState)

            // NEW BALL DETECTION: only reset selectedNumber if genuinely a new ball
            if (newGameState.current_ball_number !== previousBallRef.current) {
              const prevBall = previousBallRef.current
              previousBallRef.current = newGameState.current_ball_number
              submittedForBallRef.current = null
              setSelectedNumber(null)
              setOpponentReady(false)

              // INNINGS SWITCH DETECTION: ball reset to 1 from a higher number means innings changed.
              // Fix 1: re-fetch room so current_innings is accurate → correct isBatting for both players.
              // Fix 2: re-fetch scores so right player (room.player2) has accurate scores at start of innings 2.
              // Fix 3: reset lastBallsPlayedRef to 0 so the score-patch in score subscription works
              //         (innings 2 balls_played resets to 1..10, which is ≤ 10 = end of innings 1, so
              //          patch never fires without this reset).
              if (newGameState.current_ball_number === 1 && prevBall > 1) {
                lastBallsPlayedRef.current = 0  // reset so innings-2 patches: 1>0, 2>0, etc.
                Promise.all([
                  supabase.from('rooms').select('*').eq('id', roomId).single(),
                  supabase.from('scores').select('*').eq('room_id', roomId).single(),
                ]).then(([{ data: roomData }, { data: scoreData }]) => {
                  if (roomData && mounted) setRoom(roomData)
                  if (scoreData && mounted) setScore(scoreData)
                })
              }
            }

            // Track opponent readiness
            if (newGameState.player1_choice && newGameState.player2_choice) {
              setOpponentReady(true)
            } else if (!newGameState.player1_choice || !newGameState.player2_choice) {
              setOpponentReady(false)
            }

            // ── BALL MESSAGE (fires for BOTH players via subscription) ──
            // Add when ball_result is newly set on this game_state update
            if (newGameState.ball_result) {
              const msgKey = `${currentInningsRef.current}-${newGameState.current_ball_number}`
              if (!addedMessagesRef.current.has(msgKey)) {
                addedMessagesRef.current.add(msgKey)
                // Use scoreRef as initial values; we'll patch with fresh DB score below
                const currentScore = scoreRef.current
                setBallMessages(prev => [...prev, {
                  ball: newGameState.current_ball_number,
                  innings: currentInningsRef.current,
                  result: newGameState.ball_result!,
                  p1_choice: newGameState.player1_choice,
                  p2_choice: newGameState.player2_choice,
                  p1_score: currentScore?.player1_score ?? 0,
                  p2_score: currentScore?.player2_score ?? 0,
                  timestamp: Date.now()
                }])
                setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, 100)

                // Fetch fresh score from DB to patch the just-added message with accurate totals.
                // This is critical for non-P1 players whose scoreRef may lag behind game_state.
                // Also updates the live score boxes via setScore.
                const ballNum = newGameState.current_ball_number
                const inningsNum = currentInningsRef.current
                supabase.from('scores').select('*').eq('room_id', roomId).single().then(({ data: freshScore }) => {
                  if (!freshScore || !mounted) return
                  setScore(freshScore)
                  setBallMessages(prev => {
                    if (prev.length === 0) return prev
                    const updated = [...prev]
                    // Find and patch the specific ball message we just added (ES2022-safe reverse search)
                    let idx = -1
                    for (let i = updated.length - 1; i >= 0; i--) {
                      if (updated[i].innings === inningsNum && updated[i].ball === ballNum) {
                        idx = i
                        break
                      }
                    }
                    if (idx !== -1) {
                      updated[idx] = {
                        ...updated[idx],
                        p1_score: freshScore.player1_score,
                        p2_score: freshScore.player2_score
                      }
                    }
                    return updated
                  })
                })
              }
            }

            // ONLY Player 1 processes ball results - prevents race condition
            const isP1 = playerIdRef.current === player1IdRef.current
            if (
              isP1 &&
              newGameState.player1_choice &&
              newGameState.player2_choice &&
              !newGameState.ball_result &&
              !isProcessingRef.current
            ) {
              processBall(newGameState.player1_choice, newGameState.player2_choice, newGameState)
            }
          }
        )
        .subscribe()
      channels.push(gameStateChannel)

      // Subscribe to score changes - update scores for BOTH players live
      const scoreChannel = supabase.realtime
        .channel(`score:${roomId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'scores', filter: `id=eq.${scoreRes.data?.id}` },
          (payload) => {
            if (!mounted) return
            const newScore = payload.new as Score


            // Update the score in ball messages if the balls_played ref changed
            // (scores arrive slightly after game_state, so patch last message with correct totals)
            if (newScore.balls_played > lastBallsPlayedRef.current) {
              lastBallsPlayedRef.current = newScore.balls_played
              setBallMessages(prev => {
                if (prev.length === 0) return prev
                const updated = [...prev]
                const last = updated[updated.length - 1]
                updated[updated.length - 1] = {
                  ...last,
                  p1_score: newScore.player1_score,
                  p2_score: newScore.player2_score
                }
                return updated
              })
            }

            // Always update live scores for both players, merging to preserve fields
            setScore(prev => prev ? { ...prev, ...newScore } : newScore)
          }
        )
        .subscribe()
      channels.push(scoreChannel)

      return () => {
        mounted = false
        channels.forEach(ch => ch.unsubscribe())
      }
    }

    const unsubscribe = setupSubscriptions()
    return () => {
      unsubscribe.then(fn => fn?.())
    }
  }, [roomId, playerId, navigate])

  // AUTO-START GAME when opponent joins - ONLY Player 1 (room creator) should do this
  useEffect(() => {
    if (!roomId || !room || !playerId || room.status === 'playing') return
    if (!room.player2_id || gameStarted) return
    // Only the room creator (player1) initializes the game to prevent race conditions
    if (playerId !== player1IdRef.current) return

    // Stop refresh polling when opponent joins
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = null
    }

    const autoStartGame = async () => {
      try {
        await supabase.from('rooms').update({ status: 'playing' }).eq('id', roomId)
      } catch (error) {
        console.error('❌ [AUTO-START] Error starting game:', error)
      }
    }

    const timer = setTimeout(autoStartGame, 500)
    return () => clearTimeout(timer)
  }, [roomId, room?.status, room?.player2_id, playerId, gameStarted])

  // REFRESH POLLING - Auto-refresh room state before opponent joins
  useEffect(() => {
    if (!roomId || !playerId || room?.player2_id || room?.status === 'playing') {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
      return
    }

    const refreshRoomPoll = async () => {
      try {
        const { data: updatedRoom } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .single()

        if (updatedRoom) setRoom(updatedRoom)
      } catch (error) {
        console.error('❌ [POLL] Refresh error:', error)
      }
    }

    refreshRoomPoll()
    refreshIntervalRef.current = setInterval(refreshRoomPoll, 1000)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [roomId, playerId, room?.player2_id, room?.status])

  // Manual refresh button handler
  const handleManualRefresh = async () => {
    if (!roomId) return

    setIsRefreshing(true)
    try {
      const { data: updatedRoom } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (updatedRoom) {
        setRoom(updatedRoom)
        if (updatedRoom.player2_id) {
          toast.success('Opponent joined!')
        } else {
          toast.info('Still waiting for opponent...')
        }
      }
    } catch (error) {
      toast.error('Refresh failed')
    } finally {
      setIsRefreshing(false)
    }
  }

  // Game start countdown animation (5,4,3,2,1)
  useEffect(() => {
    if (!room?.player2_id || room?.status !== 'playing' || gameStarted) return

    let countdown = 5
    setStartCountdown(countdown)

    const interval = setInterval(() => {
      countdown -= 1
      if (countdown < 0) {
        clearInterval(interval)
        setStartCountdown(null)
        if (!roomRef.current?.first_batter) {
          setIsTossActive(true)
        } else {
          setGameStarted(true)
        }
      } else {
        setStartCountdown(countdown)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [room?.player2_id, room?.status, gameStarted])

  // SYNCHRONIZED TIMER
  useEffect(() => {
    if (!gameState?.ball_start_time || room?.status !== 'playing' || !gameStarted) {
      return
    }

    const updateTimer = () => {
      const ballStartTime = new Date(gameState.ball_start_time!).getTime()
      const currentTime = Date.now() - serverTimeOffset
      const elapsed = (currentTime - ballStartTime) / 1000
      const remaining = Math.max(0, 13 - Math.ceil(elapsed))

      setRemainingTime(remaining)

      if (remaining === 0) {
        handleTimerExpire()
      }
    }

    const interval = setInterval(updateTimer, 100)
    updateTimer()
    return () => clearInterval(interval)
  }, [gameState?.ball_start_time, room?.status, serverTimeOffset, gameStarted])

  const handleTimerExpire = async () => {
    if (!roomId || !roomRef.current || isProcessingRef.current) return

    const { data: state } = await supabase
      .from('game_state')
      .select('*')
      .eq('room_id', roomId)
      .single()

    if (state?.ball_result) return
    if (isProcessingRef.current) return

    // Only Player 1 handles timer expiry logic
    const isP1 = playerIdRef.current === roomRef.current?.player1_id
    if (!isP1) return

    if (state?.player1_choice && state?.player2_choice) {
      await processBall(state.player1_choice, state.player2_choice, state)
    } else {
      await processDotBall()
    }
  }

  // --- TOSS LOGIC ---
  useEffect(() => {
    if (isTossActive) {
      const interval = setInterval(() => {
        setHeadsPos(prev => prev === 'top' ? 'bottom' : 'top')
      }, 400) // Snapshot swap every 400ms
      return () => clearInterval(interval)
    }
  }, [isTossActive])

  const handleTossClick = async (choice: 'heads' | 'tails') => {
    if (!roomId || !playerId || !isTossActive || room?.first_batter) return
    
    if (choice === 'heads') {
      toast.success('You tapped HEADS! Resolving toss...')
      
      // Fire update without `.is()` because some versions of Supabase drop it silently
      const { data, error } = await supabase
        .from('rooms')
        .update({ first_batter: playerId })
        .eq('id', roomId)
        .select()
        
      if (error) {
        console.error('[TOSS] Supabase update error:', error)
        toast.error('Toss update failed on server')
      } else if (data && data.length > 0) {
        // WE won the toss update
        setIsTossActive(false)
        setGameStarted(true)
        setRoom(prev => prev ? { ...prev, first_batter: playerId } : null)
        
        // Broadcast the win to the opponent instantly over WebSockets!
        await supabase.realtime.channel(`room:${roomId}`).send({
          type: 'broadcast',
          event: 'toss_won',
          payload: { winner: playerId }
        })
      } else {
        // Fallback for unexpected empty return
        toast.error('Toss unresolved. Please retry.')
      }
    } else {
      toast.error('Oops! Only HEADS wins the toss!')
    }
  }

  useEffect(() => {
    if (room?.first_batter) {
      if (isTossActive) {
        setIsTossActive(false)
        setGameStarted(true)
      }
      
      // If P1, init ball 1 when first_batter resolves
      if (playerId === player1IdRef.current && (!gameState?.ball_start_time || gameState.current_ball_number === 0)) {
        const initBall = async () => {
          const { data: serverTime } = await supabase.rpc('get_server_timestamp')
          const ballStartTime = serverTime || new Date().toISOString()
          await supabase.from('game_state').update({
            current_ball_number: 1,
            ball_start_time: ballStartTime,
            ball_result: null,
            player1_choice: null,
            player2_choice: null
          }).eq('room_id', roomId)
        }
        initBall()
      }
    }
  }, [room?.first_batter, isTossActive, playerId, roomId, gameState?.ball_start_time, gameState?.current_ball_number])
  // ------------------

  const submitChoice = async (num: number) => {
    if (!roomId || !playerId || !gameState) {
      toast.error('Cannot submit choice')
      return
    }

    // Prevent double submission for same ball
    if (submittedForBallRef.current === gameState.current_ball_number) {
      return
    }

    // If selectedNumber already set, don't allow another (belt and braces)
    if (selectedNumber !== null) {
      return
    }

    setSelectedNumber(num)
    submittedForBallRef.current = gameState.current_ball_number  // Mark submitted ball

    try {
      const isP1 = playerId === room?.player1_id
      const updateData = isP1 ? { player1_choice: num } : { player2_choice: num }

      const { error: submitError } = await supabase.from('game_state').update(updateData).eq('room_id', roomId)

      if (submitError) {
        console.error('❌ [SUBMIT] Database write failed:', submitError)
        setSelectedNumber(null)
        submittedForBallRef.current = null
        toast.error('Failed to submit choice')
        return
      }


      // Player 1: also check immediately if P2 already submitted before this update arrived
      if (isP1) {
        await new Promise(resolve => setTimeout(resolve, 150))

        const { data: updated } = await supabase
          .from('game_state')
          .select('*')
          .eq('room_id', roomId)
          .single()

        if (
          updated?.player1_choice &&
          updated?.player2_choice &&
          !updated?.ball_result &&
          !isProcessingRef.current
        ) {
          await processBall(updated.player1_choice, updated.player2_choice, updated)
        }
      }
    } catch (error) {
      console.error('❌ [SUBMIT] Error:', error)
      setSelectedNumber(null)
      submittedForBallRef.current = null
      toast.error('Submission failed')
    }
  }

  const processBall = async (p1Choice: number, p2Choice: number, gs?: GameState) => {
    // Strict guard: only Player 1 runs this
    const currentRoom = roomRef.current
    const currentScore = scoreRef.current
    const currentGameState = gs || gameStateRef.current

    if (!roomId || !currentRoom || !currentScore || !currentGameState) return
    if (isProcessingRef.current) return

    // Verify caller is P1
    if (playerIdRef.current !== currentRoom.player1_id) return

    isProcessingRef.current = true
    setIsProcessing(true)

    try {
      const currentInnings = currentRoom.current_innings
      const isPlayer1FirstBatter = currentRoom.first_batter === currentRoom.player1_id
      const isPlayer1Batting = currentInnings === 1 ? isPlayer1FirstBatter : !isPlayer1FirstBatter
      const isOut = p1Choice === p2Choice
      const runs = isOut ? 0 : (isPlayer1Batting ? p1Choice : p2Choice)
      const currentBallNum = currentGameState.current_ball_number
      const isLastBall = currentBallNum === 10


      const updatedScore = {
        ...currentScore,
        player1_score: isPlayer1Batting ? currentScore.player1_score + runs : currentScore.player1_score,
        player2_score: isPlayer1Batting ? currentScore.player2_score : currentScore.player2_score + runs,
        player1_wickets: (isPlayer1Batting && isOut) ? currentScore.player1_wickets + 1 : currentScore.player1_wickets,
        player2_wickets: (!isPlayer1Batting && isOut) ? currentScore.player2_wickets + 1 : currentScore.player2_wickets,
        balls_played: currentBallNum,
      }

      // Update score in DB
      const { error: scoreError } = await supabase.from('scores').update(updatedScore).eq('room_id', roomId)
      if (scoreError) {
        console.error('❌ [PROCESS-BALL] Score update error:', scoreError)
      }

      // Immediately update local score state so P1 sees it right away
      setScore(updatedScore as Score)

      // Mark ball result WITH choices stored for message display (prevents timer double-fire)
      const ballResultText = isOut ? 'OUT 🏏' : (runs === 0 ? 'DOT BALL ●' : `${runs} runs ✅`)

      // Add message immediately on P1's side (P2 gets it via score subscription)
      setBallMessages(prev => [...prev, {
        ball: currentBallNum,
        innings: currentInnings,
        result: ballResultText,
        p1_choice: p1Choice,
        p2_choice: p2Choice,
        p1_score: updatedScore.player1_score,
        p2_score: updatedScore.player2_score,
        timestamp: Date.now()
      }])
      setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, 100)

      await supabase
        .from('game_state')
        .update({
          ball_result: ballResultText,
          player1_choice: p1Choice,
          player2_choice: p2Choice
        })
        .eq('room_id', roomId)

      // Hold the result on screen for 1.5s for BOTH players before generating new ball
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (isLastBall) {
        if (currentInnings === 1) {
          const { data: serverTime } = await supabase.rpc('get_server_timestamp')
          const ballStartTime = serverTime || new Date().toISOString()

          await supabase.from('rooms').update({ current_innings: 2 }).eq('id', roomId)
          await supabase.from('game_state').update({
            current_ball_number: 1,
            ball_start_time: ballStartTime,
            ball_result: null,
            player1_choice: null,
            player2_choice: null
          }).eq('room_id', roomId)
        } else if (currentInnings === 2) {
          const player1Score = updatedScore.player1_score
          const player2Score = updatedScore.player2_score
          
          const isPlayer1FirstBatter = currentRoom.first_batter === currentRoom.player1_id
          const inn1Score = isPlayer1FirstBatter ? player1Score : player2Score
          const inn2Score = isPlayer1FirstBatter ? player2Score : player1Score
          const target = inn1Score + 1

          const inn2Player = isPlayer1FirstBatter ? 'player2' : 'player1'
          const inn1Player = isPlayer1FirstBatter ? 'player1' : 'player2'

          const winner = inn2Score >= target ? inn2Player : inn1Player

          setMatchResult({ winner, targetScore: target, player1Score, player2Score })
          setShowResultModal(true)

          // Broadcast match result instantly via WebSocket so BOTH players see the modal
          // at the same time — more reliable than waiting for postgres_changes delivery.
          await supabase.realtime.channel(`room:${roomId}`).send({
            type: 'broadcast',
            event: 'match_complete',
            payload: { winner, targetScore: target, player1Score, player2Score }
          })

          await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
        }
      } else {
        const nextBallNum = currentBallNum + 1
        const { data: serverTime } = await supabase.rpc('get_server_timestamp')
        const ballStartTime = serverTime || new Date().toISOString()


        await supabase.from('game_state').update({
          current_ball_number: nextBallNum,
          ball_start_time: ballStartTime,
          ball_result: null,
          player1_choice: null,
          player2_choice: null
        }).eq('room_id', roomId)
      }

      // Optimistically update local state for P1
      if (isLastBall && currentInnings === 1) {
        setRoom(prev => prev ? { ...prev, current_innings: 2 } : null)
        setGameState(prev => prev ? {
          ...prev,
          current_ball_number: 1,
          ball_result: null,
          player1_choice: null,
          player2_choice: null
        } : null)
      } else if (!isLastBall) {
        setGameState(prev => prev ? {
          ...prev,
          current_ball_number: currentBallNum + 1,
          ball_result: null,
          player1_choice: null,
          player2_choice: null
        } : null)
      }

      setTimeout(() => {
        setSelectedNumber(null)
        submittedForBallRef.current = null
        setOpponentReady(false)
        isProcessingRef.current = false
        setIsProcessing(false)
      }, 500)
    } catch (error) {
      console.error('ERROR [PROCESS-BALL]:', error)
      isProcessingRef.current = false
      setIsProcessing(false)
    }
  }


  const processDotBall = async () => {
    const currentRoom = roomRef.current
    const currentGameState = gameStateRef.current

    if (!roomId || !currentRoom || !currentGameState) return
    if (isProcessingRef.current) return

    // Only Player 1 runs this
    if (playerIdRef.current !== currentRoom.player1_id) return

    isProcessingRef.current = true
    setIsProcessing(true)

    try {
      const currentInnings = currentRoom.current_innings
      const currentBallNum = currentGameState.current_ball_number
      const isLastBall = currentBallNum === 10


      const dotBallText = 'DOT BALL ●'

      // Add dot ball message immediately for P1 (P2 gets it via game_state subscription)
      setBallMessages(prev => [...prev, {
        ball: currentBallNum,
        innings: currentInnings,
        result: dotBallText,
        p1_choice: null,
        p2_choice: null,
        p1_score: scoreRef.current?.player1_score ?? 0,
        p2_score: scoreRef.current?.player2_score ?? 0,
        timestamp: Date.now()
      }])
      setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, 100)

      await supabase
        .from('game_state')
        .update({
          ball_result: dotBallText,
          player1_choice: null,
          player2_choice: null
        })
        .eq('room_id', roomId)

      // Hold the dot ball result on screen for 1.5s for BOTH players
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (isLastBall) {
        if (currentInnings === 1) {
          const { data: serverTime } = await supabase.rpc('get_server_timestamp')
          const ballStartTime = serverTime || new Date().toISOString()

          await supabase.from('rooms').update({ current_innings: 2 }).eq('id', roomId)
          await supabase.from('game_state').update({
            current_ball_number: 1,
            ball_start_time: ballStartTime,
            ball_result: null,
            player1_choice: null,
            player2_choice: null
          }).eq('room_id', roomId)
        } else if (currentInnings === 2) {
          const { data: scoreData } = await supabase.from('scores').select('*').eq('room_id', roomId).single()
          const player1Score = scoreData?.player1_score || 0
          const player2Score = scoreData?.player2_score || 0

          const isPlayer1FirstBatter = currentRoom.first_batter === currentRoom.player1_id
          const inn1Score = isPlayer1FirstBatter ? player1Score : player2Score
          const inn2Score = isPlayer1FirstBatter ? player2Score : player1Score
          const target = inn1Score + 1

          const inn2Player = isPlayer1FirstBatter ? 'player2' : 'player1'
          const inn1Player = isPlayer1FirstBatter ? 'player1' : 'player2'

          const winner = inn2Score >= target ? inn2Player : inn1Player

          setMatchResult({ winner, targetScore: target, player1Score, player2Score })
          setShowResultModal(true)

          // Broadcast so BOTH players see the result modal simultaneously
          await supabase.realtime.channel(`room:${roomId}`).send({
            type: 'broadcast',
            event: 'match_complete',
            payload: { winner, targetScore: target, player1Score, player2Score }
          })

          await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
        }
      } else {
        const nextBallNum = currentBallNum + 1
        const { data: serverTime } = await supabase.rpc('get_server_timestamp')
        const ballStartTime = serverTime || new Date().toISOString()

        await supabase.from('game_state').update({
          current_ball_number: nextBallNum,
          ball_start_time: ballStartTime,
          ball_result: null,
          player1_choice: null,
          player2_choice: null
        }).eq('room_id', roomId)
      }

      if (isLastBall && currentInnings === 1) {
        setRoom(prev => prev ? { ...prev, current_innings: 2 } : null)
        setGameState(prev => prev ? {
          ...prev,
          current_ball_number: 1,
          ball_result: null,
          player1_choice: null,
          player2_choice: null
        } : null)
      } else if (!isLastBall) {
        setGameState(prev => prev ? {
          ...prev,
          current_ball_number: currentGameState.current_ball_number + 1,
          ball_result: null,
          player1_choice: null,
          player2_choice: null
        } : null)
      }

      setTimeout(() => {
        setSelectedNumber(null)
        submittedForBallRef.current = null
        setOpponentReady(false)
        isProcessingRef.current = false
        setIsProcessing(false)
      }, 500)
    } catch (error) {
      console.error('❌ [DOT-BALL] Error:', error)
      isProcessingRef.current = false
      setIsProcessing(false)
    }
  }

  const endGame = async () => {
    if (!roomId) return
    await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
    navigate(`/result/${roomId}`)
  }

  // SHOW RESULT MODAL FOR BOTH PLAYERS when match finishes
  // The broadcast handler covers the non-processor player instantly.
  // This effect is a fallback in case the broadcast is missed (e.g. slow connection).
  // Uses hasShownResultRef so closing the modal with X does NOT re-open it.
  useEffect(() => {
    if (!room || !roomId || room.status !== 'finished' || !playerId) return
    if (hasShownResultRef.current) return  // Already shown once — don't re-open after X

    hasShownResultRef.current = true

    // Fetch fresh final scores so we always compute from accurate data
    supabase.from('scores').select('*').eq('room_id', roomId).single().then(({ data: finalScore }) => {
      if (!finalScore) return

      const isP1FirstBatter = room.first_batter === room.player1_id
      const player1Score = finalScore.player1_score
      const player2Score = finalScore.player2_score
      const inn1Score = isP1FirstBatter ? player1Score : player2Score
      const inn2Score = isP1FirstBatter ? player2Score : player1Score
      const target = inn1Score + 1

      const inn2Player = isP1FirstBatter ? 'player2' : 'player1'
      const winner = inn2Score >= target ? inn2Player : (isP1FirstBatter ? 'player1' : 'player2')

      setMatchResult({ winner, targetScore: target, player1Score, player2Score })
      setShowResultModal(true)
    })
  }, [room?.status, roomId, playerId])

  if (loading || !room || !score || !gameState) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  // Only assign roles after toss resolves
  const isFirstBatter = room.first_batter ? playerId === room.first_batter : false
  const isBatting = currentInnings === 1 ? isFirstBatter : !isFirstBatter
  // Removed playerRole tracking for badges

  // Batting score = the score of whoever is batting this innings
  const batter1_score = room.first_batter === room.player1_id ? score.player1_score : score.player2_score
  const batter2_score = room.first_batter === room.player1_id ? score.player2_score : score.player1_score

  const batterScore = currentInnings === 1 ? batter1_score : batter2_score
  const bowlerScore = currentInnings === 1 ? batter2_score : batter1_score

  // Each player sees their role clearly:
  // Batter: "Your Score (Batting)" = growing score, "Opponent (Bowling)" = 0 or fixed
  // Bowler: "Your Score (Bowling)" = 0 or fixed, "Opponent (Batting)" = growing score
  const myScore = isBatting ? batterScore : bowlerScore
  const theirScore = isBatting ? bowlerScore : batterScore
  
  // P1/P2 tags assigned ONLY based on toss result — no pre-toss assignment
  const isTossWinner = !!room.first_batter && room.first_batter === playerId;
  const myPlayerTag = room.first_batter ? (isTossWinner ? 'P1' : 'P2') : null;
  const theirPlayerTag = room.first_batter ? (isTossWinner ? 'P2' : 'P1') : null;

  const myScoreLabel = (myPlayerTag ? `${myPlayerTag} | ` : '') + (isBatting ? '🏏 Your Score (Batting)' : '🎳 Your Score (Bowling)')
  const theirScoreLabel = (theirPlayerTag ? `${theirPlayerTag} | ` : '') + (isBatting ? '🎳 Opponent (Bowling)' : '🏏 Opponent (Batting)')

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl space-y-4">
        {!room.player2_id && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border-2 border-primary bg-primary/10 p-4 text-center"
          >
            <p className="text-sm text-muted-foreground mb-2">Room Code</p>
            <p className="font-mono text-4xl font-bold mb-2">{room.room_code}</p>
            <p className="text-sm text-muted-foreground">Waiting for opponent...</p>
          </motion.div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between mb-4">
              <div>
                <CardTitle>Innings {room.current_innings}</CardTitle>
                <p className="text-sm text-muted-foreground">Ball {gameState.current_ball_number}/10</p>
              </div>
              <div className="flex items-center gap-2">
                {myPlayerTag && (
                  <Badge variant="outline" className={`text-lg font-black px-3 py-1 ${myPlayerTag === 'P1' ? 'border-primary text-primary' : 'border-orange-500 text-orange-500'}`}>
                    {myPlayerTag}
                  </Badge>
                )}
                <Button variant="destructive" size="sm" onClick={endGame}>End Game</Button>
              </div>
            </div>


            {room.player2_id && gameStarted && (
              <div className={`text-center p-4 rounded-lg font-bold text-3xl transition-colors ${
                remainingTime <= 3 ? 'bg-red-500/20 text-red-600' : 'bg-blue-500/20 text-blue-600'
              }`}>
                ⏱️ {remainingTime}s
              </div>
            )}
            {room.player2_id && gameStarted && (
              <div className="mt-3 p-2 text-center text-sm">
                {selectedNumber ? (
                  <p className="text-green-600 font-semibold">✓ You chose: {selectedNumber}</p>
                ) : (
                  <p className="text-orange-600 font-semibold">⏳ Pick a number (1-6)</p>
                )}
                {selectedNumber && !opponentReady && (
                  <p className="text-muted-foreground mt-1">Waiting for opponent...</p>
                )}
                {opponentReady && (
                  <p className="text-green-600 font-semibold mt-1">✓ Opponent ready!</p>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {!room.player2_id ? (
              <div className="flex flex-col items-center justify-center py-8 gap-4">
                <p className="text-muted-foreground">Waiting for opponent to join...</p>
                <Button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="gap-2"
                >
                  {isRefreshing ? (
                    <>
                      <Spinner className="size-4" />
                      Refreshing...
                    </>
                  ) : (
                    <>🔄 Refresh</>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">Auto-refreshing every second...</p>
              </div>
            ) : startCountdown !== null ? (
              <div className="flex items-center justify-center py-16">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  key={startCountdown}
                  className="text-center"
                >
                  <div className="text-9xl font-black text-primary drop-shadow-lg">
                    {startCountdown}
                  </div>
                  <p className="text-lg text-muted-foreground mt-4">Game Starting...</p>
                </motion.div>
              </div>
            ) : isTossActive && !room?.first_batter ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-8 animate-in fade-in zoom-in duration-300">
                <div className="text-center">
                  <h2 className="text-3xl font-black text-primary uppercase tracking-wider mb-2">Toss Time!</h2>
                  <p className="text-muted-foreground text-lg font-medium">Tap <span className="text-emerald-500 font-bold">HEADS</span> first to Bat first!</p>
                </div>
                <div className={`flex flex-col gap-6 w-full max-w-[200px] ${headsPos === 'top' ? '' : 'flex-col-reverse'}`}>
                  <Button 
                    size="lg" 
                    className="h-28 text-3xl font-black bg-emerald-500 hover:bg-emerald-600 shadow-xl transition-all hover:scale-105 active:scale-95 border-b-4 border-emerald-700" 
                    onClick={() => handleTossClick('heads')}
                  >
                    HEADS
                  </Button>
                  <Button 
                    size="lg" 
                    className="h-28 text-3xl font-black bg-rose-500 hover:bg-rose-600 shadow-xl transition-all hover:scale-105 active:scale-95 border-b-4 border-rose-700" 
                    onClick={() => handleTossClick('tails')}
                  >
                    TAILS
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <motion.div
                    key={`score-${myScore}-${room.current_innings}-${isBatting}`}
                    initial={{ scale: 0.9, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`p-3 rounded-lg border-2 ${
                      isBatting
                        ? 'bg-green-500/10 border-green-500/30'
                        : 'bg-blue-500/10 border-blue-500/20'
                    }`}
                  >
                    <p className="text-xs text-muted-foreground font-semibold leading-tight">{myScoreLabel}</p>
                    <p className={`text-4xl font-black ${isBatting ? 'text-green-600' : 'text-blue-600'}`}>{myScore}</p>
                  </motion.div>
                  <div className="p-3 rounded-lg bg-muted border-2 border-muted-foreground/20 flex flex-col items-center justify-center">
                    <p className="text-sm text-muted-foreground font-semibold">Ball</p>
                    <p className="text-3xl font-bold">{gameState.current_ball_number}<span className="text-base font-normal text-muted-foreground">/10</span></p>
                    <p className="text-xs text-muted-foreground">{10 - gameState.current_ball_number} left</p>
                  </div>
                  <motion.div
                    key={`opponent-${theirScore}-${room.current_innings}-${isBatting}`}
                    initial={{ scale: 0.9, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`p-3 rounded-lg border-2 ${
                      isBatting
                        ? 'bg-blue-500/10 border-blue-500/20'
                        : 'bg-green-500/10 border-green-500/30'
                    }`}
                  >
                    <p className="text-xs text-muted-foreground font-semibold leading-tight">{theirScoreLabel}</p>
                    <p className={`text-4xl font-black ${isBatting ? 'text-blue-600' : 'text-green-600'}`}>{theirScore}</p>
                  </motion.div>
                </div>

                {/* Innings 2 Target Banner */}
                {room.current_innings === 2 && (
                  <div className="text-center p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <p className="text-xs text-muted-foreground">Innings 2 — Target</p>
                    {/* Target = innings-1 batter's score + 1 (batter in inn1 = first_batter) */}
                    {(() => {
                      const inn1BatterScore = room.first_batter === room.player1_id ? score.player1_score : score.player2_score
                      const inn2BatterScore = room.first_batter === room.player1_id ? score.player2_score : score.player1_score
                      const target = inn1BatterScore + 1
                      return (
                        <>
                          <p className="text-xl font-bold text-yellow-600">{target}</p>
                          <p className="text-xs text-muted-foreground">
                            P2 (toss loser) needs {Math.max(0, target - inn2BatterScore)} more runs
                          </p>
                        </>
                      )
                    })()}
                  </div>
                )}

                {/* Ball Result Feed */}
                {ballMessages.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 rounded-lg bg-muted/50 border border-muted-foreground/20 overflow-hidden"
                  >
                    <p className="text-xs font-bold text-muted-foreground px-3 pt-2 pb-1 uppercase tracking-wider">📋 Ball-by-Ball</p>
                    <div className="max-h-40 overflow-y-auto space-y-1 px-2 pb-2">
                      {ballMessages.map((msg, idx) => {
                        const isOut = msg.result.includes('OUT')
                        const isDot = msg.result.includes('DOT')
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`text-xs p-2 rounded border ${
                              isOut
                                ? 'bg-red-500/10 border-red-500/20'
                                : isDot
                                ? 'bg-muted border-muted-foreground/10'
                                : 'bg-green-500/10 border-green-500/20'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-muted-foreground">Inn{msg.innings} B{msg.ball}</span>
                              <span className={`font-bold ${
                                isOut ? 'text-red-600' : isDot ? 'text-muted-foreground' : 'text-green-600'
                              }`}>
                                {msg.result}
                              </span>
                            </div>
                            {(msg.p1_choice || msg.p2_choice) && (
                              <div className="flex gap-3 mt-1 text-muted-foreground">
                                <span>P1 chose: <strong>{msg.p1_choice ?? '?'}</strong></span>
                                <span>P2 chose: <strong>{msg.p2_choice ?? '?'}</strong></span>
                              </div>
                            )}
                            <div className="flex justify-between mt-1 text-muted-foreground">
                              <span>P1 total: <strong>{msg.p1_score}</strong></span>
                              <span>P2 total: <strong>{msg.p2_score}</strong></span>
                            </div>
                          </motion.div>
                        )
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  </motion.div>
                )}

                {gameState.ball_result && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="rounded-lg border-2 bg-muted p-6 text-center"
                  >
                    <p className="text-2xl font-bold">{gameState.ball_result}</p>
                  </motion.div>
                )}

                {!gameState.ball_result && (
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <Button
                        key={num}
                        size="lg"
                        variant={selectedNumber === num ? 'default' : 'outline'}
                        className="h-20 text-3xl font-bold"
                        onClick={() => submitChoice(num)}
                        disabled={selectedNumber !== null || isProcessing}
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* RESULT MODAL */}
        <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
          <DialogContent className="max-w-md" aria-describedby={undefined}>
            <DialogTitle className="text-center text-2xl font-bold">
              🏆 Match Complete!
            </DialogTitle>
            {matchResult && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-6"
              >
                <div className="text-center">
                  <p className="text-muted-foreground mb-2">Winner</p>
                  {/* winner is 'player1'/'player2' by room order; map to toss-based P1/P2 tags */}
                  {(() => {
                    const isTossWinnerRoomP1 = room.first_batter === room.player1_id
                    const winnerIsTossWinner =
                      (matchResult.winner === 'player1' && isTossWinnerRoomP1) ||
                      (matchResult.winner === 'player2' && !isTossWinnerRoomP1)
                    return (
                      <p className="text-3xl font-bold text-green-600">
                        {winnerIsTossWinner ? 'P1 (Toss Winner)' : 'P2 (Toss Loser)'}
                      </p>
                    )
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Show scores under toss-based P1/P2 labels */}
                  {(() => {
                    const isTossWinnerRoomP1 = room.first_batter === room.player1_id
                    const p1TagScore = isTossWinnerRoomP1 ? matchResult.player1Score : matchResult.player2Score
                    const p2TagScore = isTossWinnerRoomP1 ? matchResult.player2Score : matchResult.player1Score
                    return (
                      <>
                        <div className="text-center p-4 rounded-lg bg-muted">
                          <p className="text-sm text-muted-foreground mb-1">P1 (Toss Winner)</p>
                          <p className="text-2xl font-bold">{p1TagScore}</p>
                        </div>
                        <div className="text-center p-4 rounded-lg bg-muted">
                          <p className="text-sm text-muted-foreground mb-1">P2 (Toss Loser)</p>
                          <p className="text-2xl font-bold">{p2TagScore}</p>
                        </div>
                      </>
                    )
                  })()}
                </div>

                <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-muted-foreground">Target (P1 Toss-Winner Score + 1)</p>
                  <p className="text-xl font-bold text-blue-600">{matchResult.targetScore}</p>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  {(() => {
                    const isTossWinnerRoomP1 = room.first_batter === room.player1_id
                    const winnerIsTossWinner =
                      (matchResult.winner === 'player1' && isTossWinnerRoomP1) ||
                      (matchResult.winner === 'player2' && !isTossWinnerRoomP1)
                    return winnerIsTossWinner
                      ? `P2 (Toss Loser) couldn't reach target of ${matchResult.targetScore}`
                      : `P2 (Toss Loser) successfully chased ${matchResult.targetScore}`
                  })()}
                </p>

                <Button
                  onClick={() => {
                    toast.success('Game completed!')
                    navigate(`/result/${roomId}`)
                  }}
                  className="w-full"
                >
                  View Full Result
                </Button>
              </motion.div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

