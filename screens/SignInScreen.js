import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { app } from '../firebase/firebase'; // Import Firebase configuration

const SignInScreen = () => {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const signIn = async () => {
    try {
      const auth = getAuth(app);

      let email = emailOrUsername;

      // Check if input is an email or username
      if (!email.includes('@')) {
        // If it's not an email, fetch the email associated with the username from Firestore
        // This is a placeholder for fetching the email from the database
        // Assuming you have a function to fetch email by username
        email = await fetchEmailByUsername(emailOrUsername);
      }

      // Now attempt to sign in with the email and password
      await signInWithEmailAndPassword(auth, email, password);

      // Redirect to another page (e.g., dashboard or home)
      navigate('/dashboard');
    } catch (error) {
      console.error(error.message);
      alert('Error signing in: ' + error.message);
    }
  };

  // Placeholder function to fetch email by username (replace with your actual database query)
  const fetchEmailByUsername = async (username) => {
    // You can replace this with an actual Firestore query or Realtime Database query to fetch the email
    // Example: const db = getFirestore(app);
    // const docRef = doc(db, 'users', username);
    // const docSnap = await getDoc(docRef);
    // return docSnap.exists() ? docSnap.data().email : null;
    return `${username}@example.com`; // Fake email for demonstration
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Welcome Back</h1>
      <input
        type="text"
        placeholder="Email"
        value={emailOrUsername}
        onChange={(e) => setEmailOrUsername(e.target.value)}
        style={styles.input}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={styles.input}
      />
      <button onClick={signIn} style={styles.button}>Sign In</button>
      <p style={styles.text}>
        Don't have an account?{' '}
        <span onClick={() => navigate('/signup')} style={styles.link}>
          Create One
        </span>
      </p>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh', // Ensures the container fills the full viewport height
    width: '100vw',  // Ensures the container fills the full viewport width
    backgroundColor: '#f4f4f4',
    fontFamily: 'Fredoka_Regular',
    padding: '20px',
    boxSizing: 'border-box',
  },
  title: {
    fontFamily: 'Fredoka_Bold',
    fontSize: '2rem',
    color: '#333',
    marginBottom: '20px',
    textAlign: 'center',
  },
  input: {
    width: '100%',     // Take up the full width available
    maxWidth: '400px', // Limit width for larger screens
    padding: '12px',
    marginBottom: '15px',
    borderRadius: '5px',
    border: '1px solid #ccc',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',     // Take up the full width available
    maxWidth: '400px', // Limit width for larger screens
    padding: '12px',
    backgroundColor: '#4CAF50',
    border: 'none',
    borderRadius: '5px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  text: {
    marginTop: '20px',
    color: '#777',
    fontSize: '1rem',
    textAlign: 'center',
  },
  link: {
    color: '#4CAF50',
    cursor: 'pointer',
  },
};

export default SignInScreen;