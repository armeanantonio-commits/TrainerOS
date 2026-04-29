import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/hooks/useI18n';
import { nicheAPI } from '@/services/api';

interface LocalizedNicheProfileInput {
  niche?: string | null;
  icpProfile?: unknown;
  positioningMessage?: string | null;
  enabled?: boolean;
}

function normalizeProfileText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value == null) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildCacheKey(
  language: 'ro' | 'en',
  niche: string,
  icpProfileText: string,
  positioningMessage: string
) {
  return `traineros:niche-profile-translation:${language}:${encodeURIComponent(
    JSON.stringify({ niche, icpProfileText, positioningMessage })
  )}`;
}

export function useLocalizedNicheProfile({
  niche,
  icpProfile,
  positioningMessage,
  enabled = true,
}: LocalizedNicheProfileInput) {
  const { language } = useI18n();

  const normalizedNiche = normalizeProfileText(niche);
  const normalizedIcpProfileText = normalizeProfileText(icpProfile);
  const normalizedPositioningMessage = normalizeProfileText(positioningMessage);
  const hasProfileContent =
    !!normalizedNiche || !!normalizedIcpProfileText || !!normalizedPositioningMessage;

  const query = useQuery({
    queryKey: [
      'localized-niche-profile',
      language,
      normalizedNiche,
      normalizedIcpProfileText,
      normalizedPositioningMessage,
    ],
    enabled: enabled && hasProfileContent,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const cacheKey = buildCacheKey(
        language,
        normalizedNiche,
        normalizedIcpProfileText,
        normalizedPositioningMessage
      );

      try {
        const cached = window.localStorage.getItem(cacheKey);
        if (cached) {
          return JSON.parse(cached) as {
            niche: string;
            icpProfile: string;
            positioningMessage: string;
          };
        }
      } catch {
        // Ignore cache read issues and fall back to the API call.
      }

      const { data } = await nicheAPI.translateProfile({
        niche: normalizedNiche,
        idealClient: normalizedIcpProfileText,
        positioning: normalizedPositioningMessage,
        targetLanguage: language,
      });

      const translatedProfile = {
        niche: typeof data?.profile?.niche === 'string' ? data.profile.niche.trim() : normalizedNiche,
        icpProfile:
          typeof data?.profile?.icpProfile === 'string'
            ? data.profile.icpProfile.trim()
            : normalizedIcpProfileText,
        positioningMessage:
          typeof data?.profile?.positioningMessage === 'string'
            ? data.profile.positioningMessage.trim()
            : normalizedPositioningMessage,
      };

      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(translatedProfile));
      } catch {
        // Ignore cache write issues.
      }

      return translatedProfile;
    },
  });

  return {
    niche: query.data?.niche || normalizedNiche,
    icpProfileText: query.data?.icpProfile || normalizedIcpProfileText,
    positioningMessage: query.data?.positioningMessage || normalizedPositioningMessage,
    isLoading: query.isLoading,
  };
}
