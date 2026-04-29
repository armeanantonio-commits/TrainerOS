import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '@/services/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { useI18n } from '@/hooks/useI18n';

export default function ActivateAccount() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState(t('auth.activating'));

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setState('error');
        setMessage(t('auth.activationTokenMissing'));
        return;
      }

      try {
        const { data } = await authAPI.activateAccount({ token });
        setState('success');
        setMessage(data.message || t('auth.activationSuccess'));
      } catch (err: any) {
        setState('error');
        const errorMessage = err.response?.data?.error || err.message;
        setMessage(errorMessage || t('auth.activationFailed'));
      }
    };

    void run();
  }, [token]);

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
          <h1 className="text-3xl font-bold text-white mt-4 font-display">{t('auth.activateTitle')}</h1>
        </div>

        <Card>
          <div className="space-y-5">
            {state === 'loading' && (
              <p className="text-gray-300 text-sm">{message}</p>
            )}
            {state === 'success' && (
              <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-4">
                <p className="text-brand-400 text-sm">{message}</p>
              </div>
            )}
            {state === 'error' && (
              <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
                <p className="text-red-500 text-sm">{message}</p>
              </div>
            )}

            <Link to="/login" className="block">
              <Button className="w-full">{t('auth.goToLogin')}</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
