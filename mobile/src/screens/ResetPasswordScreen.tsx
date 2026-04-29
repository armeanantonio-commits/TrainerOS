import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { colors } from '../constants/colors';
import Input from '../components/Input';
import Button from '../components/Button';
import { authAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

export default function ResetPasswordScreen() {
  const { t } = useI18n();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await authAPI.resetPassword({ token, password });
      return data;
    },
    onSuccess: (data: any) => {
      Alert.alert(t('reset.successTitle'), data?.message || t('reset.successText'));
      setToken('');
      setPassword('');
      setConfirmPassword('');
    },
    onError: (error: any) => {
      Alert.alert(t('daily.error'), error?.response?.data?.error || t('reset.errorText'));
    },
  });

  const canSubmit =
    token.trim().length > 0 && password.length >= 6 && confirmPassword === password;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('reset.title')}</Text>
        <Text style={styles.subtitle}>{t('reset.subtitle')}</Text>

        <Input
          label={t('reset.token')}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          placeholder={t('reset.tokenPlaceholder')}
        />

        <Input
          label={t('reset.newPassword')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder={t('reset.newPasswordPlaceholder')}
        />

        <Input
          label={t('reset.confirmPassword')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder={t('reset.confirmPasswordPlaceholder')}
          error={confirmPassword && confirmPassword !== password ? t('reset.passwordMismatch') : undefined}
        />

        <Button
          title={t('reset.submit')}
          onPress={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!canSubmit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    padding: 24,
  },
  title: {
    color: colors.text.primary,
    fontSize: 30,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: 14,
    marginBottom: 20,
  },
});
