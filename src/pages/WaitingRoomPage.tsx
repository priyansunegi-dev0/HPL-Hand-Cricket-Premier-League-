import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase, type Room } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const [room, setRoom] = useState<Room | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomId) return

    let mounted = true
    let channel: any = null

    const setupSubscription = async () => {
      // First, fetch the current room state
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (error) {
        if (mounted) {
          toast.error('Room not found')
          navigate('/')
        }
        return
      }

      if (mounted) {
        setRoom(data)
        setLoading(false)
      }

      // Set up real-time subscription - chain .on() with .subscribe()
      channel = supabase.realtime
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomId}`,
          },
          (payload: any) => {
            if (!mounted) return

            const updatedRoom = payload.new as Room
            
            if (mounted) {
              setRoom(updatedRoom)
            }

            // Check if opponent has joined and game has started
            if (updatedRoom.status === 'playing' && updatedRoom.player2_id) {
              toast.success('Opponent joined! Starting game...')
              setTimeout(() => {
                if (mounted) {
                  navigate(`/game/${roomId}`)
                }
              }, 500)
            }
          }
        )
        .subscribe()
    }

    setupSubscription()

    return () => {
      mounted = false
      if (channel) {
        channel.unsubscribe()
      }
    }
  }, [roomId, navigate])

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
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
            <CardTitle>Waiting for Opponent</CardTitle>
            <CardDescription>
              Share the room code with your opponent
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="rounded-lg border-2 border-primary bg-primary/5 p-6"
            >
              <p className="text-sm text-muted-foreground mb-2">Room Code</p>
              <p className="font-mono text-5xl font-bold tracking-wider">
                {room?.room_code}
              </p>
            </motion.div>

            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Spinner className="size-8 text-primary" />
            </motion.div>

            <p className="text-sm text-muted-foreground text-center">
              Waiting for player 2 to join...
            </p>

            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full"
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

