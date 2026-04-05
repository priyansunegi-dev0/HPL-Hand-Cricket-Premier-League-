import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase, type Room, type Score, type GameState } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Trophy, CheckCircle2, RefreshCw, ListChecks } from 'lucide-react'

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

  // Wicket sound effect — preloaded for instant playback
  const wicketAudioRef = useRef<HTMLAudioElement | null>(null)
  
  useEffect(() => {
    const audio = new Audio('/audio/wicket.wav')
    audio.preload = 'auto'
    wicketAudioRef.current = audio
  }, [])

  const unlockAudio = () => {
    const audio = wicketAudioRef.current
    if (audio && audio.paused) {
      audio.volume = 0
      audio.play().then(() => {
        audio.pause()
        audio.volume = 1
        audio.currentTime = 0
      }).catch(() => {})
    }
  }

  const playWicketSound = () => {
    try {
      const audio = wicketAudioRef.current
      if (audio) {
        audio.currentTime = 0
        audio.play().catch(() => {})
      }
    } catch (_) {}
  }

  // Globally trigger audio for BOTH players when game_state resolves to OUT
  useEffect(() => {
    if (gameState?.ball_result === 'OUT') {
      playWicketSound()
    }
  }, [gameState?.current_ball_number, gameState?.ball_result])

  // UI State
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [serverTimeOffset, setServerTimeOffset] = useState(0)
  const [remainingTime, setRemainingTime] = useState(13)
  const [opponentReady, setOpponentReady] = useState(false)
  const isProcessingRef = useRef(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [syncReady, setSyncReady] = useState(false)
  const [startCountdown, setStartCountdown] = useState<number | string | null>('SYNCING...')
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
  const pulsingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
        .on(
          'broadcast',
          { event: 'sync_ping' },
          () => {
            if (!mounted) return
            // If P1 receives a ping from P2, broadcast the official sync_start
            if (playerIdRef.current === (roomRef.current?.player1_id || player1IdRef.current)) {
              roomChannel.send({
                type: 'broadcast',
                event: 'sync_start'
              }).catch(() => {})
              setSyncReady(true)
            }
          }
        )
        .on(
          'broadcast',
          { event: 'sync_start' },
          () => {
            if (!mounted) return
            if (pulsingIntervalRef.current) {
              clearInterval(pulsingIntervalRef.current)
              pulsingIntervalRef.current = null
            }
            setSyncReady(true)
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && mounted) {
            // Aggressive pulsing: P2 pings P1 every 500ms until a sync_start is received
            if (playerIdRef.current !== (roomRef.current?.player1_id || player1IdRef.current)) {
              if (pulsingIntervalRef.current) clearInterval(pulsingIntervalRef.current)
              
              const sendPing = () => {
                if (!mounted || syncReady) return
                roomChannel.send({
                  type: 'broadcast',
                  event: 'sync_ping'
                }).catch(() => {})
              }
              
              sendPing()
              pulsingIntervalRef.current = setInterval(sendPing, 500)
            }
          }
        })
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

                // Play wicket sound for P2 (non-processor) when OUT is received via subscription
                if (newGameState.ball_result.includes('OUT') && playerIdRef.current !== player1IdRef.current) {
                  playWicketSound()
                }

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
        // Auto-snap sync if database shows game is already past the entry point
        if (updatedRoom.player2_id && (updatedRoom.first_batter || updatedRoom.status !== 'waiting') && !syncReady) {
          setSyncReady(true)
        }
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

  // Fallback sync timer in case socket ping fails (Aggressive 2s fallback)
  useEffect(() => {
    if (room?.player2_id && room?.status === 'playing' && !syncReady && !gameStarted) {
      const fallback = setTimeout(() => {
        setSyncReady(true)
      }, 2000)
      return () => clearTimeout(fallback)
    }
  }, [room?.player2_id, room?.status, syncReady, gameStarted])

  // Game start countdown animation (5,4,3,2,1)
  useEffect(() => {
    if (!room?.player2_id || room?.status !== 'playing' || gameStarted || !syncReady) return

    let countdown = 5
    let interval: ReturnType<typeof setInterval>

    const start = () => {
      setStartCountdown(countdown)
      interval = setInterval(() => {
        countdown -= 1
        if (countdown < 0) {
          clearInterval(interval)
          // Hold for 1 second to allow lagging players to catch up (Fair Play)
          setStartCountdown('READY?')
          setTimeout(() => {
            setStartCountdown(null)
            if (!roomRef.current?.first_batter) {
              setIsTossActive(true)
            } else {
              setGameStarted(true)
            }
          }, 1000)
        } else {
          setStartCountdown(countdown)
        }
      }, 1000)
    }

    start()

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [room?.player2_id, room?.status, gameStarted, syncReady])

  // SYNCHRONIZED TIMER
  useEffect(() => {
    if (!gameState?.ball_start_time || room?.status !== 'playing' || !gameStarted || gameState.current_ball_number === 0) {
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
      }, 300) // Snapshot swap every 300ms
      return () => clearInterval(interval)
    }
  }, [isTossActive])

  const handleTossClick = async (choice: 'heads' | 'tails') => {
    if (!roomId || !playerId || !isTossActive || room?.first_batter) return
    unlockAudio()
    
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
        // Broadcast the win to the opponent instantly over WebSockets!
        await supabase.realtime.channel(`room:${roomId}`).send({
          type: 'broadcast',
          event: 'toss_won',
          payload: { winner: playerId }
        })
        
        // Wait 300ms before resolving for P1 locally, so P2's broadcast arrives at exactly the same time (Perfect Sync)
        setTimeout(() => {
          setIsTossActive(false)
          setGameStarted(true)
          setRoom(prev => prev ? { ...prev, first_batter: playerId } : null)
        }, 300)
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

    unlockAudio()

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
      const ballResultText = isOut ? 'OUT' : (runs === 0 ? 'DOT BALL' : `${runs} RUNS`)
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

      // Hold the result on screen for 400ms for BOTH players before generating new ball
      await new Promise(resolve => setTimeout(resolve, 400))

      // ── INNINGS 2 EARLY WIN CHECK (runs after every ball) ──
      // Target = innings-1 batter's score + 1. If chaser already hit it, end NOW.
      // Use Math.max to handle stale roomRef — currentInningsRef tracks UI state which updates faster
      const actualInnings = Math.max(currentInnings, currentInningsRef.current)
      const isInnings2 = actualInnings === 2
      const isPlayer1FirstBatterLocal = currentRoom.first_batter === currentRoom.player1_id
      const inn1ScoreLocal = isPlayer1FirstBatterLocal ? updatedScore.player1_score : updatedScore.player2_score
      const inn2ScoreLocal = isPlayer1FirstBatterLocal ? updatedScore.player2_score : updatedScore.player1_score
      const targetLocal = inn1ScoreLocal + 1
      const chaserWonEarly = isInnings2 && inn2ScoreLocal >= targetLocal

      if (chaserWonEarly) {
        // Chaser has met/exceeded the target — END MATCH IMMEDIATELY
        const player1Score = updatedScore.player1_score
        const player2Score = updatedScore.player2_score

        const inn2Player = isPlayer1FirstBatterLocal ? 'player2' : 'player1'
        const winner = inn2Player  // chaser always wins if they reached target

        setMatchResult({ winner, targetScore: targetLocal, player1Score, player2Score })
        setShowResultModal(true)

        await supabase.realtime.channel(`room:${roomId}`).send({
          type: 'broadcast',
          event: 'match_complete',
          payload: { winner, targetScore: targetLocal, player1Score, player2Score }
        })

        await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
      } else if (isLastBall) {
        if (actualInnings === 1) {
          // Last ball of innings 1 → start innings 2
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
        } else {
          // Last ball of innings 2 — chaser did NOT reach target → innings-1 batter wins
          const player1Score = updatedScore.player1_score
          const player2Score = updatedScore.player2_score

          const inn1Player = isPlayer1FirstBatterLocal ? 'player1' : 'player2'
          const winner = inn1Player

          setMatchResult({ winner, targetScore: targetLocal, player1Score, player2Score })
          setShowResultModal(true)

          await supabase.realtime.channel(`room:${roomId}`).send({
            type: 'broadcast',
            event: 'match_complete',
            payload: { winner, targetScore: targetLocal, player1Score, player2Score }
          })

          await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
        }
      } else {
        // Neither early win nor last ball — proceed to next ball
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
      if (isLastBall && actualInnings === 1) {
        setRoom(prev => prev ? { ...prev, current_innings: 2 } : null)
        setGameState(prev => prev ? {
          ...prev,
          current_ball_number: 1,
          ball_result: null,
          player1_choice: null,
          player2_choice: null
        } : null)
      } else if (!isLastBall && !chaserWonEarly) {
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


      const dotBallText = 'DOT BALL'

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

      // Hold the dot ball result on screen for 400ms for BOTH players
      await new Promise(resolve => setTimeout(resolve, 400))

      // ── INNINGS 2 EARLY WIN CHECK (dot balls can't win, but keep structure consistent) ──
      const actualInnings = Math.max(currentInnings, currentInningsRef.current)
      const isInnings2 = actualInnings === 2
      const isPlayer1FirstBatterLocal = currentRoom.first_batter === currentRoom.player1_id
      const currentScoreNow = scoreRef.current
      const p1ScoreNow = currentScoreNow?.player1_score ?? 0
      const p2ScoreNow = currentScoreNow?.player2_score ?? 0
      const inn1ScoreLocal = isPlayer1FirstBatterLocal ? p1ScoreNow : p2ScoreNow
      const inn2ScoreLocal = isPlayer1FirstBatterLocal ? p2ScoreNow : p1ScoreNow
      const targetLocal = inn1ScoreLocal + 1
      const chaserWonEarly = isInnings2 && inn2ScoreLocal >= targetLocal

      if (chaserWonEarly) {
        // Chaser reached target — end match
        const { data: scoreData } = await supabase.from('scores').select('*').eq('room_id', roomId).single()
        const player1Score = scoreData?.player1_score || 0
        const player2Score = scoreData?.player2_score || 0

        const inn2Player = isPlayer1FirstBatterLocal ? 'player2' : 'player1'
        const winner = inn2Player

        setMatchResult({ winner, targetScore: targetLocal, player1Score, player2Score })
        setShowResultModal(true)

        await supabase.realtime.channel(`room:${roomId}`).send({
          type: 'broadcast',
          event: 'match_complete',
          payload: { winner, targetScore: targetLocal, player1Score, player2Score }
        })

        await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
      } else if (isLastBall) {
        if (actualInnings === 1) {
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
        } else {
          // Last ball innings 2 — chaser didn't reach target → innings-1 batter wins
          const { data: scoreData } = await supabase.from('scores').select('*').eq('room_id', roomId).single()
          const player1Score = scoreData?.player1_score || 0
          const player2Score = scoreData?.player2_score || 0

          const inn1Player = isPlayer1FirstBatterLocal ? 'player1' : 'player2'
          const winner = inn1Player

          setMatchResult({ winner, targetScore: targetLocal, player1Score, player2Score })
          setShowResultModal(true)

          await supabase.realtime.channel(`room:${roomId}`).send({
            type: 'broadcast',
            event: 'match_complete',
            payload: { winner, targetScore: targetLocal, player1Score, player2Score }
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

      if (isLastBall && actualInnings === 1) {
        setRoom(prev => prev ? { ...prev, current_innings: 2 } : null)
        setGameState(prev => prev ? {
          ...prev,
          current_ball_number: 1,
          ball_result: null,
          player1_choice: null,
          player2_choice: null
        } : null)
      } else if (!isLastBall && !chaserWonEarly) {
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

  return (
    <div className="flex h-svh flex-col items-center justify-start sm:justify-center bg-background p-2 sm:p-4 lg:p-3 py-2 sm:py-4 lg:py-2 relative overflow-y-auto overflow-x-hidden font-sans text-white">
      {/* Background decoration */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-2xl space-y-1.5 sm:space-y-3 lg:space-y-2 z-10 my-auto">
        {!room.player2_id && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[2rem] border-2 border-primary/30 bg-card/40 backdrop-blur-xl p-6 sm:p-8 text-center shadow-[0_0_40px_rgba(204,255,0,0.15)] overflow-hidden relative"
          >
            <div className="absolute top-4 left-4 w-2 h-2 border-t-2 border-l-2 border-primary opacity-30" />
            <div className="absolute top-4 right-4 w-2 h-2 border-t-2 border-r-2 border-primary opacity-30" />
            <p className="text-[10px] sm:text-xs font-black text-primary/60 uppercase tracking-[0.4em] mb-4">AWAITING CHALLENGER</p>
            <p className="font-mono text-4xl sm:text-5xl font-black mb-4 tracking-[0.2em] text-white drop-shadow-[0_0_10px_rgba(204,255,0,0.4)]">{room.room_code}</p>
            <div className="flex items-center justify-center gap-2">
              <Spinner className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
              <p className="text-[10px] sm:text-sm text-muted-foreground font-bold uppercase tracking-widest">Share this code to start</p>
            </div>
          </motion.div>
        )}

        <Card className="border-primary/20 bg-card/50 backdrop-blur-xl shadow-[0_0_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
          <CardHeader className="border-b border-primary/10 pb-2 sm:pb-3 lg:pb-1.5 p-3 sm:p-4 lg:p-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="bg-primary/10 p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-primary/20 shadow-[0_0_15px_rgba(204,255,0,0.1)]">
                  <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-primary fill-primary/20" />
                </div>
                <div>
                  {gameStarted ? (
                    <>
                      <CardTitle className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white drop-shadow-[0_0_5px_rgba(204,255,0,0.2)]">Innings {room.current_innings}</CardTitle>
                      <p className="text-[8px] sm:text-[10px] font-black text-primary uppercase tracking-[0.2em]">Ball {gameState.current_ball_number}/10</p>
                    </>
                  ) : (
                    <>
                      <CardTitle className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white drop-shadow-[0_0_5px_rgba(204,255,0,0.2)]">ZPL Match</CardTitle>
                      <p className="text-[8px] sm:text-[10px] font-black text-primary uppercase tracking-[0.2em]">Code: {room.room_code}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                {myPlayerTag && (
                  <Badge variant="outline" className={`text-[10px] sm:text-sm font-black px-2 sm:px-4 py-1 rounded-full border-2 tracking-widest uppercase ${myPlayerTag === 'P1' ? 'border-primary text-primary shadow-[0_0_10px_rgba(204,255,0,0.2)]' : 'border-primary/40 text-primary/60 shadow-[0_0_10px_rgba(204,255,0,0.1)]'}`}>
                    {myPlayerTag}
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={endGame} className="text-destructive/60 hover:text-destructive hover:bg-destructive/10 font-bold uppercase tracking-widest text-[8px] sm:text-[10px] h-8 px-2">Exit</Button>
              </div>
            </div>


            {room.player2_id && gameStarted && (
              <div className={`text-center p-3 sm:p-4 rounded-xl sm:rounded-2xl font-black text-3xl sm:text-4xl tracking-widest transition-all duration-300 shadow-inner overflow-hidden relative group ${
                remainingTime <= 3 ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-primary/5 text-primary border border-primary/10'
              }`}>
                {/* Glow effect */}
                <div className={`absolute inset-0 opacity-20 blur-xl group-hover:opacity-40 transition-opacity ${remainingTime <= 3 ? 'bg-destructive' : 'bg-primary'}`} />
                <span className="relative z-10 drop-shadow-[0_0_10px_currentColor]">
                  {remainingTime < 10 ? `0${remainingTime}` : remainingTime}s
                </span>
                <div className="absolute bottom-0 left-0 h-1 bg-current transition-all duration-100 ease-linear shadow-[0_0_10px_currentColor]" style={{ width: `${(remainingTime / 13) * 100}%` }} />
              </div>
            )}
            
            {room.player2_id && gameStarted && (
              <div className="mt-2 sm:mt-3 p-1.5 sm:p-2 text-center rounded-lg sm:rounded-xl bg-white/[0.02] border border-white/5">
                {selectedNumber ? (
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                    <p className="text-primary font-black uppercase tracking-widest text-[10px] sm:text-xs">Locked: {selectedNumber}</p>
                  </motion.div>
                ) : (
                  <p className="text-primary/60 font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs animate-pulse">Pick a move (1-6)</p>
                )}
                <div className="flex items-center justify-center gap-3 sm:gap-4 mt-1 sm:mt-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${selectedNumber ? 'bg-primary' : 'bg-gray-700'} transition-colors`} />
                    <span className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest">You</span>
                  </div>
                  <div className="w-2 sm:w-4 border-t border-white/5" />
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${opponentReady ? 'bg-primary' : 'bg-gray-700'} transition-colors`} />
                    <span className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest">Opponent</span>
                  </div>
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-3 sm:space-y-4 lg:space-y-2.5 pt-4 sm:pt-4 lg:pt-2 p-4 sm:p-4 lg:p-3">
            {!room.player2_id ? (
              <div className="flex flex-col items-center justify-center py-10 sm:py-12 gap-4 sm:gap-6">
                <Spinner className="w-10 h-10 sm:w-12 sm:h-12 text-primary/40" />
                <p className="text-muted-foreground font-black uppercase tracking-widest text-[10px] sm:text-xs">Matching with player...</p>
                <Button
                  variant="outline"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="gap-2 border-primary/20 hover:bg-primary/10 h-10 sm:h-12 px-6 sm:px-8 rounded-full transition-all"
                >
                  {isRefreshing ? <Spinner className="w-3 h-3 sm:w-4 sm:h-4" /> : <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />}
                  <span className="font-black uppercase tracking-widest text-[10px] sm:text-xs">Refresh</span>
                </Button>
              </div>
            ) : startCountdown !== null ? (
              <div className="flex items-center justify-center py-16 sm:py-20">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 2, opacity: 0 }}
                  key={startCountdown}
                  className="text-center relative"
                >
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 -m-12 sm:-m-20 border border-dashed border-primary/20 rounded-full"
                  />
                  <div className={`font-black text-primary leading-none italic drop-shadow-[0_0_50px_rgba(204,255,0,0.5)] ${typeof startCountdown === 'string' ? 'text-4xl sm:text-6xl tracking-widest' : 'text-[6rem] sm:text-[10rem]'}`}>
                    {startCountdown}
                  </div>
                  <p className="text-base sm:text-xl font-black text-white uppercase tracking-[0.4em] mt-6 sm:mt-8 italic">Prepare to Play</p>
                </motion.div>
              </div>
            ) : isTossActive && !room?.first_batter ? (
              <div className="flex flex-col items-center justify-center py-8 sm:py-10 space-y-8 sm:space-y-10 animate-in fade-in zoom-in duration-200">
                <div className="text-center">
                  <div className="inline-block px-3 py-1 sm:px-4 sm:py-1.5 bg-primary/20 border border-primary/30 rounded-full mb-3 sm:mb-4">
                    <p className="text-[8px] sm:text-[10px] font-black text-primary uppercase tracking-[0.3em]">DECIDE ROLES</p>
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-black text-white italic uppercase tracking-tight mb-2 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">THE TOSS</h2>
                  <p className="text-gray-400 font-bold tracking-widest uppercase text-[10px] sm:text-xs">Tap <span className="text-primary font-black">HEADS</span> first to claim Batting!</p>
                </div>
                <div className={`flex flex-col gap-6 sm:gap-8 w-full max-w-[180px] sm:max-w-[220px] ${headsPos === 'top' ? '' : 'flex-col-reverse'} transition-all duration-150`}>
                  <Button 
                    size="lg" 
                    className="h-24 sm:h-32 text-3xl sm:text-4xl font-black bg-primary hover:bg-[#b8e600] text-black shadow-[0_15px_40px_-5px_rgba(204,255,0,0.3)] transition-all hover:scale-105 active:scale-95 border-b-4 sm:border-b-8 border-black/20 rounded-[1.5rem] sm:rounded-[2rem] italic tracking-tighter" 
                    onClick={() => handleTossClick('heads')}
                  >
                    HEADS
                  </Button>
                  <Button 
                    size="lg" 
                    className="h-24 sm:h-32 text-3xl sm:text-4xl font-black bg-white/5 hover:bg-white/10 text-white shadow-xl transition-all hover:scale-105 active:scale-95 border-b-4 sm:border-b-8 border-black/40 rounded-[1.5rem] sm:rounded-[2rem] italic tracking-tighter filter grayscale opacity-40 cursor-not-allowed group" 
                    onClick={() => handleTossClick('tails')}
                  >
                    TAILS
                    <span className="absolute -right-4 -top-8 bg-black text-white text-[8px] p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">Only Heads wins!</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:gap-6 lg:gap-3 xl:gap-2.5">
                <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-3 text-center items-stretch order-1">
                  <div
                    key={`score-${myScore}-${room.current_innings}-${isBatting}`}
                    className={`p-2 sm:p-4 rounded-2xl sm:rounded-3xl border-2 shadow-xl relative overflow-hidden flex flex-col justify-center ${
                      isBatting
                        ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(204,255,0,0.1)] mb-2 sm:mb-4 lg:mb-1 lg:mt-[-4px]'
                        : 'bg-primary/5 border-primary/20 shadow-[0_0_20px_rgba(204,255,0,0.05)]'
                    }`}
                  >
                    {isBatting && <div className="absolute top-0 right-0 w-6 h-6 sm:w-8 sm:h-8 bg-primary rounded-bl-lg flex items-center justify-center opacity-80"><span className="text-[8px] sm:text-[10px] text-black font-black">★</span></div>}
                    <p className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest mb-1 ${isBatting ? 'text-primary' : 'text-primary/40'}`}>{myPlayerTag} {isBatting ? 'Batting' : 'Bowling'}</p>
                    <p className={`text-2xl sm:text-4xl font-black tabular-nums ${isBatting ? 'text-white' : 'text-gray-400'}`}>{myScore}</p>
                  </div>

                  <div className="p-2 sm:p-4 rounded-2xl sm:rounded-3xl bg-white/[0.03] border-2 border-white/5 flex flex-col items-center justify-center relative group">
                    <p className="text-[8px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Ball</p>
                    <div className="flex items-center gap-0.5 sm:gap-1">
                      <p className="text-xl sm:text-3xl font-black italic">{gameState.current_ball_number}</p>
                      <span className="text-gray-600 font-bold mt-1 sm:mt-2 text-xs sm:text-sm">/10</span>
                    </div>
                    <div className="w-4 sm:w-8 h-0.5 bg-primary/20 mt-1 sm:mt-2 rounded-full" />
                  </div>

                  <div
                    key={`opponent-${theirScore}-${room.current_innings}-${isBatting}`}
                    className={`p-2 sm:p-4 rounded-2xl sm:rounded-3xl border-2 shadow-xl relative overflow-hidden flex flex-col justify-center ${
                      !isBatting
                        ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(204,255,0,0.1)] mb-2 sm:mb-4 lg:mb-1 lg:mt-[-4px]'
                        : 'bg-primary/10 border-primary/20 shadow-[0_0_20px_rgba(204,255,0,0.05)]'
                    }`}
                  >
                    {!isBatting && <div className="absolute top-0 right-0 w-6 h-6 sm:w-8 sm:h-8 bg-primary rounded-bl-lg flex items-center justify-center opacity-80"><span className="text-[8px] sm:text-[10px] text-black font-black">★</span></div>}
                    <p className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest mb-1 ${!isBatting ? 'text-primary' : 'text-primary/40'}`}>{theirPlayerTag} {!isBatting ? 'Batting' : 'Bowling'}</p>
                    <p className={`text-2xl sm:text-4xl font-black tabular-nums ${!isBatting ? 'text-white' : 'text-gray-400'}`}>{theirScore}</p>
                  </div>
                </div>

                {/* Innings 2 Target Banner */}
                {room.current_innings === 2 && (
                  <motion.div 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-center p-3 sm:p-4 lg:p-2.5 rounded-2xl sm:rounded-3xl bg-primary/10 border-2 border-primary/40 shadow-[0_10px_30px_-5px_rgba(204,255,0,0.1)] order-2"
                  >
                    {(() => {
                      const inn1BatterScore = room.first_batter === room.player1_id ? score.player1_score : score.player2_score
                      const inn2BatterScore = room.first_batter === room.player1_id ? score.player2_score : score.player1_score
                      const target = inn1BatterScore + 1
                      const needed = Math.max(0, target - inn2BatterScore)
                      return (
                        <>
                          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-1">
                            <span className="text-[8px] sm:text-[10px] font-black text-primary/60 uppercase tracking-[0.3em]">CHASE TARGET</span>
                            <div className="h-0.5 w-8 sm:w-12 bg-primary/30 rounded-full" />
                            <span className="text-xl sm:text-2xl font-black italic">{target}</span>
                          </div>
                          <p className="text-[10px] sm:text-sm font-bold text-white uppercase tracking-wider">
                            Needed: <span className="text-primary font-black drop-shadow-[0_0_8px_#ccff00] text-sm sm:text-lg px-2">{needed}</span> more in {11 - gameState.current_ball_number} balls
                          </p>
                        </>
                      )
                    })()}
                  </motion.div>
                )}

                {/* Selection Area (Above Feed on mobile) — FIXED HEIGHT + RELATIVE for perfect transition without shift */}
                <div className="border-t border-primary/10 pt-3 sm:pt-4 lg:pt-2 order-3 h-[180px] sm:h-[220px] lg:h-[200px] flex items-center justify-center overflow-hidden relative w-full">
                  <div className="absolute inset-0 flex items-center justify-center w-full">
                    <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-4 lg:gap-3 max-w-sm sm:max-w-md mx-auto place-items-center w-full">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        onClick={() => submitChoice(num)}
                        disabled={selectedNumber !== null || isProcessing}
                        className={`relative flex items-center justify-center bg-transparent focus:outline-none ${
                          (selectedNumber !== null && selectedNumber !== num) || isProcessing 
                            ? 'opacity-40 cursor-not-allowed' 
                            : 'cursor-pointer'
                        }`}
                      >
                        <div className={`absolute inset-0 rounded-full blur-xl ${
                          selectedNumber === num 
                            ? 'bg-primary/30 scale-125' 
                            : 'bg-primary/0'
                        }`} />
                        
                        <img 
                          src={`/RUNS/${num}.webp`} 
                          alt={`Run ${num}`}
                          className={`w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain ${
                            selectedNumber === num 
                              ? 'opacity-100' 
                              : 'opacity-70'
                          }`}
                          draggable={false}
                        />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* History Feed (Updated to show only LATEST ball) */}
                <div className="order-4 mt-2 sm:mt-3 lg:mt-1 lg:mb-[-4px]">
                  <div className="rounded-[1rem] bg-white/[0.03] border border-white/10 p-2 sm:p-3 lg:p-2 overflow-hidden shadow-inner min-h-[110px] sm:min-h-[130px] flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ListChecks className="w-3 h-3 text-primary" />
                        <p className="text-[8px] sm:text-[10px] font-black text-primary uppercase tracking-[0.3em]">Live Feed</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[7px] sm:text-[9px] font-bold text-primary/60 uppercase">Live Event</span>
                      </div>
                    </div>
                    
                    {ballMessages.length > 0 ? (
                      (() => {
                        const msg = ballMessages[ballMessages.length - 1]
                        const isOut = msg.result.includes('OUT')
                        const isDot = msg.result.includes('DOT')
                        return (
                          <div
                            key={ballMessages.length}
                            className={`flex-1 p-2 sm:p-3 rounded-lg sm:rounded-xl border flex flex-col justify-center ${
                              isOut
                                ? 'bg-destructive/10 border-destructive/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                                : isDot
                                ? 'bg-white/5 border-white/10'
                                : 'bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(204,255,0,0.1)]'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[7px] sm:text-[9px] font-black bg-black/40 px-1.5 py-0.5 rounded-full text-white/50 uppercase italic">Innings {msg.innings}</span>
                                <span className="text-[7px] sm:text-[9px] font-black bg-black/40 px-1.5 py-0.5 rounded-full text-white/50 uppercase italic">Ball {msg.ball}</span>
                              </div>
                              <span className={`text-base sm:text-xl font-black italic tracking-tighter uppercase ${
                                isOut ? 'text-destructive drop-shadow-[0_0_10px_rgba(239,68,68,0.3)]' : isDot ? 'text-white/30' : 'text-primary drop-shadow-[0_0_10px_rgba(204,255,0,0.3)]'
                              }`}>
                                {msg.result}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-auto">
                              <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-white/5">
                                <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest">You</span>
                                <span className="text-[10px] sm:text-xs font-black text-white">{myPlayerTag === 'P1' ? (msg.p1_choice ?? '-') : (msg.p2_choice ?? '-')}</span>
                              </div>
                              <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-white/5">
                                <span className="text-[7px] sm:text-[8px] font-bold text-gray-500 uppercase tracking-widest">Opponent</span>
                                <span className="text-[10px] sm:text-xs font-black text-white">{myPlayerTag === 'P1' ? (msg.p2_choice ?? '-') : (msg.p1_choice ?? '-')}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })()
                    ) : (
                      <div className="flex-1 flex items-center justify-center p-2 sm:p-3 rounded-lg sm:rounded-xl border bg-primary/5 border-primary/20">
                        <p className="text-[10px] sm:text-xs font-black uppercase text-primary/40 tracking-widest animate-pulse">Waiting for delivery...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* RESULT MODAL */}
        <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
          <DialogContent className="max-w-[90vw] sm:max-w-md bg-zinc-950/95 border-primary/30 backdrop-blur-2xl rounded-3xl p-0 overflow-hidden shadow-[0_0_80px_-20px_rgba(204,255,0,0.3)] [&>button]:top-6 [&>button]:right-6" aria-describedby={undefined}>
            <div className="p-6 sm:p-8 pb-3 sm:pb-4">
              <DialogTitle className="text-center text-3xl sm:text-4xl font-black italic uppercase tracking-tight text-white mb-2 underline decoration-primary decoration-4 underline-offset-8">
                Match Result
              </DialogTitle>
            </div>
            
            {matchResult && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="p-6 sm:p-8 pt-2 sm:pt-4 space-y-6 sm:space-y-8"
              >
                <div className="relative py-8 sm:py-10 px-4 sm:px-6 rounded-3xl bg-primary/10 border-2 border-primary/30 text-center overflow-hidden">
                  <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[140%] bg-primary/5 blur-[80px] rounded-full" />
                  <p className="text-[8px] sm:text-[10px] font-black text-primary/60 uppercase tracking-[0.5em] mb-3 sm:mb-4 relative z-10">THE CHAMPION</p>
                  {(() => {
                    const isTossWinnerRoomP1 = room.first_batter === room.player1_id
                    const winnerIsTossWinner =
                      (matchResult.winner === 'player1' && isTossWinnerRoomP1) ||
                      (matchResult.winner === 'player2' && !isTossWinnerRoomP1)
                    return (
                      <div className="relative z-10">
                        <p className="text-4xl sm:text-5xl font-black text-white italic uppercase tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.2)] mb-2">
                          {winnerIsTossWinner ? 'P1' : 'P2'} WINS!
                        </p>
                        <p className="text-primary/80 font-black uppercase tracking-[0.2em] text-[8px] sm:text-[10px]">
                          {winnerIsTossWinner ? 'TOSS WINNER DOMINATED' : 'TOSS LOSER CHASED IT'}
                        </p>
                      </div>
                    )
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {(() => {
                    const isTossWinnerRoomP1 = room.first_batter === room.player1_id
                    const p1TagScore = isTossWinnerRoomP1 ? matchResult.player1Score : matchResult.player2Score
                    const p2TagScore = isTossWinnerRoomP1 ? matchResult.player2Score : matchResult.player1Score
                    return (
                      <>
                        <div className="text-center p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-2 h-2 bg-primary/40 rounded-bl-lg" />
                          <p className="text-[7px] sm:text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 shadow-[1px_1px_1px_rgba(255,255,0,0.1)]">P1 | WINNER</p>
                          <p className="text-2xl sm:text-4xl font-black tabular-nums text-white group-hover:text-primary transition-colors">{p1TagScore}</p>
                        </div>
                        <div className="text-center p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 relative overflow-hidden group">
                          <div className="absolute top-0 right-0 w-2 h-2 bg-primary/40 rounded-bl-lg" />
                          <p className="text-[7px] sm:text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">P2 | LOSER</p>
                          <p className="text-2xl sm:text-4xl font-black tabular-nums text-white group-hover:text-primary/60 transition-colors">{p2TagScore}</p>
                        </div>
                      </>
                    )
                  })()}
                </div>

                <div className="text-center p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between px-6 sm:px-8">
                  <p className="text-[8px] sm:text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">TARGET WAS</p>
                  <p className="text-2xl sm:text-3xl font-black italic text-primary drop-shadow-[0_0_10px_#ccff00]">{matchResult.targetScore}</p>
                </div>

                <div className="pt-2 sm:pt-4">
                  <Button
                    onClick={() => {
                      toast.success('Check out the full scorecard!')
                      navigate(`/result/${roomId}`)
                    }}
                    className="w-full h-14 sm:h-16 rounded-2xl sm:rounded-3xl bg-primary text-black font-black text-sm sm:text-base uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_20px_-5px_rgba(204,255,0,0.3)] hover:shadow-[0_15px_30px_-5px_rgba(204,255,0,0.4)]"
                  >
                    VIEW FULL SCORECARD
                  </Button>
                </div>
              </motion.div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

