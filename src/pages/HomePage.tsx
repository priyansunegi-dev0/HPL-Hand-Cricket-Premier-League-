import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md z-10"
      >
        <Card className="border-primary/20 bg-card/50 backdrop-blur-xl shadow-[0_0_50px_-12px_rgba(204,255,0,0.15)]">
          <CardHeader className="text-center pb-8">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="mx-auto mb-4 bg-primary/5 w-24 h-24 rounded-2xl flex items-center justify-center border-2 border-primary/20 shadow-[0_0_30px_rgba(204,255,0,0.2)] overflow-hidden"
            >
              <img 
                src="/mobile.webp" 
                alt="HPL Hero" 
                className="w-full h-full object-cover opacity-90 brightness-110"
              />
            </motion.div>
            <CardTitle className="text-5xl font-black tracking-tighter text-white drop-shadow-[0_0_10px_rgba(204,255,0,0.3)] mb-2 uppercase italic">
              HPL
            </CardTitle>
            <CardDescription className="text-lg font-bold text-primary tracking-widest uppercase">
              Premier League
            </CardDescription>
            <CardDescription className="text-muted-foreground mt-2 font-medium">
              Real-time multiplayer hand cricket
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                size="lg"
                className="w-full h-14 text-base font-black tracking-widest uppercase shadow-[0_0_20px_rgba(204,255,0,0.25)] hover:shadow-[0_0_30px_rgba(204,255,0,0.4)] transition-all"
                onClick={() => navigate('/create')}
              >
                Create Room
              </Button>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                size="lg"
                variant="outline"
                className="w-full h-14 text-base font-black tracking-widest uppercase border-primary/30 text-primary hover:bg-primary/10 hover:border-primary transition-all"
                onClick={() => navigate('/join')}
              >
                Join Room
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
