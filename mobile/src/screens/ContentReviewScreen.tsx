import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../constants/colors';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import { feedbackAPI } from '../services/api';
import { useI18n } from '../hooks/useI18n';

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

interface ReviewSuggestion {
  type?: 'error' | 'warning' | 'success';
  category?: string;
  text: string;
}

interface ReviewResult {
  id?: string;
  clarityScore: number;
  relevanceScore: number;
  trustScore: number;
  ctaScore: number;
  overallScore: number;
  summary?: string;
  transcription?: string;
  suggestions?: ReviewSuggestion[];
}

interface SelectedVideoFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

export default function ContentReviewScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const [selectedFile, setSelectedFile] = useState<SelectedVideoFile | null>(null);
  const [textContent, setTextContent] = useState('');
  const [format, setFormat] = useState('reel');
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);

  const videoMutation = useMutation({
    mutationFn: (payload: { uri: string; type: string; name: string; format: string }) =>
      feedbackAPI.analyze(payload),
    onSuccess: (response) => {
      setReviewResult(response.data);
      Alert.alert(t('review.success'), t('review.videoSuccess'));
      if (response?.data?.id) {
        navigation.navigate('FeedbackDetail', { id: response.data.id });
      }
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        t('review.videoError');
      Alert.alert(t('daily.error'), message);
    },
  });

  const textMutation = useMutation({
    mutationFn: (data: { text: string; format: string }) => 
      feedbackAPI.analyzeText(data),
    onSuccess: (response) => {
      setReviewResult(response.data);
      Alert.alert(t('review.success'), t('review.textSuccess'));
      if (response?.data?.id) {
        navigation.navigate('FeedbackDetail', { id: response.data.id });
      }
    },
    onError: () => {
      Alert.alert(t('daily.error'), t('review.textError'));
    },
  });

  const pickVideo = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('review.permissionTitle'), t('review.permissionText'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const picked = result.assets[0];
        if (picked.fileSize && picked.fileSize > MAX_UPLOAD_BYTES) {
          Alert.alert(
            t('review.fileTooLarge'),
            t('review.fileTooLargeText', {
              size: (picked.fileSize / 1024 / 1024).toFixed(1),
            })
          );
          return;
        }

        setSelectedFile({
          uri: picked.uri,
          name: picked.fileName || `video-${Date.now()}.mp4`,
          mimeType: picked.mimeType || 'video/mp4',
          size: picked.fileSize,
        });
        setReviewResult(null);
      }
    } catch (error) {
      Alert.alert(t('daily.error'), t('review.pickError'));
    }
  };

  const handleVideoUpload = () => {
    if (!selectedFile) {
      Alert.alert(t('daily.error'), t('review.selectVideo'));
      return;
    }

    const fileType = selectedFile.mimeType || 'video/mp4';
    const fileName = selectedFile.name || `upload.${fileType.split('/')[1] || 'mp4'}`;

    videoMutation.mutate({
      uri: selectedFile.uri,
      type: fileType,
      name: fileName,
      format,
    });
  };

  const handleTextSubmit = () => {
    if (!textContent.trim()) {
      Alert.alert(t('daily.error'), t('review.enterText'));
      return;
    }
    setReviewResult(null);
    textMutation.mutate({ text: textContent, format });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('review.title')}</Text>
        <Text style={styles.subtitle}>
          {t('review.subtitle')}
        </Text>
        <Button
          title={t('review.history')}
          variant="outline"
          onPress={() => navigation.navigate('FeedbackHistory')}
          style={styles.historyButton}
        />
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{t('review.uploadVideo')}</Text>
        <Button
          title={selectedFile ? t('review.changeVideo') : t('review.chooseVideo')}
          onPress={pickVideo}
          variant="outline"
        />
        {selectedFile && (
          <Text style={styles.fileName}>{selectedFile.name}</Text>
        )}
        {selectedFile && (
          <Button
            title={t('review.analyzeVideo')}
            onPress={handleVideoUpload}
            loading={videoMutation.isPending}
            style={styles.uploadButton}
          />
        )}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>{t('review.orText')}</Text>
        <Input
          label={t('review.scriptCaption')}
          value={textContent}
          onChangeText={setTextContent}
          placeholder={t('review.textPlaceholder')}
          multiline={true}
          numberOfLines={6}
          style={styles.textArea}
        />
        <Button
          title={t('review.analyzeText')}
          onPress={handleTextSubmit}
          loading={textMutation.isPending}
        />
      </Card>

      {reviewResult && (
        <>
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{t('review.result')}</Text>
            <View style={styles.overallBox}>
              <Text style={styles.overallLabel}>{t('review.overallScore')}</Text>
              <Text style={styles.overallValue}>{reviewResult.overallScore}/100</Text>
            </View>

            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>{t('review.clarity')}</Text>
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, { width: `${reviewResult.clarityScore}%` }]} />
              </View>
              <Text style={styles.scoreValue}>{reviewResult.clarityScore}</Text>
            </View>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>{t('review.relevance')}</Text>
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, { width: `${reviewResult.relevanceScore}%` }]} />
              </View>
              <Text style={styles.scoreValue}>{reviewResult.relevanceScore}</Text>
            </View>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>{t('review.trust')}</Text>
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, { width: `${reviewResult.trustScore}%` }]} />
              </View>
              <Text style={styles.scoreValue}>{reviewResult.trustScore}</Text>
            </View>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>CTA</Text>
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, { width: `${reviewResult.ctaScore}%` }]} />
              </View>
              <Text style={styles.scoreValue}>{reviewResult.ctaScore}</Text>
            </View>
          </Card>

          {reviewResult.summary ? (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>{t('review.summary')}</Text>
              <Text style={styles.summaryText}>{reviewResult.summary}</Text>
            </Card>
          ) : null}

          {reviewResult.transcription ? (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>{t('review.transcription')}</Text>
              <Text style={styles.summaryText}>{reviewResult.transcription}</Text>
            </Card>
          ) : null}

          {reviewResult.suggestions && reviewResult.suggestions.length > 0 ? (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>{t('review.suggestions')}</Text>
              {reviewResult.suggestions.map((suggestion, index) => (
                <View key={`${suggestion.category || 'suggestion'}-${index}`} style={styles.suggestionItem}>
                  <Text style={styles.suggestionCategory}>
                    {(suggestion.category || suggestion.type || 'TIP').toUpperCase()}
                  </Text>
                  <Text style={styles.suggestionText}>{suggestion.text}</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      )}
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  card: {
    marginBottom: 20,
  },
  historyButton: {
    marginTop: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: colors.text.primary,
    marginBottom: 16,
  },
  fileName: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 12,
  },
  uploadButton: {
    marginTop: 16,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  overallBox: {
    backgroundColor: colors.dark.bg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center' as const,
  },
  overallLabel: {
    color: colors.text.secondary,
    fontSize: 12,
    marginBottom: 4,
  },
  overallValue: {
    color: colors.text.primary,
    fontSize: 26,
    fontWeight: '700' as const,
  },
  scoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 10,
  },
  scoreLabel: {
    color: colors.text.secondary,
    width: 72,
    fontSize: 13,
  },
  scoreTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.dark.bg,
    borderRadius: 99,
    overflow: 'hidden' as const,
    marginHorizontal: 8,
  },
  scoreFill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
  },
  scoreValue: {
    color: colors.text.primary,
    width: 30,
    textAlign: 'right' as const,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  summaryText: {
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  suggestionItem: {
    backgroundColor: colors.dark.bg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  suggestionCategory: {
    color: colors.brand.primary,
    fontSize: 11,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  suggestionText: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
});
