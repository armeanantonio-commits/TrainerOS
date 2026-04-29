import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../constants/colors';
import { useI18n } from '../hooks/useI18n';

// Auth Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import ActivateAccountScreen from '../screens/ActivateAccountScreen';

// Main Screens
import DashboardScreen from '../screens/DashboardScreen';
import DailyIdeaScreen from '../screens/DailyIdeaScreen';
import ContentReviewScreen from '../screens/ContentReviewScreen';
import IdeaHistoryScreen from '../screens/IdeaHistoryScreen';
import IdeaDetailScreen from '../screens/IdeaDetailScreen';
import IdeaStructurerScreen from '../screens/IdeaStructurerScreen';
import SettingsScreen from '../screens/SettingsScreen';
import NicheFinderScreen from '../screens/NicheFinderScreen';
import NicheQuickScreen from '../screens/NicheQuickScreen';
import NicheDiscoverScreen from '../screens/NicheDiscoverScreen';
import ContentPreferencesScreen from '../screens/ContentPreferencesScreen';
import ContentCreationPreferencesScreen from '../screens/ContentCreationPreferencesScreen';
import ChatScreen from '../screens/ChatScreen';
import EmailMarketingScreen from '../screens/EmailMarketingScreen';
import ClientNutritionScreen from '../screens/ClientNutritionScreen';
import FeedbackHistoryScreen from '../screens/FeedbackHistoryScreen';
import FeedbackDetailScreen from '../screens/FeedbackDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const logoSource = require('../../assets/icon-from-frontend.png');
const navigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.dark.bg,
    card: colors.dark.panelStrong,
    border: colors.dark.borderSoft,
    primary: colors.brand.primary,
    text: colors.text.primary,
    notification: colors.brand.secondary,
  },
};

function TrainerOSHeaderTitle() {
  return (
    <View style={styles.headerBrand}>
      <View style={styles.headerLogoGlow}>
        <Image source={logoSource} style={styles.headerLogo} resizeMode="cover" />
      </View>
      <Text style={styles.headerTitle}>TrainerOS</Text>
    </View>
  );
}

function MainTabs() {
  const { t } = useI18n();
  return (
    <Tab.Navigator
      id="main-tabs"
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.dark.panelStrong,
          borderTopColor: colors.dark.borderSoft,
          height: 68,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.dark.panelStrong,
        },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
        headerTitle: () => <TrainerOSHeaderTitle />,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24, color }}>🏠</Text>,
        }}
      />
      <Tab.Screen
        name="DailyIdea"
        component={DailyIdeaScreen}
        options={{
          title: t('nav.dailyIdeaTitle'),
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24, color }}>💡</Text>,
        }}
      />
      <Tab.Screen
        name="ContentReview"
        component={ContentReviewScreen}
        options={{
          title: t('nav.review'),
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24, color }}>📱</Text>,
        }}
      />
      <Tab.Screen
        name="IdeaHistory"
        component={IdeaHistoryScreen}
        options={{
          title: t('nav.history'),
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24, color }}>📚</Text>,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: t('nav.settings'),
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 24, color }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator
      id="auth-stack"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.dark.bg },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="ActivateAccount" component={ActivateAccountScreen} />
    </Stack.Navigator>
  );
}

function MainStack() {
  const { t } = useI18n();
  return (
    <Stack.Navigator
      id="main-stack"
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.dark.panelStrong,
        },
        headerTintColor: colors.text.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.dark.bg },
        headerTitle: () => <TrainerOSHeaderTitle />,
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="NicheFinder"
        component={NicheFinderScreen}
        options={{ title: t('nav.nicheFinder') }}
      />
      <Stack.Screen
        name="NicheQuick"
        component={NicheQuickScreen}
        options={{ title: t('nav.nicheQuick') }}
      />
      <Stack.Screen
        name="NicheDiscover"
        component={NicheDiscoverScreen}
        options={{ title: t('nav.nicheDiscover') }}
      />
      <Stack.Screen
        name="ContentPreferences"
        component={ContentPreferencesScreen}
        options={{ title: t('nav.brandVoice') }}
      />
      <Stack.Screen
        name="IdeaDetail"
        component={IdeaDetailScreen}
        options={{ title: t('nav.ideaDetail') }}
      />
      <Stack.Screen
        name="IdeaStructurer"
        component={IdeaStructurerScreen}
        options={{ title: t('nav.ideaStructurer') }}
      />
      <Stack.Screen
        name="ContentCreationPreferences"
        component={ContentCreationPreferencesScreen}
        options={{ title: t('nav.contentCreation') }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: t('nav.chat') }}
      />
      <Stack.Screen
        name="EmailMarketing"
        component={EmailMarketingScreen}
        options={{ title: t('nav.emailMarketing') }}
      />
      <Stack.Screen
        name="ClientNutrition"
        component={ClientNutritionScreen}
        options={{ title: t('nav.nutrition') }}
      />
      <Stack.Screen
        name="FeedbackHistory"
        component={FeedbackHistoryScreen}
        options={{ title: t('nav.feedbackHistory') }}
      />
      <Stack.Screen
        name="FeedbackDetail"
        component={FeedbackDetailScreen}
        options={{ title: t('nav.feedbackDetail') }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {user ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogoGlow: {
    borderRadius: 14,
    shadowColor: 'rgba(114, 202, 255, 0.35)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  headerLogo: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(114, 202, 255, 0.25)',
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
