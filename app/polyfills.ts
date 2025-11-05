import "react-native-url-polyfill/auto";

// Metro próbuje rozwiązać ten import – jeśli paczki nie ma, sypie się bundling.
// Mamy ją w deps, ale na wszelki wypadek wrap w try/catch.
try {
  require("web-streams-polyfill/ponyfill/es6");
} catch {}
