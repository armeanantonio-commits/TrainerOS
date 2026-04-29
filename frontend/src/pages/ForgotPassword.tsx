import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '@/services/api';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';
import { useI18n } from '@/hooks/useI18n';

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const { data } = await authAPI.forgotPassword({ email });
      setSuccess(data.message || t('auth.forgotSuccess'));
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message;
      setError(errorMessage || t('auth.forgotFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-400 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-dark-400 font-bold text-2xl font-display">T</span>
            </div>
            <span className="text-white font-bold text-2xl font-display">TrainerOS</span>
          </Link>
          <h1 className="text-3xl font-bold text-white mt-4 font-display">{t('auth.forgotTitle')}</h1>
          <p className="text-gray-300 mt-2">{t('auth.forgotSubtitle')}</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {success && (
              <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-4">
                <p className="text-brand-400 text-sm">{success}</p>
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
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Button type="submit" className="w-full" isLoading={isLoading}>
              {t('auth.sendResetLink')}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-brand-500 hover:text-brand-400 font-semibold">
              {t('auth.backToLogin')}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
