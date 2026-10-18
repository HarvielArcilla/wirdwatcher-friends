import React, { useState, useEffect, useContext } from 'react';
import { View, Text, FlatList, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import styles from '../styles.js'; // Import the styles
import { AuthContext } from '../AuthContext';

const ProfileScreen = () => {
  const [ratingsData, setRatingsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, signOut } = useContext(AuthContext);

  const [numRatings, setNumRatings] = useState(0);
  const [averageRating, setAverageRating] = useState(0);
  const [medianRating, setMedianRating] = useState(0);
  const [top5Words, setTop5Words] = useState([]);

  useEffect(() => {
    // Enable scrolling on the body when the ProfileScreen is mounted
    document.body.style.overflow = 'auto';

    // Cleanup: revert overflow when component unmounts
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const fetchRatings = async () => {
      try {
        const response = await fetch(`https://wirdwatcher.ue.r.appspot.com/user-ratings/${user.uid}`);
        const data = await response.json();
        const ratings = data.ratings;

        const formattedRatings = data.ratings.map(
          (item) => `${item.word}: ${item.rating.toFixed(2)}`
        );

        setRatingsData(formattedRatings);
        setNumRatings(ratings.length);

        const totalRatings = ratings.reduce((sum, item) => sum + item.rating, 0);
        const avgRating = totalRatings / ratings.length;
        setAverageRating(avgRating.toFixed(2));

        const sortedRatings = [...ratings].sort((a, b) => a.rating - b.rating);
        const midIndex = Math.floor(sortedRatings.length / 2);
        const median = sortedRatings.length % 2 === 0
          ? (sortedRatings[midIndex - 1].rating + sortedRatings[midIndex].rating) / 2
          : sortedRatings[midIndex].rating;
        setMedianRating(median);

        const sortedByRating = [...ratings].sort((a, b) => b.rating - a.rating);
        const top5 = sortedByRating.slice(0, 5).map(item => `${item.word}: ${item.rating.toFixed(1)}`);
        setTop5Words(top5);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRatings();
  }, []);


  const accountName = user.displayName;
  const favoriteWords = top5Words;

  return (
    <View style={styles.fullContainer}>
    <SafeAreaView style={styles.container}>
      <ScrollView 
    style={{ flex: 1 }}
    contentContainerStyle={styles.scrollContainer}
    showsVerticalScrollIndicator={true}
  >
        <View style={styles.splitContainer}>
        {/* Account Information */}
        <View style={styles.mainContent}>
          <Text style={styles.wordText}>{accountName}</Text>
          <Text style={styles.textInfoHeader}>Favorite Words</Text>
          <View style={styles.showcase}>
            {favoriteWords.map((word, index) => (
              <Text key={index} style={styles.favoriteWord}>{word}</Text>
            ))}
          </View>
        </View>

        {/* Sidebar Information */}
        <View style={styles.r_sidebarBox}>
          <Text style={styles.textInfoHeader}>Words Rated:</Text>
          <Text style={styles.textInfoContent}>{numRatings}</Text>
          <Text style={styles.textInfoHeader}>Average Rating:</Text>
          <Text style={styles.textInfoContent}>{averageRating}</Text>
          <Text style={styles.textInfoHeader}>Median Rating:</Text>
          <Text style={styles.textInfoContent}>{medianRating}</Text>
        </View>
        </View>

        {/* All Rated Words Section */}
        <View style={styles.allRatingsSection}>
          <Text style={styles.textInfoHeader}>All Rated Words:</Text>
          <View style={styles.showcase}>
            {ratingsData.map((word, index) => (
              <Text key={index} style={styles.favoriteWord}>{word}</Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
    </View>
  );
};

export default ProfileScreen;