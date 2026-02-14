import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function Model3DView({ url }: { url: string }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const html = useMemo(() => {
    if (!url) return '<html><body></body></html>';

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden;}
      model-viewer{width:100%;height:100%;background:transparent;outline:none;}
      .msg{position:absolute;left:0;right:0;bottom:10px;text-align:center;
        font-family:-apple-system,system-ui,Segoe UI,Roboto,Arial;
        font-size:12px;color:rgba(255,255,255,0.65);}
      .wrap{position:relative;width:100%;height:100%;}
    </style>
    <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
  </head>
  <body>
    <div class="wrap">
      <model-viewer
        id="mv"
        src="${url}"
        camera-controls
        auto-rotate
        rotation-per-second="18deg"
        shadow-intensity="0.4"
        exposure="1.0"
        loading="eager"
        reveal="auto"
        crossorigin="anonymous"
      ></model-viewer>
      <div class="msg">Przeciągnij aby obrócić • Szczypnij aby przybliżyć</div>
    </div>
    <script>
      const mv = document.getElementById('mv');
      const send = (type, payload) => {
        try { window.ReactNativeWebView.postMessage(JSON.stringify({type, payload})); } catch(e){}
      };
      mv.addEventListener('load', () => send('loaded', true));
      mv.addEventListener('error', (e) => {
        const msg =
          (e && e.detail && e.detail.sourceError && e.detail.sourceError.message)
            ? e.detail.sourceError.message
            : 'Model error';
        send('error', msg);
      });
    </script>
  </body>
</html>`;
  }, [url]);

  return (
    <View style={styles.wrap}>
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={(ev) => {
          try {
            const data = JSON.parse(ev.nativeEvent.data || '{}');
            if (data.type === 'loaded') {
              setLoading(false);
              setErr(null);
            }
            if (data.type === 'error') {
              setLoading(false);
              setErr(String(data.payload || 'Nie udało się załadować modelu.'));
            }
          } catch {}
        }}
        onError={(e) => {
          setLoading(false);
          setErr(e?.nativeEvent?.description || 'WebView error');
        }}
        onLoadStart={() => {
          setLoading(true);
          setErr(null);
        }}
        style={styles.web}
      />

      {loading ? (
        <View style={styles.overlay}>
          <ActivityIndicator />
        </View>
      ) : null}

      {err ? (
        <View style={styles.err}>
          <Text style={styles.errTitle}>Błąd modelu 3D</Text>
          <Text style={styles.errMsg} numberOfLines={4}>{err}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 260, width: '100%', borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.03)' },
  web: { backgroundColor: 'transparent' },
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  err: { position: 'absolute', left: 10, right: 10, bottom: 10, padding: 10, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.18)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' },
  errTitle: { color: '#F8FAFC', fontWeight: '900', marginBottom: 4 },
  errMsg: { color: 'rgba(248,250,252,0.8)', fontSize: 12 },
});
