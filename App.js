// App.js
import React from 'react';
import { useFonts } from 'expo-font';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider, AuthContext } from './AuthContext';
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import AppNavigator from './navigation/AppNavigator';

function App() {
  const [fontsLoaded] = useFonts({
    "Fredoka_Regular": require("./assets/fonts/Fredoka-Regular.ttf"),
    "Fredoka_Medium": require("./assets/fonts/Fredoka-Medium.ttf"),
    "Fredoka_SemiBold": require("./assets/fonts/Fredoka-SemiBold.ttf"),
    "Fredoka_Bold": require("./assets/fonts/Fredoka-Bold.ttf"),
  });

  if (!fontsLoaded) {
    return null; // Ensure fonts are loaded before rendering
  }

  return (
    <AuthProvider>
      <Router>
        <AuthContext.Consumer>
          {({ user, signIn, signUp }) => (
            user ? (
              <AppNavigator />
            ) : (
              <Routes>
                <Route path="/" element={<SignInScreen signIn={signIn} />} />
                <Route path="/signup" element={<SignUpScreen signUp={signUp} />} />
              </Routes>
            )
          )}
        </AuthContext.Consumer>
      </Router>
    </AuthProvider>
  );
}

export default App;