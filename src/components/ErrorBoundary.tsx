import { Component, type ErrorInfo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Home, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false })
    window.location.href = '/'
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="relative min-h-screen w-full bg-black text-white overflow-hidden font-sans flex flex-col items-center justify-center p-6">
          {/* Background Image Layer */}
          <div className="absolute inset-0 z-0">
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 grayscale"
              style={{
                backgroundImage: 'url("/bg.webp")',
                backgroundPosition: 'center'
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black via-black/90 to-black pointer-events-none" />
          </div>

          {/* Content Container */}
          <div className="relative z-10 text-center max-w-2xl px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="mb-8 flex justify-center">
                <div className="p-6 rounded-full bg-destructive/10 border-2 border-destructive/30 shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                  <AlertTriangle className="w-16 h-16 text-destructive animate-pulse" />
                </div>
              </div>

              <h1 className="text-4xl sm:text-6xl font-black uppercase italic tracking-tighter mb-4">
                SYSTEM <span className="text-destructive">GLITCH!</span>
              </h1>
              
              <p className="text-gray-400 text-lg mb-10 max-w-md mx-auto font-medium leading-relaxed">
                The match has been interrupted by an unexpected error. Don't worry, your progress is safe in the pavilion.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  className="w-full sm:w-auto border-white/20 hover:bg-white/5 text-white font-black px-8 py-6 rounded-full transition-all flex items-center gap-2 tracking-widest uppercase"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Match
                </Button>
                
                <Button
                  onClick={this.handleReset}
                  className="w-full sm:w-auto bg-[#ccff00] hover:bg-[#b8e600] text-black font-black px-10 py-6 rounded-full shadow-[0_0_30px_rgba(204,255,0,0.3)] transition-all hover:scale-105 active:scale-95 flex items-center gap-2 tracking-widest uppercase"
                >
                  <Home className="w-4 h-4" />
                  Back to Home
                </Button>
              </div>

              {import.meta.env.DEV && (
                <div className="mt-12 p-4 bg-red-950/20 border border-red-900/30 rounded-xl text-left overflow-auto max-h-40">
                  <p className="text-xs font-mono text-destructive/80 leading-relaxed whitespace-pre-wrap">
                    {this.state.error?.toString()}
                  </p>
                </div>
              )}
            </motion.div>
          </div>

          {/* Decorative Elements */}
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-destructive/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#ccff00]/5 blur-[120px] rounded-full pointer-events-none" />
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
