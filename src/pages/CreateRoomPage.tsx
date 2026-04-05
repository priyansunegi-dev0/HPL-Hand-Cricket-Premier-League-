import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

export function CreateRoomPage() {
  const navigate = useNavigate()
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [playerId, setPlayerId] = useState<string | null>(null)

  useEffect(() => {
    const initPlayer = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
          toast.error('Failed to sign in')
          return
        }
        setPlayerId(data.user?.id || null)
      } else {
        setPlayerId(user.id)
      }
    }
    initPlayer()
  }, [])

  const generateRoomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  const createRoom = async () => {
    if (!playerId) {
      toast.error('Please wait while we set you up...')
      return
    }

    setLoading(true)
    try {
      const code = generateRoomCode()

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          room_code: code,
          player1_id: playerId,
          status: 'waiting',
          first_batter: null, // Initialized via Toss mini-game
          current_innings: 1,
        })
        .select()
        .single()

      if (roomError) throw roomError

      const { error: scoreError } = await supabase
        .from('scores')
        .insert({
          room_id: room.id,
        })

      if (scoreError) throw scoreError

      // Initialize game_state with server timestamp
      const serverNow = new Date().toISOString()
      const { error: gameStateError } = await supabase
        .from('game_state')
        .insert({
          room_id: room.id,
          current_ball_number: 0,
          ball_start_time: serverNow,
          player1_choice: null,
          player2_choice: null,
          ball_result: null,
          runs_scored: 0,
          both_players_submitted: false,
        })

      if (gameStateError) throw gameStateError

      setRoomCode(code)

      // Navigate directly to game instead of waiting room
      setTimeout(() => {
        navigate(`/game/${room.id}`)
      }, 150)
    } catch (error) {
      console.error('Error creating room:', error)
      toast.error('Failed to create room')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-start sm:justify-center bg-background p-2 sm:p-4 py-8 sm:py-12 relative overflow-y-auto overflow-x-hidden font-sans text-white">
      {/* Background decoration */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md z-10 my-auto"
      >
        <Card className="border-primary/20 bg-card/50 backdrop-blur-xl shadow-[0_0_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
          <CardHeader className="text-center pb-8 border-b border-primary/10">
            <div className="mx-auto mb-4 bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center border border-primary/20 shadow-[0_0_20px_rgba(204,255,0,0.2)] overflow-hidden">
              <img src="/mobile.webp" alt="HPL Logo" className="w-full h-full object-cover" />
            </div>
            <CardTitle className="text-3xl sm:text-5xl font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              Host Match
            </CardTitle>
            <CardDescription className="text-muted-foreground font-medium uppercase tracking-widest text-[10px] mt-2">
              Generate a unique code for your challenger
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 pt-8">
            {roomCode ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col gap-6 text-center"
              >
                <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-4">MATCH CODE CREATED</p>
                  <motion.div
                    animate={{ 
                      scale: [1, 1.02, 1],
                      boxShadow: ["0 0 20px rgba(204,255,0,0.1)", "0 0 40px rgba(204,255,0,0.2)", "0 0 20px rgba(204,255,0,0.1)"]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="rounded-3xl border-2 border-primary bg-primary/5 p-8"
                  >
                    <p className="font-mono text-5xl font-black tracking-[0.2em] text-white tabular-nums drop-shadow-[0_0_15px_rgba(204,255,0,0.5)]">
                      {roomCode}
                    </p>
                  </motion.div>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Spinner className="w-4 h-4 text-primary" />
                  <p className="text-xs text-primary/60 font-black uppercase tracking-widest">
                    Entering Arena...
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-4">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    size="lg"
                    onClick={createRoom}
                    disabled={loading || !playerId}
                    className="w-full h-14 text-base font-black tracking-widest uppercase shadow-[0_10px_20px_-5px_rgba(204,255,0,0.3)] hover:shadow-[0_15px_30px_-5px_rgba(204,255,0,0.4)] transition-all bg-primary text-black"
                  >
                    {loading ? (
                      <>
                        <Spinner className="mr-2" />
                        PREPARING...
                      </>
                    ) : (
                      'GENERATE MATCH CODE'
                    )}
                  </Button>
                </motion.div>
                <Button
                  variant="ghost"
                  onClick={() => navigate('/')}
                  disabled={loading}
                  className="w-full h-12 text-xs font-bold tracking-widest uppercase text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all"
                >
                  ABORT & RETURN
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
