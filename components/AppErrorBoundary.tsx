import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { reportError } from '../lib/errorReporting';

type Props = {
  children: React.ReactNode;
};

type State = {
  failed: boolean;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    void reportError(error, {
      feature: 'app',
      action: 'react_error_boundary',
      severity: 'fatal',
      metadata: {
        componentStack: info.componentStack,
      },
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#000000',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '900', textAlign: 'center' }}>
          Wystapil blad aplikacji
        </Text>
        <Text
          style={{
            color: 'rgba(255,255,255,0.62)',
            fontSize: 14,
            fontWeight: '700',
            lineHeight: 20,
            textAlign: 'center',
            marginTop: 10,
          }}
        >
          Raport zostal zapisany dla zespolu BuildIQ. Mozesz sprobowac wrocic do aplikacji.
        </Text>
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={() => this.setState({ failed: false })}
          style={{
            marginTop: 18,
            height: 44,
            paddingHorizontal: 18,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#25F0C8',
          }}
        >
          <Text style={{ color: '#022C22', fontWeight: '900' }}>Sprobuj ponownie</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
