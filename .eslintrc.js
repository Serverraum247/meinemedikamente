module.exports = {
  root: true,
  extends: ['@react-native'],
  plugins: ['react-native-a11y'],
  rules: {
    // Interaktive Elemente muessen accessibilityProps haben (Label, Role)
    'react-native-a11y/has-accessibility-props': 'error',
    // accessibilityHint bei nicht-offensichtlichen Aktionen
    // Auf 'off' weil einfache Inputs (Name, Bestand) keinen Hint brauchen
    'react-native-a11y/has-accessibility-hint': 'off',
    // Gueltige Werte fuer accessibilityRole
    'react-native-a11y/has-valid-accessibility-role': 'error',
    // Gueltige Werte fuer accessibilityState
    'react-native-a11y/has-valid-accessibility-state': 'warn',
    // Keine verschachtelten Touchables
    'react-native-a11y/no-nested-touchables': 'error',
  },
};
