/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/navigation/AppNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockAppNavigator() {
    return React.createElement(Text, null, 'AppNavigator');
  };
});

jest.mock('../src/context/MedikamentContext', () => {
  const React = require('react');
  return {
    MedikamentProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('../src/context/PersonenContext', () => {
  const React = require('react');
  return {
    PersonenProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
