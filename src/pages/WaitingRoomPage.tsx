import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase, type Room } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setPlayerId(data.user?.id || null))
  }, [])

  useEffect(() => {
    if (!roomId) return

    let mounted = true
    let channel: any = null

    const fetchRoom = async () => {
      const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single()
      if (error) {
        if (mounted) navigate('/')
        return
      }
      if (mounted) {
        setRoom(data)
        setLoading(false)
        if (data.status === 'playing') {
          navigate(`/game/${roomId}`)
        }
      }
    }

    const setupSubscription = async () => {
      await fetchRoom()

      channel = supabase.realtime
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          (payload: any) => {
            if (!mounted) return
            const updatedRoom = payload.new as Room
            setRoom(updatedRoom)
            if (updatedRoom.status === 'playing') {
              navigate(`/game/${roomId}`)
            }
          }
        )
        .subscribe()
    }

    setupSubscription()

    // Robust Polling Fallback (1s) - Essential for mobile and ensuring the Host sees the Challenger
    const pollInterval = setInterval(fetchRoom, 1500)

    return () => {
      mounted = false
      if (channel) channel.unsubscribe()
      clearInterval(pollInterval)
    }
  }, [roomId, navigate])

  const startMatch = async () => {
    if (!room || playerId !== room.player1_id || starting) return
    setStarting(true)

    // Play Whistle sound
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioCtx.createOscillator()
      const gainNode = audioCtx.createGain()
      oscillator.type = 'square'
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5)
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5)
      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)
      oscillator.start()
      oscillator.stop(audioCtx.currentTime + 0.5)
    } catch (_) {}

    const { error } = await supabase
      .from('rooms')
      .update({
        status: 'playing',
        current_turn: 'player1'
      })
      .eq('id', room.id)

    if (error) {
      toast.error('Failed to start match')
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-black">
        <Spinner className="size-8 text-[#ccff00]" />
      </div>
    )
  }

  const isHost = playerId === room?.player1_id
  const hasOpponent = !!room?.player2_id

  return (
    <div className="flex min-h-svh items-center justify-center bg-black p-4 relative overflow-hidden font-sans text-white">
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-[#ccff00]/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-[#ccff00]/5 blur-[150px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg z-10"
      >
        <Card className="border-white/10 bg-white/[0.03] backdrop-blur-3xl shadow-2xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="text-center pb-6 border-b border-white/5">
            <div className="mx-auto mb-4 bg-[#ccff00]/10 w-16 h-16 rounded-2xl flex items-center justify-center border border-[#ccff00]/20 shadow-[0_0_20px_rgba(204,255,0,0.2)]">
              <img src="/mobile.webp" alt="HPL Logo" className="w-10 h-10 object-cover" />
            </div>
            <CardTitle className="text-4xl font-black tracking-tighter uppercase italic text-white leading-none">
              MATCH LOBBY
            </CardTitle>
            <p className="text-[10px] font-black text-primary/40 uppercase tracking-[0.3em] mt-2">
              {hasOpponent ? 'GRID IS LOCKED' : 'AWAITING CHALLENGER'}
            </p>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-10 pt-10">
            {/* Room Code Display - Large and Neon */}
            {!hasOpponent && room?.room_code && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full text-center space-y-2"
              >
                <span className="text-[10px] font-black tracking-[0.4em] text-white/30 uppercase">SHARE CODE</span>
                <div className="bg-[#ccff00]/5 border border-[#ccff00]/10 py-6 px-4 rounded-[2rem] shadow-inner">
                  <h2 className="text-6xl sm:text-7xl font-black tracking-[0.2em] text-[#ccff00] italic drop-shadow-[0_0_30px_rgba(204,255,0,0.5)] tabular-nums">
                    {room.room_code}
                  </h2>
                </div>
              </motion.div>
            )}

            {/* VS Cluster */}
            <div className="flex items-center justify-center gap-6 w-full px-4">
              {/* Player 1 */}
              <div className="flex flex-col items-center gap-4 flex-1">
                <div className="w-24 h-24 rounded-[2.5rem] bg-[#ccff00] flex items-center justify-center shadow-[0_0_40px_rgba(204,255,0,0.4)] border-4 border-black/10">
                  <span className="text-4xl font-black text-black">P1</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-xs font-black tracking-widest text-[#ccff00] uppercase">
                    {isHost ? 'P1 (YOU)' : 'P1 (HOST)'}
                  </span>
                  <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest mt-1">Ready</span>
                </div>
              </div>

              {/* VS Divider */}
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center bg-white/5 backdrop-blur-md relative">
                  <div className="absolute inset-0 bg-[#ccff00]/20 blur-xl rounded-full" />
                  <span className="text-xs font-black italic tracking-tighter text-white relative z-10">VS</span>
                </div>
              </div>

              {/* Player 2 */}
              <div className="flex flex-col items-center gap-4 flex-1">
                <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-500 ${hasOpponent ? 'bg-white shadow-[0_0_40px_rgba(255,255,255,0.3)] border-4 border-black/10' : 'bg-white/5 border-2 border-dashed border-white/10'}`}>
                  {hasOpponent ? (
                    <span className="text-4xl font-black text-black animate-in zoom-in duration-300">P2</span>
                  ) : (
                    <motion.div animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                      <span className="text-2xl font-black text-white/20">?</span>
                    </motion.div>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <span className={`text-xs font-black tracking-widest uppercase transition-colors duration-500 ${hasOpponent ? 'text-white' : 'text-white/20'}`}>
                    {hasOpponent 
                      ? (!isHost ? 'P2 (YOU)' : 'P2 (CHALLENGER)') 
                      : 'EMPTY'
                    }
                  </span>
                  <span className={`text-[8px] font-bold uppercase tracking-widest mt-1 transition-colors ${hasOpponent ? 'text-primary' : 'text-white/10'}`}>
                    {hasOpponent ? 'Connected' : 'Waiting...'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Section */}
            <div className="w-full space-y-4 px-4">
              {isHost ? (
                <Button
                  size="lg"
                  disabled={!hasOpponent || starting}
                  onClick={startMatch}
                  className="w-full h-18 text-base font-black tracking-[0.4em] uppercase bg-[#ccff00] hover:bg-[#b8e600] text-black rounded-3xl shadow-[0_0_50px_rgba(204,255,0,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:grayscale py-8"
                >
                  {starting ? 'ESTABLISHING ARENA...' : 'START MATCH'}
                </Button>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center shadow-inner">
                  <p className="text-xs font-black uppercase tracking-widest text-[#ccff00] animate-pulse">
                    Waiting for Host to Kick-off
                  </p>
                </div>
              )}

              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="w-full h-12 text-[10px] font-black tracking-[0.2em] uppercase text-gray-500 hover:text-white mt-2"
              >
                Quit Matchmaking
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

