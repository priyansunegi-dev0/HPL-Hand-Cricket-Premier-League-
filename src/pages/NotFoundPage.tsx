import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const NotFoundPage = () => {
  const navigate = useNavigate()

  return (
    <div className="relative min-h-screen w-full bg-black text-white overflow-hidden font-sans flex flex-col items-center justify-center p-6">
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40"
          style={{
            backgroundImage: 'url("/bg.webp")',
            backgroundPosition: 'center'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/80 to-black pointer-events-none" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 text-center max-w-2xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
        >
          <h1 className="text-[10rem] sm:text-[15rem] font-black leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-[#ccff00] to-transparent drop-shadow-[0_0_50px_rgba(204,255,0,0.3)]">
            404
          </h1>
          
          <div className="mt-[-2rem] sm:mt-[-4rem]">
            <h2 className="text-3xl sm:text-5xl font-black uppercase italic tracking-tight mb-6">
              INNINGS <span className="text-[#ccff00]">ENDED!</span>
            </h2>
            <p className="text-gray-400 text-lg mb-10 max-w-md mx-auto font-medium leading-relaxed">
              Looks like you've wandered into the stands. This page doesn't exist or has been retired.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              className="w-full sm:w-auto border-white/20 hover:bg-white/5 text-white font-black px-8 py-6 rounded-full transition-all flex items-center gap-2 tracking-widest uppercase"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Button>
            
            <Button
              onClick={() => navigate('/')}
              className="w-full sm:w-auto bg-[#ccff00] hover:bg-[#b8e600] text-black font-black px-10 py-6 rounded-full shadow-[0_0_30px_rgba(204,255,0,0.3)] transition-all hover:scale-105 active:scale-95 flex items-center gap-2 tracking-widest uppercase"
            >
              <Home className="w-4 h-4" />
              Back to Home
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#ccff00]/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#ccff00]/5 blur-[120px] rounded-full pointer-events-none" />
    </div>
  )
}

export default NotFoundPage
