import { Alert } from 'react-native';

type PremiumNavigation = {
  navigate: (screen: 'Premium') => void;
};

export const PREMIUM_REQUIRED_TITLE = 'Nur mit Premium möglich';

export function showPremiumRequiredAlert(
  message: string,
  navigation?: PremiumNavigation,
) {
  const buttons = navigation
    ? [
        { text: 'Abbrechen', style: 'cancel' as const },
        { text: 'Premium ansehen', onPress: () => navigation.navigate('Premium') },
      ]
    : [{ text: 'OK' }];

  Alert.alert(PREMIUM_REQUIRED_TITLE, message, buttons);
}
