import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { supabase, type Room, type Score } from '@/lib/supabase'
import { Spinner } from '@/components/ui/spinner'
import { Trophy, Frown } from 'lucide-react'

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
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: 360 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="mx-auto mb-4"
            >
              {result === 'win' ? (
                <div className="flex size-24 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Trophy className="size-12" />
                </div>
              ) : result === 'lose' ? (
                <div className="flex size-24 items-center justify-center rounded-full bg-muted">
                  <Frown className="size-12 text-muted-foreground" />
                </div>
              ) : (
                <div className="flex size-24 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <p className="text-4xl font-bold">🤝</p>
                </div>
              )}
            </motion.div>
            <CardTitle className="text-3xl">
              {result === 'win'
                ? 'You Won!'
                : result === 'lose'
                ? 'You Lost!'
                : "It's a Draw!"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Your Score</span>
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-2xl font-bold"
                >
                  {myScore}
                </motion.span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Opponent Score</span>
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-bold"
                >
                  {theirScore}
                </motion.span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => navigate('/')}
                >
                  Back to Home
                </Button>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
