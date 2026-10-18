// navigation/AppNavigator.js
import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import FeedScreen from '../screens/FeedScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SearchScreen from '../screens/SearchScreen';
import styles from '../styles.js'; // Import the styles
import colors from '../styles.js'; // Import the color palette from s

const Stack = createStackNavigator();

// Custom header buttons component
const HeaderButtons = ({ navigation }) => {
    return (
        <View style={styles.headerButtonsContainer}>
            <TouchableOpacity
                onPress={() => navigation.navigate('Feed')}
                style={styles.headerButton}
            >
                <Text style={styles.headerButtonText}>Feed</Text>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={() => navigation.navigate('Profile')}
                style={styles.headerButton}
            >
                <Text style={styles.headerButtonText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={() => navigation.navigate('Search')}
                style={styles.headerButton}
            >
                <Text style={styles.headerButtonText}>Search</Text>
            </TouchableOpacity>
        </View>
    );
};

const AppNavigator = () => {
    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={({ navigation }) => ({
                    headerStyle: {
                        backgroundColor: '#292e33',  // navbar background color
                    },
                    headerTintColor: '#fff',  // wirdwatcher header in top left
                    headerTitleStyle: {
                        fontWeight: 'bold',
                        fontFamily: 'Fredoka_SemiBold',
                    },
                    headerLeft: () => null, // Remove the back button
                    headerRight: () => (
                        <HeaderButtons navigation={navigation} />
                    ),
                })}
            >
                <Stack.Screen
                    name="Feed"
                    component={FeedScreen}
                    options={{ headerTitle: 'wirdwatcher' }}
                />
                <Stack.Screen
                    name="Profile"
                    component={ProfileScreen}
                    options={{ headerTitle: 'wirdwatcher' }}
                />
                <Stack.Screen
                    name="Search"
                    component={SearchScreen}
                    options={{ headerTitle: 'wirdwatcher' }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default AppNavigator;
