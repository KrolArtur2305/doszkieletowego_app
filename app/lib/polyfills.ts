import "react-native-url-polyfill/auto";

// Metro próbuje rozwi¹zaæ ten import – jeœli paczki nie ma, sypie siê bundling.
// Mamy j¹ w deps, ale na wszelki wypadek wrap w try/catch.
try {
  require("web-streams-polyfill/ponyfill/es6");
} catch {}

