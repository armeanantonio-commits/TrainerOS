import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import Button from '../components/Button';
import { useI18n } from '../hooks/useI18n';

export default function NicheFinderScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{t('niche.badge')}</Text>
        <Text style={styles.title}>{t('niche.title')}</Text>
        <Text style={styles.subtitle}>
          {t('niche.subtitle')}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => navigation.navigate('NicheQuick')}
      >
        <Card style={styles.modeCard}>
          <Text style={styles.modeEmoji}>⚡</Text>
          <Text style={styles.cardTitle}>{t('niche.quickTitle')}</Text>
          <Text style={styles.cardDescription}>
            {t('niche.quickText')}
          </Text>
          <View style={styles.featuresBox}>
            <Text style={styles.featureText}>{t('niche.featureDemographic')}</Text>
            <Text style={styles.featureText}>{t('niche.featureRoutine')}</Text>
            <Text style={styles.featureText}>{t('niche.featureModules')}</Text>
            <Text style={styles.featureText}>{t('niche.featureBuilder')}</Text>
          </View>
          <Button
            title={t('niche.quickButton')}
            onPress={() => navigation.navigate('NicheQuick')}
          />
        </Card>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => navigation.navigate('NicheDiscover')}
      >
        <Card style={styles.modeCard}>
          <Text style={styles.modeEmoji}>🔍</Text>
          <Text style={styles.cardTitle}>{t('niche.discoverTitle')}</Text>
          <Text style={styles.cardDescription}>
            {t('niche.discoverText')}
          </Text>
          <View style={styles.featuresBox}>
            <Text style={styles.featureText}>{t('niche.featurePhaseA')}</Text>
            <Text style={styles.featureText}>{t('niche.featurePhaseB')}</Text>
            <Text style={styles.featureText}>{t('niche.featurePhaseC')}</Text>
            <Text style={styles.featureText}>{t('niche.featureFinal')}</Text>
          </View>
          <Button
            title={t('niche.discoverButton')}
            onPress={() => navigation.navigate('NicheDiscover')}
            variant="outline"
          />
        </Card>
      </TouchableOpacity>
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
  kicker: {
    fontSize: 12,
    color: colors.brand.primary,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
    marginBottom: 12,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  featuresBox: {
    backgroundColor: colors.dark.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: 12,
    marginBottom: 16,
    gap: 6,
  },
  featureText: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 18,
  },
  modeCard: {
    marginBottom: 16,
  },
  modeEmoji: {
    fontSize: 32,
    marginBottom: 10,
  },
});
