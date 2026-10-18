import React, { useState, useRef, useEffect, useContext } from 'react';
import { View, Text, TextInput, Animated, Keyboard, ScrollView, TouchableOpacity } from 'react-native';
import styles from '../styles.js';
import { Audio } from 'expo-av';
import { AuthContext } from '../AuthContext';

const FeedScreen = () => {
  const [wordData, setWordData] = useState({ word: 'Loading...', wordId: "", definition: "" });
  const [inputValue, setInputValue] = useState('');
  const [animationClass, setAnimationClass] = useState(new Animated.Value(0));
  const inputRef = useRef(null);
  const [goodSound, setGoodSound] = useState(null);
  const [badSound, setBadSound] = useState(null);
  const [hasRated, setHasRated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user, signOut } = useContext(AuthContext);

  useEffect(() => {
    inputRef.current?.focus();
    fetchRandomWord();
  }, []);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus(); // Refocus every time inputValue changes
    }
  }, [inputValue]);

  useEffect(() => {
    const loadSounds = async () => {
      try {
        const { sound: loadedGoodSound } = await Audio.Sound.createAsync(
          require('../assets/audio/poole_rsvp.m4a')
        );
        setGoodSound(loadedGoodSound);

        const { sound: loadedBadSound } = await Audio.Sound.createAsync(
          require('../assets/audio/poole_cancel.m4a')
        );
        setBadSound(loadedBadSound);
      } catch (error) {
        console.error('Error loading sounds:', error);
      }
    };

    loadSounds();

    return () => {
      if (goodSound) goodSound.unloadAsync();
      if (badSound) badSound.unloadAsync();
    };
  }, []);

  const fetchRandomWord = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('https://wirdwatcher.ue.r.appspot.com/random-word', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        mode: 'cors',
      });

      if (!response.ok) throw new Error('Failed to fetch word');
      const data = await response.json();
      setWordData({
        word: data.word,
        wordId: data.wordId,
        definition: data.definition || ['No definitions available.'],
      })
      setHasRated(false)
      setInputValue('');
    } catch (error) {
      console.error('Error fetching word:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const submitRating = async (rating) => {
    try {
      const response = await fetch('https://wirdwatcher.ue.r.appspot.com/add-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          wordId: wordData.wordId,
          rating: rating,
        }),
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to submit rating');
      console.log('Rating submitted successfully');
    } catch (error) {
      console.error('Error submitting rating:', error);
    }
  };

  const handleInputChange = (value) => {
    value = value.replace(/\./g, '');
    if (value.length === 1) {
      const firstDigit = value[0];
      if (firstDigit >= '0' && firstDigit < '5') {
        setInputValue(firstDigit + '.');
      } else if (firstDigit === '5') {
        setInputValue('5.0');
      }
    } else if (value.length === 2) {
      const firstDigit = value[0];
      const secondDigit = value[1];
      if (secondDigit >= '0' && secondDigit <= '9') {
        setInputValue(firstDigit + '.' + secondDigit);
      }
    } else if (value === '') {
      setInputValue('');
    }
  };

  const handleKeyDown = async ({ nativeEvent: { key, preventDefault } }) => {

    if (key === 'Enter') {
      
      if (hasRated) {
        fetchRandomWord();
      }
      else if (inputValue.length === 3) {

      const numericValue = parseFloat(inputValue);

      Animated.sequence([
        Animated.timing(animationClass, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(animationClass, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(animationClass, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();

      await submitRating(numericValue);
      setHasRated(true);

      if (numericValue > 4.0 && goodSound) {
        goodSound.playAsync().catch((error) => console.log('Error playing good sound:', error));
      } else if (numericValue <= 1.0 && badSound) {
        badSound.playAsync().catch((error) => console.log('Error playing bad sound:', error));
      }

      if (inputRef.current) {
        inputRef.current.focus();  // Refocus the input
      }
    }

    } else if (key === 'Backspace' && (inputValue.length === 3 || inputValue.length === 2)) {
      setInputValue('');
    }
  };

  return (
    <View style={styles.splitContainer}>
      <View style={styles.mainContent}>
        {isLoading ? (
          <Text style={styles.wordText}>Loading...</Text>
        ) : (
          <>
            <Text style={styles.wordText}>{wordData.word}</Text>
            <View style={styles.inputContainer}>
              <Animated.View
                style={{
                  transform: [
                    {
                      scale: animationClass.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.2],
                      }),
                    },
                  ],
                }}
              >
                <TextInput
                  ref={inputRef}
                  style={styles.textInput}
                  value={inputValue}
                  onChangeText={handleInputChange}
                  onKeyPress={handleKeyDown}
                  maxLength={3}
                  placeholder="0.0"
                  placeholderTextColor={'#5a6570'}
                  keyboardType="numeric"
                  onSubmitEditing={Keyboard.dismiss}
                />
              </Animated.View>
            </View>
            <View style={styles.definitions}>
              <ScrollView contentContainerStyle={{ paddingRight: 10, maxHeight: 200 }}>
                <Text style={styles.textInfoHeader}>Definitions:</Text>
                <Text style={styles.textInfoContent}>{wordData.definition}</Text>
              </ScrollView>
            </View>
            <TouchableOpacity style={styles.nextWordButton} onPress={fetchRandomWord}>
              <Text style={[styles.textInfoHeader, { color: '#3a4148', textAlign: 'center' }]}>Next Word</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.r_sidebarBox}>
        <Text style={styles.textInfoHeader}>Friends Ratings:</Text>
        <Text style={styles.textInfoContent}> Coming Soon</Text>
        <Text style={styles.textInfoHeader}>Global Rating:</Text>
        <Text style={styles.textInfoContent}> Coming Soon</Text>
        <Text style={styles.textInfoHeader}>Rank:</Text>
        <Text style={styles.textInfoContent}> Coming Soon</Text>
      </View>
    </View>
  );
};

export default FeedScreen;