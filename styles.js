import { StyleSheet } from 'react-native';

const colors = {
    background: '#3a4148',
    darker_background: '#292e33',
    secondary: '#e9edec',
    highlight: '#e8c686'
}

const styles = StyleSheet.create({

    /**CONTAINERS */
    container: {  // DEFAULT CONTAINER
        backgroundColor: colors.background
    },
    fullContainer: {
        backgroundColor: colors.background,
        flex: 1
    },
    splitContainer: {  // DEFAULT CONTAINER
        flexDirection: 'row',
        flex: 1,
        backgroundColor: colors.background,
    },
    mainContent: {  // CONTAINER TO CENTER ITEMS
        flex: 2,
        alignItems: 'center',
        padding: '5%',
        backgroundColor: colors.background,
    },
    definitions: {
        maxWidth: '100%',
        padding: '1%',
        borderWidth: 1,
        borderColor: colors.secondary,
        borderRadius: 20,
        marginTop: '5%',  // Space above the definitions section
        marginBottom: '10%',
        backgroundColor: colors.background,
        justifyContent: 'flex-start',  // Align content from top
        overflow: 'auto',
    },
    r_sidebarBox: {  // CONTAINER FOR RIGHT SIDE OF SCREEN (WORD INFO, ACCT INFO)
        padding: '1%',
        flex:1,
        borderWidth: 1,
        borderColor: colors.secondary,
        borderRadius: 20,
        marginTop: '2.5%',
        marginBottom: '2.5%',
        marginRight: '2.5%',
        overflow: 'scroll',
    },
    scrollContainer: {
        flexGrow: 1,
        flex: 10,
        paddingBottom: 20,
      },
      allRatingsSection: {
        backgroundColor: colors.background,
        alignItems: 'center',
      },

    /**GENERAL TEXT */
    wordText: {  // FOCUS TEXT (WORD, PROFILE NAME)
        fontSize: 100,
        fontWeight: 'bold',
        fontFamily: 'Fredoka_SemiBold',
        paddingBottom: '1%',
        color: colors.highlight,
        flexWrap: 'wrap',
        flexDirection: 'row',
        maxWidth: '100%',
    },
    textInput: {  // RATING INPUT (0.0)
        color: colors.secondary,
        fontSize: 60,
        backgroundColor: colors.background,
        width: 130,
        textAlign: 'left',
        borderBottomWidth: 6,
        borderBottomColor: colors.secondary,
        padding: 5,
        letterSpacing: 2,
        fontFamily: 'Fredoka_SemiBold',
    },
    textInfoHeader: {  // GENERAL HEADER TEXT
        fontSize: 30,
        fontWeight: 'bold',
        marginBottom: 10,
        fontFamily: 'Fredoka_SemiBold',
        color: colors.secondary,
    },
    textInfoContent: {  // GENERAL DEFAULT TEXT
        fontSize: 25,
        marginBottom: 10,
        fontFamily: 'Fredoka_Regular',
        color: colors.secondary,
    },
    footer: {
        marginTop: 20, // Space above the footer
    },
    
    /**HEADER CONTENT */
    headerButtonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: 250,
        right: 20,
        //color: colors.background,
    },
    headerButton: {
        marginHorizontal: 10,
    },
    headerButtonText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: 'Fredoka_SemiBold',
    },

    /**FEED ITEMS */
    nextWordButton: {
        position: 'absolute',
        bottom: '5%',
        backgroundColor: colors.highlight,
        width: '87.5%',
        height: '10%',
        alignSelf: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.secondary,
        borderRadius: 20,
    },
    hidden: {
        display: 'none',
    },

    /**PROFILE ITEMS */
    showcase: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.secondary,
        maxWidth: '90%',
        padding: 5,
        borderRadius: 20,
    },
    favoriteWord: {
        //alignContent: 'center',
        fontSize: 20,
        margin: 5,
        padding: 5,
        borderColor: colors.secondary,
        color: colors.secondary,
        backgroundColor: colors.darker_background,
        borderWidth: 1,
        borderRadius: 10,
        maxWidth: 460,
        fontFamily: 'Fredoka_SemiBold',
    },

    /**SEARCH SCREEN ITEMS*/
    searchBar: {
        //left: '50%',
        height: 100,
        borderWidth: 1,
        borderColor: '#e9edec',
        borderRadius: 20,
        paddingHorizontal: 15,
        fontSize: 36,
        color: '#fff',
        backgroundColor: '#3a4148',
        width: '50%',
    }
});

export default styles;