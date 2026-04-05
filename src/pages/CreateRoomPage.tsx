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
      }, 500)
    } catch (error) {
      console.error('Error creating room:', error)
      toast.error('Failed to create room')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Create Room</CardTitle>
            <CardDescription>
              Generate a room code to share with your opponent
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {roomCode ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col gap-4 text-center"
              >
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Your Room Code
                  </p>
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 0.5, repeat: 2 }}
                    className="rounded-lg border-2 border-primary bg-primary/5 p-6"
                  >
                    <p className="font-mono text-4xl font-bold tracking-wider">
                      {roomCode}
                    </p>
                  </motion.div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Redirecting to waiting room...
                </p>
              </motion.div>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={createRoom}
                  disabled={loading || !playerId}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Spinner className="mr-2" />
                      Creating...
                    </>
                  ) : (
                    'Generate Room Code'
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  disabled={loading}
                >
                  Back to Home
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
