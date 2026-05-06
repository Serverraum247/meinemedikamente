// React Native Config – Firebase auf iOS exkludieren
// @react-native-firebase v24 ist inkompatibel mit RN 0.85 Prebuilt Pods auf iOS
// (non-modular header errors, fehlende RCT-Typ-Deklarationen)
// Cloud-Backup ist nur auf Android verfuegbar.
module.exports = {
  dependencies: {
    '@react-native-firebase/app': {
      platforms: {
        ios: null, // Auf iOS nicht linken
      },
    },
    '@react-native-firebase/auth': {
      platforms: {
        ios: null,
      },
    },
    '@react-native-firebase/firestore': {
      platforms: {
        ios: null,
      },
    },
  },
};
