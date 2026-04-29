import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { nicheAPI, subscriptionAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

type PreferredLanguage = 'ro' | 'en';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user, logout, updateProfile } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [editing, setEditing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const currentLanguage: PreferredLanguage = user?.preferredLanguage === 'en' ? 'en' : 'ro';
  const isExpoGo =
    Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
  const iosExternalCheckoutEnabled =
    Platform.OS === 'ios' && process.env.EXPO_PUBLIC_ENABLE_IOS_EXTERNAL_CHECKOUT === 'true';

  useEffect(() => {
    setName(user?.name || '');
    setEmail(user?.email || '');
  }, [user?.name, user?.email]);

  const { data: subscription } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: async () => {
      const { data } = await subscriptionAPI.status();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (!url.startsWith('traineros://subscription')) {
        return;
      }

      if (url.includes('payment=success')) {
        queryClient.invalidateQueries({ queryKey: ['subscription-status'] }).catch(() => undefined);
        Alert.alert(t('settings.saved'), t('settings.subscriptionSuccess'));
        return;
      }

      if (url.includes('payment=cancelled')) {
        Alert.alert(t('daily.error'), t('settings.checkoutCancelled'));
      }
    });

    return () => {
      subscription.remove();
    };
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: async () => updateProfile({ name, email }),
    onSuccess: () => {
      Alert.alert(t('settings.saved'), t('settings.profileSaved'));
      setEditing(false);
    },
    onError: (error: any) => {
      Alert.alert(t('daily.error'), error?.response?.data?.error || t('settings.profileSaveError'));
    },
  });

  const languageMutation = useMutation({
    mutationFn: async (preferredLanguage: PreferredLanguage) => updateProfile({ preferredLanguage }),
    onSuccess: () => {
      Alert.alert(t('settings.saved'), t('settings.languageSaved'));
    },
    onError: (error: any) => {
      Alert.alert(t('daily.error'), error?.response?.data?.error || t('settings.languageError'));
    },
  });

  const resetNicheMutation = useMutation({
    mutationFn: async () => {
      const { data } = await nicheAPI.reset();
      return data;
    },
    onSuccess: () => {
      Alert.alert(t('prefs.success'), t('settings.nicheResetSuccess'));
    },
    onError: (error: any) => {
      Alert.alert(t('daily.error'), error?.response?.data?.error || t('settings.nicheResetError'));
    },
  });

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutConfirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        { text: t('settings.logout'), style: 'destructive', onPress: logout },
      ]
    );
  };

  const handleSubscription = async () => {
    if (Platform.OS === 'ios') {
      const shouldUseWebCheckout = isExpoGo || iosExternalCheckoutEnabled;

      if (shouldUseWebCheckout) {
        await handleApplePayCheckout();
        return;
      }

      Alert.alert(
        t('settings.checkoutUnavailableTitle'),
        t('settings.checkoutUnavailableText')
      );
      return;
    }

    await handleApplePayCheckout();
  };

  const handleApplePayCheckout = async () => {
    try {
      setCheckoutLoading(true);

      const successUrl = 'traineros://subscription?payment=success';
      const cancelUrl = 'traineros://subscription?payment=cancelled';
      const { data } = await subscriptionAPI.createCheckoutSession({
        billingCycle: 'monthly',
        plan: 'PRO',
        successUrl,
        cancelUrl,
      });

      const checkoutUrl = data?.url as string | undefined;
      if (!checkoutUrl) {
        throw new Error(t('settings.checkoutUrlMissing'));
      }

      const canOpen = await Linking.canOpenURL(checkoutUrl);
      if (!canOpen) {
        throw new Error(t('settings.checkoutOpenError'));
      }

      await Linking.openURL(checkoutUrl);
    } catch (error: any) {
      Alert.alert(
        t('settings.checkoutFailed'),
        error?.response?.data?.error ||
          error?.message ||
          t('settings.checkoutStartError')
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleSaveProfile = () => {
    if (!email.trim()) {
      Alert.alert(t('settings.validation'), t('settings.emailRequired'));
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      Alert.alert(t('settings.validation'), t('settings.invalidEmail'));
      return;
    }
    updateMutation.mutate();
  };

  const handleResetNiche = () => {
    Alert.alert(
      t('settings.resetNicheConfirmTitle'),
      t('settings.resetNicheConfirmText'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.resetConfirm'),
          style: 'destructive',
          onPress: () => resetNicheMutation.mutate(),
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('settings.title')}</Text>
      </View>

      <Card style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
        <TouchableOpacity style={styles.menuItem} onPress={() => setEditing((v) => !v)}>
          <Text style={styles.menuText}>{t('settings.editProfile')}</Text>
          <Text style={styles.menuIcon}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={handleSubscription}>
          <Text style={styles.menuText}>{t('settings.subscription')}</Text>
          <Text style={styles.menuIcon}>›</Text>
        </TouchableOpacity>
      </View>

      {editing && (
        <Card style={styles.editCard}>
          <Text style={styles.editTitle}>{t('settings.editProfileTitle')}</Text>
          <Input
            label={t('settings.name')}
            value={name}
            onChangeText={setName}
            placeholder={t('settings.namePlaceholder')}
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={t('settings.emailPlaceholder')}
          />
          <Button
            title={t('settings.saveProfile')}
            onPress={handleSaveProfile}
            loading={updateMutation.isPending}
          />
        </Card>
      )}

      <Card style={styles.planCard}>
        <Text style={styles.planTitle}>{t('settings.currentPlan')}</Text>
        <Text style={styles.planValue}>{subscription?.plan || 'FREE_TRIAL'}</Text>
        {Platform.OS === 'ios' && isExpoGo ? (
          <Text style={styles.planHint}>
            Expo Go preview uses the hosted checkout flow instead of native App Store purchases.
          </Text>
        ) : null}
        {checkoutLoading ? (
          <Text style={styles.planHint}>Opening Stripe Checkout...</Text>
        ) : null}
      </Card>

      <Card style={styles.languageCard}>
        <Text style={styles.languageTitle}>{t('settings.language')}</Text>
        <Text style={styles.languageText}>
          {t('settings.languageText')}
        </Text>
        <View style={styles.languageToggle}>
          {([
            ['ro', 'Română'],
            ['en', 'English'],
          ] as const).map(([value, label]) => {
            const isActive = currentLanguage === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.languageOption, isActive && styles.languageOptionActive]}
                onPress={() => languageMutation.mutate(value)}
                disabled={languageMutation.isPending || isActive}
              >
                <Text style={[styles.languageOptionText, isActive && styles.languageOptionTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('ContentPreferences')}
        >
          <Text style={styles.menuText}>{t('settings.contentPreferences')}</Text>
          <Text style={styles.menuIcon}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('ContentCreationPreferences')}
        >
          <Text style={styles.menuText}>{t('settings.contentCreationPreferences')}</Text>
          <Text style={styles.menuIcon}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('Chat')}
        >
          <Text style={styles.menuText}>{t('settings.chat')}</Text>
          <Text style={styles.menuIcon}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('EmailMarketing')}
        >
          <Text style={styles.menuText}>{t('settings.emailMarketing')}</Text>
          <Text style={styles.menuIcon}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('ClientNutrition')}
        >
          <Text style={styles.menuText}>Generare Nutriție Client</Text>
          <Text style={styles.menuIcon}>›</Text>
        </TouchableOpacity>
      </View>

      <Card style={styles.resetCard}>
        <Text style={styles.resetTitle}>{t('settings.resetNicheTitle')}</Text>
        <Text style={styles.resetText}>{t('settings.resetNicheText')}</Text>
        <Button
          title={resetNicheMutation.isPending ? t('settings.resettingNiche') : t('settings.resetNiche')}
          onPress={handleResetNiche}
          variant="outline"
          disabled={resetNicheMutation.isPending}
          style={styles.resetButton}
          textStyle={styles.resetButtonText}
        />
      </Card>

      <Button
        title={t('settings.logout')}
        onPress={handleLogout}
        variant="outline"
        style={styles.logoutButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
  },
  profileCard: {
    alignItems: 'center' as const,
    padding: 24,
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.brand.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  editCard: {
    marginBottom: 24,
  },
  editTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text.primary,
    marginBottom: 12,
  },
  planCard: {
    marginBottom: 24,
  },
  planTitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  planValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.brand.primary,
  },
  planHint: {
    marginTop: 8,
    fontSize: 13,
    color: colors.text.secondary,
  },
  languageCard: {
    marginBottom: 24,
  },
  languageTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.text.primary,
    marginBottom: 8,
  },
  languageText: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  languageToggle: {
    flexDirection: 'row' as const,
    backgroundColor: colors.dark.bg,
    borderRadius: 10,
    padding: 4,
  },
  languageOption: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 8,
    paddingVertical: 10,
  },
  languageOptionActive: {
    backgroundColor: colors.brand.primary,
  },
  languageOptionText: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  languageOptionTextActive: {
    color: colors.text.primary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text.secondary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center' as const,
    backgroundColor: colors.dark.card,
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  menuText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  menuIcon: {
    fontSize: 24,
    color: colors.text.secondary,
  },
  logoutButton: {
    marginTop: 16,
  },
  resetCard: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f59e0b66',
  },
  resetTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#f59e0b',
    marginBottom: 8,
  },
  resetText: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  resetButton: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  resetButtonText: {
    color: '#f59e0b',
  },
});
