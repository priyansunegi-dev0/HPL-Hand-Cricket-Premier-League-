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
        })
        .eq('id', room.id)

      if (updateError) {
        console.error('Update room error details:', updateError)
        throw updateError
      }

      toast.success('Joined room successfully!')
      navigate(`/waiting/${room.id}`)
    } catch (error) {
      console.error('Error joining room:', error)
      toast.error('Failed to join room')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 relative overflow-hidden font-sans text-white">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md z-10"
      >
        <Card className="border-primary/20 bg-card/50 backdrop-blur-xl shadow-[0_0_50px_-12px_rgba(204,255,0,0.15)] overflow-hidden">
          <CardHeader className="text-center pb-8 border-b border-primary/10">
            <div className="mx-auto mb-4 bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center border border-primary/20 overflow-hidden">
              <img src="/mobile.webp" alt="HPL Logo" className="w-full h-full object-cover" />
            </div>
            <CardTitle className="text-3xl font-black tracking-tight uppercase italic drop-shadow-[0_0_10px_rgba(204,255,0,0.3)]">
              Join Room
            </CardTitle>
            <CardDescription className="text-muted-foreground font-medium">
              Enter the 6-digit room code from your opponent
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 pt-8">
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="0 0 0 0 0 0"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="text-center font-black text-4xl py-8 tracking-[0.5em] bg-primary/5 border-primary/20 focus-visible:ring-primary focus-visible:border-primary shadow-inner text-primary placeholder:text-primary/10 uppercase transition-all duration-300 h-20"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  size="lg"
                  onClick={joinRoom}
                  disabled={loading || roomCode.length !== 6 || !playerId}
                  className="w-full h-14 text-base font-black tracking-widest uppercase shadow-[0_0_20px_rgba(204,255,0,0.25)] hover:shadow-[0_0_30px_rgba(204,255,0,0.4)] transition-all cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Spinner className="mr-2" />
                      JOINING...
                    </>
                  ) : (
                    'ENTER MATCH'
                  )}
                </Button>
              </motion.div>
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                disabled={loading}
                className="w-full h-12 text-sm font-bold tracking-widest uppercase text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all"
              >
                BACK TO LOBBY
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
