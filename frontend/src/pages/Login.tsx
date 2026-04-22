import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const infoMessage = (location.state as { message?: string } | undefined)?.message || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('🔴 Login error FULL:', err);
      console.error('🔴 Response data:', err.response?.data);
      console.error('🔴 Status:', err.response?.status);
      
      // Extract error message
      const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message;
      console.error('🔴 Extracted error message:', errorMessage);
      
      // Translate to Romanian
      if (errorMessage === 'Invalid credentials') {
        setError('❌ Email sau parolă incorectă. Încearcă din nou.');
      } else if (errorMessage?.toLowerCase().includes('activate your account')) {
        setError('❌ Contul nu este activat. Verifică email-ul și accesează link-ul de activare.');
      } else if (errorMessage?.toLowerCase().includes('email')) {
        setError('Email invalid. Verifică adresa introdusă.');
      } else if (errorMessage?.toLowerCase().includes('password')) {
        setError('Parolă incorectă. Încearcă din nou.');
      } else if (errorMessage?.toLowerCase().includes('not found')) {
        setError('❌ Cont inexistent. Încearcă să te înregistrezi.');
      } else {
        setError(errorMessage || 'Login eșuat. Încearcă din nou.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-400 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-4">
            <img
              src="/logo.jpeg"
              alt="TrainerOS logo"
              className="w-16 h-16 rounded-lg border-2 border-white/20 object-cover"
            />
            <span className="text-white font-bold text-2xl font-display">TrainerOS</span>
          </Link>
          <h1 className="text-3xl font-bold text-white mt-4 font-display">Bine ai revenit</h1>
          <p className="text-gray-300 mt-2">Loghează-te în contul tău</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {infoMessage && (
              <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-4">
                <p className="text-brand-400 text-sm">{infoMessage}</p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            )}

            <Input
              type="email"
              label="Email"
              placeholder="nume@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Input
              type="password"
              label="Parolă"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-gray-300">
                <input type="checkbox" className="rounded" />
                Ține-mă minte
              </label>
              <Link to="/forgot-password" className="text-brand-500 hover:text-brand-400">
                Ai uitat parola?
              </Link>
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Login
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-300 text-sm">
              Nu ai cont?{' '}
              <Link to="/register" className="text-brand-500 hover:text-brand-400 font-semibold">
                Înregistrează-te gratuit
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
