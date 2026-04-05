import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

export function JoinRoomPage() {
  const navigate = useNavigate()
  const [roomCode, setRoomCode] = useState('')
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

  const joinRoom = async () => {
    if (!playerId) {
      toast.error('Please wait while we set you up...')
      return
    }

    if (roomCode.length !== 6) {
      toast.error('Room code must be 6 digits')
      return
    }

    setLoading(true)
    try {
      const { data: room, error: fetchError } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .maybeSingle()

      if (fetchError) throw fetchError
      if (!room) {
        toast.error('Room not found')
        setLoading(false)
        return
      }

      if (room.player2_id) {
        toast.error('Room is already full')
        setLoading(false)
        return
      }

      if (room.status !== 'waiting') {
        toast.error('Room is not available')
        setLoading(false)
        return
      }

      const { error: updateError } = await supabase
        .from('rooms')
        .update({
          player2_id: playerId,
          status: 'playing',
          current_turn: 'player1', // Player 1 (creator/batter) goes first
        })
        .eq('id', room.id)

      if (updateError) {
        console.error('Update room error details:', updateError)
        throw updateError
      }

      // Wait a moment for the update to propagate, then verify by fetching
      await new Promise(resolve => setTimeout(resolve, 500))

      const { data: verifyRoom, error: verifyError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', room.id)
        .single()

      if (verifyError || !verifyRoom) {
        console.error('Failed to verify room update:', verifyError)
      }

      toast.success('Joined room successfully!')
      navigate(`/game/${room.id}`)
    } catch (error) {
      console.error('Error joining room:', error)
      toast.error('Failed to join room')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Join Room</CardTitle>
            <CardDescription>
              Enter the 6-digit room code from your opponent
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Input
                type="text"
                placeholder="Enter room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="text-center font-mono text-2xl tracking-wider"
                disabled={loading}
              />
            </div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                size="lg"
                onClick={joinRoom}
                disabled={loading || roomCode.length !== 6 || !playerId}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Spinner className="mr-2" />
                    Joining...
                  </>
                ) : (
                  'Join Room'
                )}
              </Button>
            </motion.div>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              disabled={loading}
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
