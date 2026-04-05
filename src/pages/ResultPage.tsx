import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase, type Room, type Score } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
// Icons replaced by image logos

export function ResultPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const [room, setRoom] = useState<Room | null>(null)
  const [score, setScore] = useState<Score | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setPlayerId(user?.id || null)

      if (!roomId) return

      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      const { data: scoreData } = await supabase
        .from('scores')
        .select('*')
        .eq('room_id', roomId)
        .single()

      setRoom(roomData)
      setScore(scoreData)
      setLoading(false)
    }

    init()
  }, [roomId])

  if (loading || !room || !score || !playerId) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  // P1/P2 tags are based on TOSS result: toss winner = P1, loser = P2
  const isTossWinner = !!room.first_batter && room.first_batter === playerId
  // Map toss-based P1/P2 to the underlying player1/player2 score columns
  const isTossWinnerRoomP1 = room.first_batter === room.player1_id
  const p1TagScore = isTossWinnerRoomP1 ? score.player1_score : score.player2_score  // toss-P1 raw score
  const p2TagScore = isTossWinnerRoomP1 ? score.player2_score : score.player1_score  // toss-P2 raw score
  const myScore = isTossWinner ? p1TagScore : p2TagScore
  const theirScore = isTossWinner ? p2TagScore : p1TagScore

  const result =
    myScore > theirScore
      ? 'win'
      : myScore < theirScore
      ? 'lose'
      : 'draw'

  return (
    <div className="flex min-h-svh flex-col items-center justify-start sm:justify-center bg-background p-2 sm:p-4 py-8 sm:py-12 relative overflow-y-auto overflow-x-hidden font-sans text-white">
      {/* Background decoration */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md z-10 my-auto"
      >
        <Card className="border-primary/20 bg-card/50 backdrop-blur-xl shadow-[0_0_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
          <CardHeader className="text-center pb-6 sm:pb-8 border-b border-primary/10">
            <div className="mx-auto mb-4 bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center border border-primary/20 shadow-[0_0_20px_rgba(204,255,0,0.2)] overflow-hidden">
              <img src="/mobile.webp" alt="HPL Logo" className="w-full h-full object-cover" />
            </div>
            <CardTitle className="text-3xl sm:text-5xl font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              {result === 'win'
                ? 'YOU WON!'
                : result === 'lose'
                ? 'YOU LOST'
                : "IT'S A DRAW"}
            </CardTitle>
            <p className="text-[10px] sm:text-xs font-black text-primary uppercase tracking-[0.3em] mt-2 opacity-60">MATCH COMPLETE</p>
          </CardHeader>
          <CardContent className="space-y-6 sm:space-y-8 pt-8">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2 p-4 sm:p-5 rounded-2xl bg-primary/5 border border-primary/20 text-center relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-2 h-2 bg-primary/40 rounded-bl-lg" />
                <span className="text-[8px] sm:text-[10px] font-black text-primary/60 uppercase tracking-widest">Your Score</span>
                <motion.p
                  initial={{ scale: 1 }}
                  animate={{ scale: result === 'win' ? [1, 1.1, 1] : 1 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-3xl sm:text-5xl font-black italic tabular-nums text-white group-hover:text-primary transition-colors"
                >
                  {myScore}
                </motion.p>
              </div>
              <div className="space-y-2 p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/5 text-center relative overflow-hidden">
                <span className="text-[8px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest">Challenger</span>
                <p className="text-3xl sm:text-5xl font-black italic tabular-nums text-white/40">
                  {theirScore}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  size="lg"
                  className="w-full h-14 sm:h-16 text-sm sm:text-base font-black tracking-widest uppercase shadow-[0_10px_20px_-5px_rgba(204,255,0,0.3)] hover:shadow-[0_15px_30px_-5px_rgba(204,255,0,0.4)] transition-all bg-primary text-black"
                  onClick={() => navigate('/')}
                >
                  RETURN TO LOBBY
                </Button>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
