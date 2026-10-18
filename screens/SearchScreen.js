import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import styles from '../styles.js'; // Import shared styles

const SearchScreen = () => {
    const [query, setQuery] = useState('');

    return (
        <View style={styles.mainContent}>
            {/* Search Bar */}
            <Text style={styles.textInfoHeader}>Search for a word.</Text>
            <TextInput
                style={styles.searchBar}
                placeholder="Coming Soon..."
                placeholderTextColor="#aaa"
                value={query}
                onChangeText={setQuery}
            />
        </View>
    );
};

export default SearchScreen;
