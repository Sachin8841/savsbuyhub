import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, TrendingUp, BarChart3, ShieldCheck } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'unauthorized') {
      const t = setTimeout(() => {
        toast({
          title: 'Access Denied',
          description: 'Only administrators are authorized to access this ERP system.',
          variant: 'destructive',
        });
      }, 100);
      return () => clearTimeout(t);
    }
  }, [searchParams, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({ title: '🎉 Account created!', description: 'Check your email to verify your account.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: any) {
      toast({ title: 'Authentication Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: TrendingUp, label: 'Real-time P&L tracking' },
    { icon: BarChart3, label: 'Advanced ledger controls' },
    { icon: ShieldCheck, label: 'Secure administrative access' },
  ];

  return (
    <div className="flex min-h-screen animated-gradient-bg relative overflow-hidden">
      {/* Decorative orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none mix-blend-multiply dark:mix-blend-screen animate-[pulse_6s_ease-in-out_infinite]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none mix-blend-multiply dark:mix-blend-screen animate-[pulse_8s_ease-in-out_infinite]" />
      <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-violet-500/15 rounded-full blur-3xl pointer-events-none mix-blend-multiply dark:mix-blend-screen animate-[pulse_10s_ease-in-out_infinite]" />

      {/* Left panel — branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-indigo-600/90 to-emerald-600/90 backdrop-blur-xl relative z-10">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center shadow-lg border border-white/30">
              <span className="text-white font-black text-lg">S</span>
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-none">SAVS ERP</p>
              <p className="text-white/60 text-xs uppercase tracking-widest font-medium">BuyHub Core</p>
            </div>
          </div>

          <h2 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Your Business,<br />Perfectly Managed.
          </h2>
          <p className="text-white/70 text-lg leading-relaxed mb-10">
            Track inventory, sales, returns and investor performance — all in one command center.
          </p>

          <div className="space-y-4">
            {features.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-white/90">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/40 text-xs">© {new Date().getFullYear()} SAVS BuyHub. All rights reserved.</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <Card className="w-full max-w-md glass-card shadow-2xl border-white/40 dark:border-white/10 micro-animate">
          <CardHeader className="text-center pb-2">
            {/* Mobile logo */}
            <div className="mx-auto mb-5 lg:hidden h-16 w-16 rounded-2xl bg-white flex items-center justify-center shadow-xl ring-1 ring-indigo-500/30 overflow-hidden">
              <img src="/savs-logo-placeholder.png" alt="SAVS BuyHub" className="h-full w-full object-contain" />
            </div>
            <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500 dark:from-slate-100 dark:to-slate-400">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription className="text-sm font-medium mt-1">
              SAVS BuyHub — Sales Command Center
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="bg-white/50 dark:bg-slate-900/50 glow-focus transition-all"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    minLength={6}
                    className="bg-white/50 dark:bg-slate-900/50 pr-10 glow-focus transition-all"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-700 hover:to-emerald-600 text-white shadow-lg mt-2 h-11 font-semibold transition-all hover:shadow-indigo-500/25 hover:shadow-xl"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Processing...
                  </span>
                ) : isSignUp ? 'Create Account' : 'Sign In Securely'}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary font-medium hover:underline">
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>

            <div className="mt-3 text-center border-t border-border/50 pt-3">
              <Link to="/forecast" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                View Public Forecast →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
