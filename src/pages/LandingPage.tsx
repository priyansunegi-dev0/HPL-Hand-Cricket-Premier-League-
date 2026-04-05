import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, BookOpen, Home as HomeIcon, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export const LandingPage = () => {
  const [view, setView] = useState<'home' | 'rules' | 'social'>('home')

  const containerVariants = {
    initial: (direction: number) => ({
      x: direction > 0 ? 500 : -500,
      opacity: 0,
      scale: 0.95
    }),
    animate: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: { type: "spring" as const, stiffness: 300, damping: 30 },
        opacity: { duration: 0.4 }
      }
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -500 : 500,
      opacity: 0,
      scale: 0.95,
      transition: {
        x: { type: "spring" as const, stiffness: 300, damping: 30 },
        opacity: { duration: 0.4 }
      }
    })
  }

  return (
    <div className="relative min-h-screen w-full bg-black text-white overflow-hidden font-sans">
      {/* Background Image Layer */}
      {/* Background Image Layer - Responsive */}
      <div className="absolute inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat block md:hidden opacity-70"
          style={{
            backgroundImage: 'url("/mobile.webp")',
            backgroundPosition: 'center 40%'
          }}
        />
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat hidden md:block opacity-60 lg:opacity-100"
          style={{
            backgroundImage: 'url("/bg.webp")',
            backgroundPosition: 'center right'
          }}
        />
      </div>

      {/* Overlay Gradient for readability on left side */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-r from-black via-black/70 to-transparent pointer-events-none" />

      {/* Content Layer */}
      <div className="relative z-10 flex flex-col min-h-screen mx-auto w-full max-w-7xl px-6 md:px-12 lg:px-16">
        {/* Navigation Bar */}
        <header className="flex items-center justify-between py-8">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-primary/30 shadow-[0_0_15px_rgba(204,255,0,0.3)]">
              <img src="/mobile.webp" alt="HPL Logo" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-xl font-black tracking-tighter">HPL</span>
              <span className="text-[8px] font-bold tracking-[0.2em] text-muted-foreground uppercase">Hand Cricket</span>
            </div>
          </div>

          <nav className="flex items-center gap-6 sm:gap-10">
            <button
              onClick={() => setView('home')}
              className={`text-sm font-black tracking-widest transition-all uppercase flex items-center gap-2 ${view === 'home' ? 'text-[#ccff00] drop-shadow-[0_0_8px_#ccff00]' : 'text-gray-500 hover:text-white'}`}
            >
              <HomeIcon className="w-4 h-4" />
              Home
            </button>
            <button
              onClick={() => setView('rules')}
              className={`text-sm font-black tracking-widest transition-all uppercase flex items-center gap-2 ${view === 'rules' ? 'text-[#ccff00] drop-shadow-[0_0_8px_#ccff00]' : 'text-gray-500 hover:text-white'}`}
            >
              <BookOpen className="w-4 h-4" />
              Rules
            </button>
            <button
              onClick={() => setView('social')}
              className={`text-sm font-black tracking-widest transition-all uppercase flex items-center gap-2 ${view === 'social' ? 'text-[#ccff00] drop-shadow-[0_0_8px_#ccff00]' : 'text-gray-500 hover:text-white'}`}
            >
              <ArrowRight className="w-4 h-4 ml-[-4px]" />
              Social
            </button>
          </nav>
          <div className="hidden md:block w-32" /> {/* Spacer instead of Quick Join */}
        </header>

        {/* Dynamic Content Section */}
        <main className="flex-1 relative flex flex-col justify-center items-start pb-20">
          <AnimatePresence mode="wait" custom={view === 'rules' ? 1 : -1}>
            {view === 'home' ? (
              <motion.div
                key="home"
                custom={-1}
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full"
              >
                <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-[7rem] font-black leading-[1] tracking-tighter mb-8 max-w-5xl translate-y-[-20px]">
                  HAND CRICKET<br />
                  PREMIER LEAGUE <span className="text-[#ccff00] italic font-serif tracking-normal drop-shadow-[0_0_25px_rgba(204,255,0,0.5)]">2026</span>
                </h1>

                <p className="text-base md:text-lg text-gray-400 max-w-lg mb-12 font-medium leading-relaxed">
                  Experience the legendary game of Hand Cricket in a premium multiplayer arena. Master the strategy of numbers, and claim your spot as the ultimate HPL champion.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6 w-full sm:w-auto">
                  <Link to="/home">
                    <Button className="w-full sm:w-auto bg-[#ccff00] hover:bg-[#b8e600] text-black font-black px-12 py-8 rounded-full shadow-[0_0_40px_rgba(204,255,0,0.4)] transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-4 text-sm tracking-[0.2em] group">
                      START PLAYING
                      <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ) : view === 'rules' ? (
              <motion.div
                key="rules"
                custom={1}
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full max-w-2xl"
              >
                <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#ccff00]/10 blur-[60px] rounded-full transition-opacity group-hover:opacity-100 opacity-50" />

                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-[#ccff00]/10 p-1.5 rounded-2xl border border-[#ccff00]/20 overflow-hidden w-12 h-12">
                      <img src="/mobile.webp" alt="HPL Logo" className="w-full h-full object-cover" />
                    </div>
                    <h2 className="text-3xl font-black tracking-tight text-white uppercase italic">Gameplay Rules</h2>
                  </div>

                  <div className="space-y-4">
                    {[
                      { title: "Matching Up", text: "Join or create a room. Once both players arrive, a countdown starts the match." },
                      { title: "The Toss", text: "React fast! In the Toss screen, the player who clicks Heads/Tails earliest gets to Bat first." },
                      { title: "Batting & Bowling", text: "Both players select a number (1-6). If choices match, the batter is OUT." },
                      { title: "Scoring Runs", text: "If numbers are different, the batter's chosen number is added to their total score." },
                      { title: "The Chase", text: "Each innings is 10 balls. In the 2nd innings, the chaser must exceed the Target by at least 1 run." }
                    ].map((rule, idx) => (
                      <div key={idx} className="flex gap-4 group/item">
                        <div className="mt-1.5 flex-shrink-0 w-6 h-6 rounded-full bg-[#ccff00]/10 border border-[#ccff00]/30 flex items-center justify-center group-hover/item:border-[#ccff00] transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#ccff00]" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-[#ccff00] uppercase tracking-wider mb-0.5">{rule.title}</p>
                          <p className="text-gray-400 text-sm font-medium leading-relaxed group-hover/item:text-gray-200 transition-colors">
                            {rule.text}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/5">
                    <Button
                      onClick={() => setView('home')}
                      variant="ghost"
                      className="text-[#ccff00] hover:text-[#ccff00] hover:bg-[#ccff00]/5 font-black px-0 flex items-center gap-2 tracking-widest uppercase transition-all hover:gap-4 h-auto py-2"
                    >
                      Back to Home
                      <ArrowRight className="w-4 h-4 translate-y-[1px]" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="social"
                custom={1}
                variants={containerVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full max-w-2xl"
              >
                <div className="backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#ccff00]/10 blur-[60px] rounded-full transition-opacity group-hover:opacity-100 opacity-50" />

                  <div className="flex items-center gap-4 mb-8">
                    <div className="bg-[#ccff00]/10 p-1.5 rounded-2xl border border-[#ccff00]/20 overflow-hidden w-12 h-12">
                      <img src="/mobile.webp" alt="HPL Logo" className="w-full h-full object-cover" />
                    </div>
                    <h2 className="text-3xl font-black tracking-tight text-white uppercase italic">Connect With Us</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { label: "LinkedIn", icon: ArrowRight, url: "https://www.linkedin.com/in/prriiyansu", color: "bg-[#0A66C2]" },
                      { label: "Instagram", icon: ArrowRight, url: "https://www.instagram.com/priyyaansu/", color: "bg-[#E4405F]" },
                      { label: "GitHub", icon: ArrowRight, url: "https://github.com/priyansunegi-dev0", color: "bg-[#333]" },
                    ].map((platform, idx) => (
                      <a
                        key={idx}
                        href={platform.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/social flex flex-col items-center gap-4 p-6 rounded-3xl bg-white/[0.03] border border-white/5 hover:border-[#ccff00]/30 hover:bg-[#ccff00]/5 transition-all duration-300"
                      >
                        <div className={`p-4 rounded-2xl ${platform.color}/10 border border-white/5 group-hover/social:border-[#ccff00]/20 shadow-xl transition-all group-hover/social:scale-110`}>
                          <platform.icon className="w-6 h-6 text-[#ccff00]" />
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400 group-hover/social:text-[#ccff00] transition-colors">{platform.label}</span>
                      </a>
                    ))}
                  </div>

                  <div className="mt-10 pt-6 border-t border-white/5">
                    <Button
                      onClick={() => setView('home')}
                      variant="ghost"
                      className="text-[#ccff00] hover:text-[#ccff00] hover:bg-[#ccff00]/5 font-black px-0 flex items-center gap-2 tracking-widest uppercase transition-all hover:gap-4 h-auto py-2"
                    >
                      Back to Home
                      <ArrowRight className="w-4 h-4 translate-y-[1px]" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Decorative Blur and Accent Elements */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-[#ccff00]/10 blur-[150px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-[#ccff00]/5 blur-[150px] rounded-full pointer-events-none z-0" />
    </div>
  )
}

export default LandingPage
