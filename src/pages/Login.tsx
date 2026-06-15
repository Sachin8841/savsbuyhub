import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast({ title: 'Account created!', description: 'Check your email to verify your account.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center animated-gradient-bg p-4 relative overflow-hidden">
      {/* Decorative blurred circles for extra premium feel */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none mix-blend-multiply dark:mix-blend-screen"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none mix-blend-multiply dark:mix-blend-screen"></div>
      
      <Card className="w-full max-w-md glass-card shadow-2xl border-white/40 dark:border-white/10 relative z-10 micro-animate">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-6 h-20 w-20 rounded-2xl bg-white shadow-xl flex items-center justify-center border border-slate-100 p-2.5 relative overflow-hidden">
            <img src="/savs-logo-placeholder.png" alt="SAVS Logo" className="h-full w-full object-contain" />
          </div>
          <CardTitle className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500 dark:from-slate-100 dark:to-slate-400">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </CardTitle>
          <CardDescription className="text-sm font-medium mt-2">SAVS Buyhub Sales Command Center</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className="bg-white/50 dark:bg-slate-900/50" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} className="bg-white/50 dark:bg-slate-900/50" />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-emerald-500 hover:from-indigo-700 hover:to-emerald-600 text-white shadow-lg mt-6" disabled={loading}>
              {loading ? 'Processing...' : isSignUp ? 'Sign Up Securely' : 'Sign In Securely'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary hover:underline">
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
          <div className="mt-3 text-center">
            <Link to="/forecast" className="text-sm text-primary hover:underline">View Public Forecast →</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
