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
    <div className="flex min-h-svh items-center justify-center bg-background p-4 relative overflow-hidden font-sans text-white">
      {/* Background decoration */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md z-10"
      >
        <Card className="border-primary/20 bg-card/50 backdrop-blur-xl shadow-[0_0_50px_-12px_rgba(204,255,0,0.15)] overflow-hidden">
          <CardHeader className="text-center pb-8 border-b border-primary/10">
            <div className="mx-auto mb-4 bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center border border-primary/20">
              <img src="/mobile.webp" alt="HPL Logo" className="w-8 h-8 object-cover" />
            </div>
            <CardTitle className="text-3xl font-black tracking-tight uppercase italic drop-shadow-[0_0_10px_rgba(204,255,0,0.3)]">
              Waiting Room
            </CardTitle>
            <CardDescription className="text-muted-foreground font-medium">
              Share the room code with your opponent
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-8 pt-8">
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
                boxShadow: [
                  "0 0 20px rgba(204,255,0,0.1)",
                  "0 0 40px rgba(204,255,0,0.3)",
                  "0 0 20px rgba(204,255,0,0.1)",
                ],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="rounded-[2rem] border-2 border-primary bg-primary/5 px-12 py-10 text-center relative"
            >
              <p className="text-xs font-black text-primary uppercase tracking-[0.3em] mb-4 text-center">MATCH CODE</p>
              <p className="font-mono text-6xl font-black tracking-[0.2em] text-white tabular-nums drop-shadow-[0_0_15px_rgba(204,255,0,0.5)]">
                {room?.room_code}
              </p>
            </motion.div>

            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#ccff00]"
                />
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                  Waiting for Challenger
                </p>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Match will start automatically once they join
              </p>
            </div>

            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="w-full h-12 text-xs font-bold tracking-widest uppercase text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all border border-transparent hover:border-destructive/20"
            >
              DISBAND ROOM
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

